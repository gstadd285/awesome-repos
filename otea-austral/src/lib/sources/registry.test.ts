import { describe, expect, it } from "vitest";
import { REGISTRO_FUENTES, fuentesActivas, fuentesPorAmbito } from "./registry";

describe("registro de fuentes", () => {
  it("carga las 17 fuentes primarias pedidas", () => {
    expect(REGISTRO_FUENTES).toHaveLength(17);
    expect(REGISTRO_FUENTES.every((f) => f.tipo === "primaria")).toBe(true);
  });

  it("no incluye prensa hasta que se apruebe", () => {
    expect(REGISTRO_FUENTES.some((f) => f.tipo === "prensa")).toBe(false);
  });

  it("no asume condiciones de reutilización", () => {
    expect(REGISTRO_FUENTES.every((f) => f.condiciones_reutilizacion === "pendiente de verificar")).toBe(true);
  });

  it("usa acceso manual: no hay feeds sin verificar", () => {
    expect(REGISTRO_FUENTES.every((f) => f.acceso === "manual")).toBe(true);
  });

  it("no repite identificadores ni organismos", () => {
    const ids = REGISTRO_FUENTES.map((f) => f.id);
    const organismos = REGISTRO_FUENTES.map((f) => f.organismo);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(organismos).size).toBe(organismos.length);
  });

  it("todas las URL son https o están vacías", () => {
    for (const f of REGISTRO_FUENTES) {
      expect(f.url_base === "" || f.url_base.startsWith("https://")).toBe(true);
    }
  });

  it("agrupa todas las activas sin perder ninguna", () => {
    const total = fuentesPorAmbito().reduce((n, g) => n + g.fuentes.length, 0);
    expect(total).toBe(fuentesActivas().length);
  });
});
