/**
 * `robots.txt` (RFC 9309) con un analizador propio y sin dependencias (`docs/alertas-reales.md` §2.2):
 *
 * - Grupos `User-agent`: manda el grupo (o los grupos, que se juntan) cuyo agente es el nuestro, comparado sin
 *   mayúsculas; si no hay ninguno, los de `*`; si tampoco, todo está permitido.
 * - `Allow` / `Disallow`: gana la regla que coincide en más caracteres; ante un empate, `Allow`. `Disallow:` vacío no
 *   prohíbe nada. Comodín `*` y `$` al final (fin de la ruta).
 * - `/robots.txt` siempre se puede leer.
 *
 * La coincidencia con comodines no usa expresiones regulares (sin retroceso exponencial) y el archivo se acota en
 * líneas, reglas y largo de cada patrón.
 */

/** Nuestro token de producto: es el que va al principio del User-Agent (`OteaAustral/1.0 (…)`). */
export const AGENTE_ROBOTS = "OteaAustral";

const MAX_LINEAS = 20_000;
const MAX_REGLAS = 1_000;
const MAX_PATRON = 512;

export type ReglaRobots = { permitir: boolean; patron: string };

type Grupo = { agentes: string[]; reglas: ReglaRobots[] };

/** Reglas que se aplican a `agente` según el texto de un `robots.txt`. */
export function reglasPara(texto: string, agente = AGENTE_ROBOTS): ReglaRobots[] {
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;
  let ultimaFueAgente = false;

  const lineas = texto.split(/\r\n|\r|\n/, MAX_LINEAS);
  for (const linea of lineas) {
    const sinComentario = linea.replace(/#.*$/, "").trim();
    const separador = sinComentario.indexOf(":");
    if (separador <= 0) continue;
    const clave = sinComentario.slice(0, separador).trim().toLowerCase();
    const valor = sinComentario.slice(separador + 1).trim();

    if (clave === "user-agent") {
      if (!ultimaFueAgente || !actual) {
        actual = { agentes: [], reglas: [] };
        grupos.push(actual);
      }
      actual.agentes.push(valor.split(/[\s/]/)[0].toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    if (clave === "allow" || clave === "disallow") {
      ultimaFueAgente = false;
      // Una regla antes de cualquier `User-agent` no pertenece a ningún grupo.
      if (!actual || valor === "" || valor.length > MAX_PATRON) continue;
      if (actual.reglas.length < MAX_REGLAS) actual.reglas.push({ permitir: clave === "allow", patron: valor.replace(/\*+/g, "*") });
      continue;
    }
    // `Sitemap`, `Crawl-delay` y lo desconocido no separan grupos ni cuentan.
  }

  const propio = agente.toLowerCase();
  const nuestros = grupos.filter((g) => g.agentes.includes(propio));
  const elegidos = nuestros.length > 0 ? nuestros : grupos.filter((g) => g.agentes.includes("*"));
  return elegidos.flatMap((g) => g.reglas).slice(0, MAX_REGLAS);
}

/** ¿Se puede leer `ruta` (camino y consulta, p. ej. `/feed.xml?x=1`) con estas reglas? */
export function rutaPermitida(reglas: readonly ReglaRobots[], ruta: string): boolean {
  if (ruta === "/robots.txt") return true;
  let mejor: ReglaRobots | null = null;
  let largoMejor = -1;
  for (const regla of reglas) {
    if (!coincide(regla.patron, ruta)) continue;
    const largo = regla.patron.length;
    if (largo > largoMejor || (largo === largoMejor && regla.permitir && mejor && !mejor.permitir)) {
      mejor = regla;
      largoMejor = largo;
    }
  }
  return mejor ? mejor.permitir : true;
}

/** Atajo: ¿el texto de `robots.txt` deja leer la ruta de esta URL? */
export function permitePorRobots(texto: string, url: URL, agente = AGENTE_ROBOTS): boolean {
  return rutaPermitida(reglasPara(texto, agente), `${url.pathname}${url.search}`);
}

/** Un patrón de robots coincide desde el principio de la ruta; `$` final exige que la ruta termine ahí. */
function coincide(patron: string, ruta: string): boolean {
  const anclado = patron.endsWith("$");
  const cuerpo = anclado ? patron.slice(0, -1) : `${patron}*`;
  return comodin(cuerpo, ruta);
}

/** Coincidencia con `*` en tiempo O(largo × patrón) como mucho, sin recursión ni expresiones regulares. */
function comodin(patron: string, texto: string): boolean {
  let p = 0;
  let t = 0;
  let estrella = -1;
  let marca = 0;
  while (t < texto.length) {
    if (p < patron.length && patron[p] !== "*" && patron[p] === texto[t]) {
      p++;
      t++;
    } else if (p < patron.length && patron[p] === "*") {
      estrella = p++;
      marca = t;
    } else if (estrella !== -1) {
      p = estrella + 1;
      t = ++marca;
    } else {
      return false;
    }
  }
  while (p < patron.length && patron[p] === "*") p++;
  return p === patron.length;
}
