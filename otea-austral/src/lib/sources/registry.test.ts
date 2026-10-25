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

  it("no asume condiciones de reutilización: cada una dice si está pendiente, por confirmar o verificada (con fecha)", () => {
    // `docs/fuentes-pendientes.md` explica cada estado. «Por confirmar» resume lo leído en extractos del sitio
    // oficial sin abrir la página; «Verificadas el AAAA-MM-DD:» exige haberla leído completa.
    const estado = /^(pendiente de verificar$|Por confirmar en la página \(|Verificadas el \d{4}-\d{2}-\d{2}: )/;
    for (const f of REGISTRO_FUENTES) expect(f.condiciones_reutilizacion, f.id).toMatch(estado);
  });

  it("rss o api solo con un feed verificado, y el acceso manual sin feeds", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    for (const f of REGISTRO_FUENTES) {
      if (f.acceso === "manual") expect(f.feeds, f.id).toEqual([]);
      else expect(f.feeds.length, f.id).toBeGreaterThan(0);
      for (const feed of f.feeds) expect(feed.verificado <= hoy, `${f.id}: ${feed.url}`).toBe(true);
    }
  });

  it("ningún feed se repite entre fuentes", () => {
    const urls = REGISTRO_FUENTES.flatMap((f) => f.feeds.map((x) => new URL(x.url).href));
    expect(new Set(urls).size).toBe(urls.length);
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
