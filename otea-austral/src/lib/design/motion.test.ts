import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_INDICE } from "@/components/motion/TextoEnMovimiento";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Quita cada bloque `{…}` que sigue a `cabecera` (con llaves anidadas). */
function quitarBloques(texto: string, cabecera: RegExp): string {
  let resultado = texto;
  for (;;) {
    const m = cabecera.exec(resultado);
    if (!m) return resultado;
    const apertura = resultado.indexOf("{", m.index);
    let nivel = 0;
    let fin = apertura;
    for (; fin < resultado.length; fin++) {
      if (resultado[fin] === "{") nivel++;
      if (resultado[fin] === "}" && --nivel === 0) break;
    }
    resultado = resultado.slice(0, m.index) + resultado.slice(fin + 1);
  }
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(nombre) && !nombre.includes(".test.") ? [ruta] : [];
  });
}

describe("movimiento", () => {
  it("toda animación vive dentro de prefers-reduced-motion: no-preference", () => {
    let fuera = quitarBloques(css, /@media \(prefers-reduced-motion: no-preference\)/);
    fuera = quitarBloques(fuera, /@media \(prefers-reduced-motion: reduce\)/);
    fuera = quitarBloques(fuera, /@keyframes [\w-]+/);
    expect(fuera).not.toMatch(/\banimation(-name|-timeline)?\s*:/);
    expect(fuera).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it("con movimiento reducido se anulan animaciones, transiciones y view transitions", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms !important/);
    expect(reduce).toMatch(/::view-transition-group\(\*\)/);
  });

  it("lo ligado al scroll solo se aplica donde el navegador lo soporta", () => {
    const timelines = [...css.matchAll(/animation-timeline:\s*([^;]+);/g)].map((m) => m[1]);
    expect(timelines.length).toBeGreaterThan(0);
    for (const bloque of css.split("@supports").slice(1)) {
      expect(bloque.trimStart()).toMatch(/^\(animation-timeline|^not \(\(backdrop-filter/);
    }
  });

  it("ninguna línea de tiempo ligada al scroll queda fuera de un @supports", () => {
    const fuera = quitarBloques(css, /@supports \(animation-timeline: view\(\)\)/);
    expect(fuera).not.toMatch(/animation-timeline\s*:/);
  });

  it("el texto en movimiento no anima nada fuera de prefers-reduced-motion: no-preference", () => {
    const fuera = quitarBloques(css, /@media \(prefers-reduced-motion: no-preference\)/);
    expect(fuera).not.toMatch(/\.kx-[^{]*\{[^}]*animation/);
  });

  it("las clases de índice kx-i-0 … kx-i-MAX_INDICE están todas definidas, sin huecos ni sobrantes", () => {
    const definidas = [...css.matchAll(/\.kx-i-(\d+)\s*\{/g)].map((m) => Number(m[1]));
    expect(definidas).toEqual(Array.from({ length: MAX_INDICE + 1 }, (_, i) => i));
  });

  it("cada clase kx-* usada en componentes está definida en el CSS", () => {
    const usadas = new Set(
      archivos(join(process.cwd(), "src")).flatMap((ruta) =>
        [...readFileSync(ruta, "utf8").matchAll(/\bkx-[a-z]+\b/g)].map((m) => m[0]),
      ),
    );
    expect(usadas.size).toBeGreaterThan(0);
    const faltantes = [...usadas].filter((clase) => !css.includes(`.${clase}`));
    expect(faltantes).toEqual([]);
  });

  it("cada clase anim-* usada en componentes está definida en el CSS", () => {
    const usadas = new Set(
      archivos(join(process.cwd(), "src")).flatMap((ruta) =>
        [...readFileSync(ruta, "utf8").matchAll(/\banim-[a-z0-9-]+/g)].map((m) => m[0]),
      ),
    );
    expect(usadas.size).toBeGreaterThan(0);
    const faltantes = [...usadas].filter((clase) => !css.includes(`.${clase}`));
    expect(faltantes).toEqual([]);
  });
});
