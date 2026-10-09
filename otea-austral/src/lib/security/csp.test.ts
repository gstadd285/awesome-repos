import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";
import { securityHeaders } from "./headers";

function directiva(csp: string, nombre: string): string[] {
  const d = csp.split("; ").find((p) => p.startsWith(`${nombre} `) || p === nombre);
  if (!d) throw new Error(`Falta ${nombre}`);
  return d.split(" ").slice(1);
}

describe("buildCsp en producción", () => {
  const csp = buildCsp("abc123", { dev: false });

  it("solo ejecuta scripts con el nonce de la solicitud", () => {
    const scripts = directiva(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("no permite estilos en línea sin nonce", () => {
    expect(directiva(csp, "style-src")).not.toContain("'unsafe-inline'");
  });

  it("bloquea marcos, objetos y cambios de base", () => {
    expect(directiva(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directiva(csp, "object-src")).toEqual(["'none'"]);
    expect(directiva(csp, "base-uri")).toEqual(["'self'"]);
    expect(directiva(csp, "form-action")).toEqual(["'self'"]);
  });

  it("no habilita conexiones a otros orígenes (sin peticiones salientes)", () => {
    expect(directiva(csp, "connect-src")).toEqual(["'self'"]);
    expect(directiva(csp, "default-src")).toEqual(["'self'"]);
  });

  it("fuerza https en subrecursos", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp en desarrollo", () => {
  it("permite unsafe-eval para la depuración de React", () => {
    expect(directiva(buildCsp("n", { dev: true }), "script-src")).toContain("'unsafe-eval'");
  });
});

describe("generateNonce", () => {
  it("genera valores distintos de 128 bits", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});

describe("securityHeaders", () => {
  const mapa = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));

  it("incluye las cabeceras exigidas", () => {
    expect(mapa["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(mapa["X-Content-Type-Options"]).toBe("nosniff");
    expect(mapa["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(mapa["Permissions-Policy"]).toContain("camera=()");
    expect(mapa["X-Frame-Options"]).toBe("DENY");
  });
});
