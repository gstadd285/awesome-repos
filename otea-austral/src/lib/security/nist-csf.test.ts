import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS,
  CONTROLES,
  ControlSchema,
  FUNCIONES,
  PERFIL,
  controlesDe,
  resumen,
} from "./nist-csf";

describe("estructura del CSF 2.0", () => {
  it("tiene las seis funciones y las 22 categorías", () => {
    expect(FUNCIONES.map((f) => f.codigo)).toEqual(["GV", "ID", "PR", "DE", "RS", "RC"]);
    expect(Object.keys(CATEGORIAS)).toHaveLength(22);
  });
});

describe("perfil de Otea", () => {
  it("cubre todas las funciones con al menos un control", () => {
    for (const f of FUNCIONES) {
      expect(controlesDe(f.codigo).length, f.nombre).toBeGreaterThan(0);
    }
  });

  it("no repite identificadores de control", () => {
    const ids = CONTROLES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda evidencia citada existe en el repositorio (no hay afirmaciones sin respaldo)", () => {
    const faltantes = CONTROLES.flatMap((c) =>
      c.evidencia.filter((ruta) => !existsSync(join(process.cwd(), ruta))).map((r) => `${c.id}: ${r}`),
    );
    expect(faltantes).toEqual([]);
  });

  it("no se presenta como certificación", () => {
    const textos = CONTROLES.flatMap((c) => [c.titulo, c.descripcion]).join(" ").toLowerCase();
    expect(textos).not.toMatch(/certific|cumplimiento total|100 ?%/);
  });

  it("la próxima revisión es posterior a la última", () => {
    expect(PERFIL.proximaRevision > PERFIL.revisado).toBe(true);
    expect(PERFIL.nivelObjetivo).toBeGreaterThanOrEqual(PERFIL.nivelActual);
  });

  it("resume los estados", () => {
    const r = resumen(CONTROLES);
    expect(r.implementado + r.parcial + r.objetivo).toBe(CONTROLES.length);
  });
});

describe("ControlSchema", () => {
  const base = {
    id: "PR-99",
    titulo: "Control",
    descripcion: "Descripción",
    estado: "implementado",
    subcategorias: ["PR.DS-02"],
    evidencia: ["src/proxy.ts"],
  };

  it("acepta un control válido", () => {
    expect(ControlSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza subcategorías de otra función", () => {
    expect(ControlSchema.safeParse({ ...base, subcategorias: ["DE.CM-09"] }).success).toBe(false);
  });

  it("rechaza categorías que no existen en el CSF 2.0", () => {
    expect(ControlSchema.safeParse({ ...base, subcategorias: ["PR.XX-01"] }).success).toBe(false);
  });

  it("exige evidencia salvo para objetivos", () => {
    expect(ControlSchema.safeParse({ ...base, evidencia: [] }).success).toBe(false);
    expect(ControlSchema.safeParse({ ...base, estado: "objetivo", evidencia: [] }).success).toBe(true);
  });
});
