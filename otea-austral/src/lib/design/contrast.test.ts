import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(css);
  if (!match) throw new Error(`No se encontró el token --color-${name}`);
  return match[1];
}

const AA = 4.5;

// Superficies del tema claro, incluida la franja de sombra de la luz de ventana.
const superficies = ["fondo", "fondo-sombra", "papel", "papel-alto"];
const textos = ["texto", "texto-suave", "apoyo"];

describe("contraste AA del tema claro", () => {
  for (const texto of textos) {
    for (const superficie of superficies) {
      it(`${texto} sobre ${superficie} ≥ 4.5:1`, () => {
        expect(contrastRatio(token(texto), token(superficie))).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it("el botón principal usa texto tinta sobre latón", () => {
    expect(contrastRatio(token("ink"), token("acento"))).toBeGreaterThanOrEqual(AA);
  });

  it.each(["gana", "condicionado", "pierde"])("las etiquetas %s usan texto tinta sobre su color", (estado) => {
    expect(contrastRatio(token("ink"), token(estado))).toBeGreaterThanOrEqual(AA);
  });

  it("los temas activos usan marfil sobre tinta", () => {
    expect(contrastRatio(token("ivory"), token("ink"))).toBeGreaterThanOrEqual(AA);
  });

  it("el latón y la bruma no alcanzan AA sobre el fondo: solo rellenos y decoración", () => {
    expect(contrastRatio(token("acento"), token("fondo"))).toBeLessThan(AA);
    expect(contrastRatio(token("mist"), token("fondo"))).toBeLessThan(AA);
  });

  it.each(["laton-claro", "brass", "laton-oscuro"])(
    "el botón de latón mantiene texto tinta AA en todo el degradado (%s)",
    (parada) => {
      expect(contrastRatio(token("ink"), token(parada))).toBeGreaterThanOrEqual(AA);
    },
  );

  it("el degradado del botón usa esos tokens, en ese orden", () => {
    expect(css).toMatch(
      /linear-gradient\(180deg, var\(--color-laton-claro\) 0%, var\(--color-brass\) 55%, var\(--color-laton-oscuro\) 100%\)/,
    );
  });

  it.each(["brass-deep"])("%s sirve como texto de 12 px o más sobre el lienzo claro, no sobre la sombra", (color) => {
    for (const superficie of ["fondo", "papel", "papel-alto"]) {
      expect(contrastRatio(token(color), token(superficie)), superficie).toBeGreaterThanOrEqual(AA);
    }
    expect(contrastRatio(token(color), token("fondo-sombra"))).toBeLessThan(AA);
  });
});

describe("contraste AA sobre tinta (pie, capítulo nocturno, paneles oscuros)", () => {
  it.each(["ivory", "brass", "mist", "niebla"])("%s sobre tinta ≥ 4.5:1", (texto) => {
    expect(contrastRatio(token(texto), token("ink"))).toBeGreaterThanOrEqual(AA);
  });

  it("marfil al 82 % sobre tinta, ya resuelto (#CAC8C2), pasa AA: la entrada del capítulo nocturno", () => {
    expect(token("marfil-82")).toBe("#CAC8C2");
    expect(contrastRatio(token("marfil-82"), token("ink"))).toBeGreaterThanOrEqual(AA);
  });

  it("niebla es #C9CFD8", () => {
    expect(token("niebla")).toBe("#C9CFD8");
  });

  it("el anillo de foco: tinta sobre el lienzo y latón sobre tinta (indicador no textual ≥ 3:1)", () => {
    for (const superficie of superficies) {
      expect(contrastRatio(token("ink"), token(superficie))).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(token("brass"), token("ink"))).toBeGreaterThanOrEqual(3);
  });
});

describe("controles nativos (casillas y radios): estado marcado ≥ 3:1 (WCAG 1.4.11)", () => {
  it("el latón no alcanza 3:1 sobre el lienzo claro, la tinta sí", () => {
    for (const superficie of ["fondo", "papel", "papel-alto"]) {
      expect(contrastRatio(token("brass"), token(superficie))).toBeLessThan(3);
      expect(contrastRatio(token("ink"), token(superficie))).toBeGreaterThanOrEqual(3);
    }
  });

  it("accent-color es tinta en todo el sitio y latón solo sobre tinta (.en-tinta)", () => {
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const usos = [...sinComentarios.matchAll(/([^{}]+)\{[^{}]*accent-color:\s*([^;]+);/g)].map((m) => ({
      selector: m[1].trim(),
      valor: m[2].trim(),
    }));
    expect(usos).toContainEqual({ selector: "html", valor: "var(--color-ink)" });
    for (const uso of usos.filter((u) => u.valor !== "var(--color-ink)")) {
      expect(uso.selector, uso.valor).toMatch(/^\.en-tinta$/);
    }
  });
});

describe("contrastRatio", () => {
  it("blanco sobre negro es 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
});
