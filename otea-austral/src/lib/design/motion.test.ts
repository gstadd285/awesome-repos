import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_INDICE } from "@/components/motion/TextoEnMovimiento";

/** Todos los `.css` de `src/`: las guardas leen el CSS entero, no solo `globals.css`. */
function hojas(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return hojas(ruta);
    return nombre.endsWith(".css") ? [ruta] : [];
  });
}

const HOJAS = hojas(join(process.cwd(), "src"));
const css = HOJAS.map((ruta) => readFileSync(ruta, "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

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

/** El contenido de cada bloque `{…}` que sigue a `cabecera` (con llaves anidadas). */
function bloques(texto: string, cabecera: RegExp): string[] {
  const global = new RegExp(cabecera.source, "g");
  const resultado: string[] = [];
  for (const m of texto.matchAll(global)) {
    const apertura = texto.indexOf("{", m.index);
    let nivel = 0;
    let fin = apertura;
    for (; fin < texto.length; fin++) {
      if (texto[fin] === "{") nivel++;
      if (texto[fin] === "}" && --nivel === 0) break;
    }
    resultado.push(texto.slice(apertura + 1, fin));
  }
  return resultado;
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(nombre) && !nombre.includes(".test.") ? [ruta] : [];
  });
}

/** Código de componentes y bibliotecas (sin pruebas), con su texto. */
const CODIGO = archivos(join(process.cwd(), "src")).map((ruta) => ({ ruta, texto: readFileSync(ruta, "utf8") }));

/** Declaraciones `propiedad: valor;` en orden, con el texto de la regla en que aparecen. */
function declaraciones(texto: string): { prop: string; valor: string; indice: number }[] {
  return [...texto.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    prop: m[1],
    valor: m[2].trim(),
    indice: m.index ?? 0,
  }));
}

/** El cuerpo de cada `@keyframes nombre { … }`. */
function cuerposDeKeyframes(texto: string): { nombre: string; cuerpo: string }[] {
  const resultado: { nombre: string; cuerpo: string }[] = [];
  for (const m of texto.matchAll(/@keyframes ([\w-]+)\s*\{/g)) {
    const apertura = (m.index ?? 0) + m[0].length - 1;
    let nivel = 0;
    let fin = apertura;
    for (; fin < texto.length; fin++) {
      if (texto[fin] === "{") nivel++;
      if (texto[fin] === "}" && --nivel === 0) break;
    }
    resultado.push({ nombre: m[1], cuerpo: texto.slice(apertura + 1, fin) });
  }
  return resultado;
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
    // Sin esto, cada cambio de estilo en <html> creaba una transición de `scrollbar-color` en cada elemento.
    expect(reduce).toMatch(/transition-property:\s*none !important/);
    expect(reduce).toMatch(/::view-transition-group\(\*\)/);
  });

  it("con la puerta cerrada la transición de página no le pide nada a React (que llamaría a startViewTransition)", () => {
    const transicion = readFileSync(join(process.cwd(), "src/components/layout/PageTransition.tsx"), "utf8");
    // Al navegar con la puerta cerrada se monta sin <ViewTransition>, y la salida de la plantilla hidratada es «none».
    expect(transicion).toMatch(/useState\(\(\) => !hidratada \|\| puertaAbierta\(\)\)/);
    expect(transicion).toMatch(/if \(!conLimite\) return contenido;/);
    expect(transicion).toMatch(/abierta \? "otea-pagina" : "none"/);
  });

  it("con la puerta cerrada por el conmutador, las view transitions terminan al instante (sin animar fuera de la puerta)", () => {
    const fuera = quitarBloques(css, PUERTA);
    expect(fuera).toMatch(
      /html:not\(\[data-movimiento="completo"\]\)::view-transition-group\(\*\),\s*html:not\(\[data-movimiento="completo"\]\)::view-transition-old\(\*\),\s*html:not\(\[data-movimiento="completo"\]\)::view-transition-new\(\*\)\s*\{\s*animation-duration:\s*0s !important;/,
    );
    // Los nombres de transición que se mueven (subrayado, logo, acciones) solo existen con la puerta abierta.
    expect(fuera).not.toMatch(/view-transition-name:\s*(nav-subrayado|cab-logo|cab-acciones)/);
  });

  it("la transición de página vive en template.tsx (se vuelve a montar en cada navegación), no dentro de las páginas", () => {
    const plantilla = readFileSync(join(process.cwd(), "src/app/template.tsx"), "utf8");
    expect(plantilla).toContain("<PageTransition>");
    const usos = CODIGO.filter(({ texto }) => texto.includes("<PageTransition>")).map(({ ruta }) => ruta.slice(process.cwd().length + 1));
    expect(usos).toEqual(["src/app/template.tsx"]);
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
  it("todo el CSS vive en globals.css: si aparece otra hoja en src/, las guardas la leen y esta prueba avisa", () => {
    expect(HOJAS.map((ruta) => ruta.slice(process.cwd().length + 1))).toEqual(["src/app/globals.css"]);
  });

  it("los componentes no usan motion-safe:, motion-reduce: ni animate-* de Tailwind (no obedecen a la puerta)", () => {
    for (const { ruta, texto } of CODIGO) {
      expect(texto, ruta).not.toMatch(/\bmotion-(safe|reduce):/);
      expect(texto, ruta).not.toMatch(/(^|[\s"'`])animate-[a-z[]/m);
    }
  });

  it("nadie anima con la Web Animations API (contaría en getAnimations() con movimiento reducido)", () => {
    for (const { ruta, texto } of CODIGO) expect(texto, ruta).not.toMatch(/\.animate\(/);
  });

  it("las variantes mov y fino se declaran en forma de bloque (la de una línea desalinea quitarBloques)", () => {
    expect(css).toMatch(/@custom-variant mov \{\s*html\[data-movimiento="completo"\] & \{\s*@slot;/);
    expect(css).toMatch(/@custom-variant fino \{\s*@media \(hover: hover\) and \(pointer: fine\) \{\s*@slot;/);
    expect(css).not.toMatch(/@custom-variant [\w-]+\s*\([^)]*\)\s*;/);
  });

  it("los tokens de movimiento están en :root (no en @theme, que generaría utilidades animate-*)", () => {
    const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const token of ["--dur-1: 120ms", "--dur-2: 200ms", "--dur-3: 320ms", "--dur-4: 560ms", "--dur-5: 900ms"]) {
      expect(raiz).toContain(token);
    }
    expect(raiz).toMatch(/--ease-salida:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    expect(raiz).toMatch(/--ease-enfasis:\s*cubic-bezier\(0\.65, 0, 0\.35, 1\)/);
    expect(raiz).toMatch(/--ease-entrada:\s*cubic-bezier\(0\.5, 0, 0\.9, 0\.6\)/);
    const tema = css.slice(css.indexOf("@theme {"), css.indexOf("@theme inline"));
    expect(tema).not.toMatch(/--(dur|ease|animate)-/);
  });

  it("el resorte va literal: cada linear() sigue a un cubic-bezier de respaldo y nunca lleva var()", () => {
    const lista = declaraciones(css);
    const conResorte = lista.filter((d) => d.valor.includes("linear("));
    expect(conResorte.length).toBeGreaterThan(0);
    for (const d of conResorte) {
      expect(d.prop, d.valor).toMatch(/^(transition|animation)-timing-function$/);
      expect(d.valor, `${d.prop}: ${d.valor}`).not.toContain("var(");
      const anterior = lista[lista.indexOf(d) - 1];
      expect(anterior?.prop, `${d.prop} sin respaldo`).toBe(d.prop);
      expect(anterior?.valor).toContain("cubic-bezier(");
      expect(anterior?.valor).not.toContain("linear(");
    }
  });

  it("ningún @keyframes anima propiedades fuera del compositor (filter, radios, fondo, tamaño o posición)", () => {
    for (const { nombre, cuerpo } of cuerposDeKeyframes(css)) {
      for (const { prop } of declaraciones(cuerpo)) {
        expect(prop, `@keyframes ${nombre}`).not.toMatch(
          /^(filter|backdrop-filter|border-radius|background-position|background-size|width|height|top|left|right|bottom|margin.*|padding.*)$/,
        );
      }
    }
  });

  it("sin backdrop-filter: el desenfoque sobre la escena 3D hundía los fps de la historia", () => {
    expect(css).not.toMatch(/backdrop-filter\s*:/);
  });

  it("los bucles infinitos son pocos y conocidos, y se pausan fuera de vista ([data-bucle][data-fuera])", () => {
    const infinitos = new Set(
      [...css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)].map((m) => m[1]),
    );
    expect([...infinitos].sort()).toEqual(["otea-flotar", "otea-ola", "otea-pulso"]);
    // Solo los descendientes: las animaciones propias del contenedor (entrada, claves ligadas al scroll) no se
    // congelan al salir de vista.
    expect(css).toMatch(/\[data-bucle\]\[data-fuera\] \*\s*\{\s*animation-play-state:\s*paused;/);
    expect(css).not.toMatch(/\[data-bucle\]\[data-fuera\]\s*[,{]/);
    const cinta = readFileSync(join(process.cwd(), "src/components/home/Ribbon.tsx"), "utf8");
    expect(cinta).toMatch(/className=\{`cinta [^`]*`\}[^>]*data-bucle/);
  });

  it("los efectos de puntero solo viven en la puerta y, dentro de ella, con puntero fino", () => {
    // Las variables que escribe DirectorEscena: brillo (--mx/--my), atracción (--tx/--ty), inclinación
    // (--rx/--ry) y la luz del héroe (--cx/--cy).
    const PUNTERO = /var\(--(mx|my|tx|ty|rx|ry|cx|cy)\b|\[data-(magnetico|inclinar|foco)\]/;
    const FINO = /@media \(hover: hover\) and \(pointer: fine\)/;
    expect(quitarBloques(css, PUERTA)).not.toMatch(PUNTERO);
    const dentro = bloques(css, PUERTA);
    expect(dentro.some((b) => PUNTERO.test(b))).toBe(true);
    for (const bloque of dentro) expect(quitarBloques(bloque, FINO)).not.toMatch(PUNTERO);
  });

  it("DirectorEscena: isla de cliente que escribe por CSSOM, sin estado de React ni importaciones del servidor", () => {
    const isla = readFileSync(join(process.cwd(), "src/components/motion/DirectorEscena.tsx"), "utf8");
    expect(isla.startsWith('"use client";')).toBe(true);
    const importaciones = [...isla.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(importaciones.sort()).toEqual(["next/navigation", "react"]);
    expect(isla).not.toMatch(/useState|useReducer|setAttribute\(\s*"style"|\.style\.cssText|style=\{/);
    expect(isla).toContain('dataset.movimiento === "completo"');
    expect(isla).toContain("style.setProperty");
    expect(isla).toContain("style.removeProperty");
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("<DirectorEscena />");
  });

  it("el botón principal es de latón, sin filtros, y las transiciones de los botones esperan a la puerta", () => {
    const boton = readFileSync(join(process.cwd(), "src/components/ui/button.ts"), "utf8");
    expect(boton).toMatch(/primary:\s*"boton-laton"/);
    expect(boton).not.toContain("brightness");
    const sinPuerta = boton.replace(/mov:[^\s"]+/g, "");
    expect(sinPuerta).not.toMatch(/\btransition|\bduration-|\bease-/);
    expect(css).toMatch(/@utility boton-laton \{/);
    expect(css).toMatch(/@property --brillo \{\s*syntax: "<percentage>";\s*inherits: false;/);
  });
});
