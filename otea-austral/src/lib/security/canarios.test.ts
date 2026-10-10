import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANARIOS, MARCAS, buscarArchivosProhibidos, buscarCanarios } from "../../../scripts/lib/canarios.mjs";
import { EnvSchema } from "@/lib/env";

describe("canarios del build", () => {
  it("cada secreto falso lleva una marca y cumple el esquema de entorno (si no, el build no los leería)", () => {
    for (const valor of Object.values(CANARIOS).filter((v) => v !== "abierta")) {
      expect(MARCAS.some((m) => valor.includes(m)), valor).toBe(true);
    }
    expect(EnvSchema.safeParse({ ...CANARIOS, NODE_ENV: "development" }).success).toBe(true);
  });

  it("cubre todos los secretos del servidor que define el esquema", () => {
    const secretos = Object.keys(EnvSchema.shape).filter((k) => /(SECRET|CLAVE|KEY|DATABASE_URL)/.test(k));
    // WAITLIST_ENVIOS_DIARIOS y EMAIL_REMITENTE no son secretos; el resto debe tener su canario.
    const esperados = secretos.filter((k) => !["WAITLIST_ENVIOS_DIARIOS", "EMAIL_REMITENTE"].includes(k));
    expect(Object.keys(CANARIOS)).toEqual(expect.arrayContaining(esperados));
  });
});

describe("búsqueda en el resultado del build", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "canarios-"));
    mkdirSync(path.join(dir, "static", "chunks"), { recursive: true });
    mkdirSync(path.join(dir, "cache"));
    writeFileSync(path.join(dir, "static", "chunks", "app.js"), "console.log('limpio')");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("un build limpio no tiene hallazgos", () => {
    const r = buscarCanarios(dir);
    expect(r.hallazgos).toEqual([]);
    expect(r.revisados).toBe(1);
  });

  it("encuentra un secreto falso en cualquier archivo, también en binarios, y dice cuál", () => {
    writeFileSync(path.join(dir, "static", "chunks", "filtrado.js"), `var k="${CANARIOS.RESEND_API_KEY}"`);
    writeFileSync(path.join(dir, "datos.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("xx CANARIO_USUARIO xx")]));
    const { hallazgos } = buscarCanarios(dir);
    expect(hallazgos).toContainEqual({ ruta: "static/chunks/filtrado.js", marca: "CANARIO" });
    expect(hallazgos).toContainEqual({ ruta: "datos.bin", marca: "CANARIO" });
  });

  it("no mira las carpetas que se le piden omitir (la caché de trabajo)", () => {
    writeFileSync(path.join(dir, "cache", "entrada"), CANARIOS.ADMIN_SESION_SECRETO);
    expect(buscarCanarios(dir, { omitir: ["cache"] }).hallazgos).toEqual([]);
    expect(buscarCanarios(dir).hallazgos).toHaveLength(1);
  });

  it("detecta mapas de código en lo que se sirve al público y archivos de entorno en cualquier parte", () => {
    writeFileSync(path.join(dir, "static", "chunks", "app.js.map"), "{}");
    writeFileSync(path.join(dir, ".env.production"), "X=1");
    writeFileSync(path.join(dir, "cache", "x.map"), "{}");
    // Los mapas del servidor son del build (no se sirven): no cuentan.
    mkdirSync(path.join(dir, "server", "chunks"), { recursive: true });
    writeFileSync(path.join(dir, "server", "chunks", "ssr.js.map"), "{}");
    // La copia de lo público dentro de `standalone` sí cuenta.
    mkdirSync(path.join(dir, "standalone", ".next", "static"), { recursive: true });
    writeFileSync(path.join(dir, "standalone", ".next", "static", "otro.js.map"), "{}");
    expect(buscarArchivosProhibidos(dir, { omitir: ["cache"] }).sort()).toEqual([
      ".env.production",
      "standalone/.next/static/otro.js.map",
      "static/chunks/app.js.map",
    ]);
  });
});
