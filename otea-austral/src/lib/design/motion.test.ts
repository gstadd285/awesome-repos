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

/** Todo el movimiento cuelga de esta puerta, que escribe el motor (src/lib/movimiento/motor.ts). */
const PUERTA = /html\[data-movimiento="completo"\]/;

describe("movimiento", () => {
  it("toda animación vive detrás de la puerta html[data-movimiento=\"completo\"]", () => {
    let fuera = quitarBloques(css, PUERTA);
    fuera = quitarBloques(fuera, /@media \(prefers-reduced-motion: reduce\)/);
    fuera = quitarBloques(fuera, /@keyframes [\w-]+/);
    expect(fuera).not.toMatch(/\banimation(-name|-timeline)?\s*:/);
    expect(fuera).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it("nada oculta ni desplaza contenido fuera de la puerta (sin motor, todo se ve completo y quieto)", () => {
    let fuera = quitarBloques(css, PUERTA);
    fuera = quitarBloques(fuera, /@keyframes [\w-]+/);
    expect(fuera).not.toMatch(/opacity:\s*0\.16/);
    expect(fuera).not.toMatch(/translateY\(1\.35em\)/);
    expect(fuera).not.toMatch(/\.escena[^{]*\{[^}]*opacity:\s*0\b/);
  });

  it("el respaldo sin líneas de tiempo solo actúa con el motor listo ([data-motor]) y no usa timelines", () => {
    expect(css).toContain('[data-timeline="no"]');
    expect(css).not.toMatch(/\[data-timeline="no"\](?!\[data-motor\])/);
    const respaldo = css.slice(css.indexOf('html[data-movimiento="completo"][data-timeline="no"]'));
    const bloque = respaldo.slice(0, respaldo.indexOf("\n}\n") + 3);
    expect(bloque).not.toMatch(/animation-timeline|animation-range|view-timeline/);
  });

  it("el motor y el CSS hablan el mismo idioma: cada clase y atributo que el motor usa está en el CSS", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/movimiento/motor.ts"), "utf8");
    const fichas = [
      "kx-visto",
      "escena-vista",
      "mov-quieto",
      "data-motor",
      "data-movimiento",
      "data-timeline",
      "data-sistema",
      "data-mov-ui",
      "kx-scroll",
      ".escena",
    ];
    for (const ficha of fichas) {
      expect(motor, `el motor no menciona ${ficha}`).toContain(ficha);
      expect(css, `el CSS no menciona ${ficha}`).toContain(ficha.replace(/^\./, ""));
    }
  });

  it("las piezas 3D que el motor observa llevan la clase «escena» en la portada", () => {
    const historia = readFileSync(join(process.cwd(), "src/components/home/Story.tsx"), "utf8");
    expect(historia).toContain('className="h-plano escena"');
    expect(historia).toContain('className="h-tablero escena"');
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

  it("el texto en movimiento no anima nada fuera de la puerta de movimiento", () => {
    const fuera = quitarBloques(css, PUERTA);
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
