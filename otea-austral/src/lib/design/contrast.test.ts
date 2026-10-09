import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio } from "./contrast";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(css);
  if (!match) throw new Error(`No se encontró el token --color-${name}`);
  return match[1];
}

const canvas = token("canvas");
const ink = token("ink");
const ivory = token("ivory");
// Superficie de vidrio (4 % de marfil) sobre el lienzo y sobre tinta.
const surfaces = {
  canvas,
  ink,
  "glass/canvas": blend(ivory, canvas, 0.04),
  "glass/ink": blend(ivory, ink, 0.04),
};

const AA = 4.5;

describe("contraste AA de los tokens", () => {
  const textos = ["ivory", "ivory-soft", "mist", "gana", "condicionado", "pierde"];

  for (const nombre of textos) {
    for (const [superficie, fondo] of Object.entries(surfaces)) {
      it(`${nombre} sobre ${superficie} ≥ 4.5:1`, () => {
        expect(contrastRatio(token(nombre), fondo)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it("el botón principal usa texto tinta sobre latón (≥ 4.5:1)", () => {
    expect(contrastRatio(ink, token("brass"))).toBeGreaterThanOrEqual(AA);
  });

  it("el marfil sobre latón no alcanza AA: por eso el botón no lleva texto claro", () => {
    expect(contrastRatio(ivory, token("brass"))).toBeLessThan(AA);
  });

  it("el latón oscuro no sirve para texto (queda solo decorativo)", () => {
    expect(contrastRatio(token("brass-deep"), canvas)).toBeLessThan(AA);
  });
});

describe("contrastRatio", () => {
  it("blanco sobre negro es 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
});
