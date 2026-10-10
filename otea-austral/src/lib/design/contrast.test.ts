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
});

describe("contrastRatio", () => {
  it("blanco sobre negro es 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
});
