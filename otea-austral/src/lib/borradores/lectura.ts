import type { Source } from "@/lib/domain/schemas";
import { permiteLecturaIa } from "@/lib/domain/schemas";
import type { Descargador } from "@/lib/ingesta/descarga";
import { decodificar } from "@/lib/ingesta/feeds";
import { permitePorRobots } from "@/lib/ingesta/robots";
import type { Bandera } from "./esquema";
import { tieneMarcasDeInyeccion } from "./prompt";

/**
 * Lectura **transitoria** del texto de las fuentes para un borrador (`docs/alertas-reales.md` §4.3). Solo documentos de
 * fuentes con `lectura_ia`, como mucho 3, con `descarga.ts` y sus límites (registro, https, dominio de la fuente en cada
 * redirección, 10 s, 2 MB en flujo, `text/html`) y respetando `robots.txt`. Del HTML queda el texto, cortado en 12.000
 * caracteres.
 *
 * El texto vive en las variables de la redacción: no se guarda en la base, no se registra (los eventos llevan códigos) y
 * se descarta al terminar. Si trae marcas de inyección (§4.4), la lectura se detiene y no se llama al modelo.
 */

export const MAX_DOCUMENTOS = 3;
export const MAX_CARACTERES_DOCUMENTO = 12_000;

export type ItemLeible = { url: string; sourceId: string };

export type DocumentoLeido = { url: string; sourceId: string; texto: string };

export type Lectura = {
  documentos: DocumentoLeido[];
  banderas: Set<Bandera>;
  /** Algún texto traía marcas de inyección: no se llama al modelo. */
  inyeccion: boolean;
};

// ── Del HTML al texto ──────────────────────────────────────────────────────

/** Elementos cuyo contenido no es texto del documento (o es navegación, cabecera y pie). */
const OMITIDOS = new Set(["script", "style", "nav", "header", "footer", "noscript", "template", "svg", "iframe", "object", "head", "form", "select", "button"]);
/** Elementos que separan bloques: dejan un salto de línea. */
const BLOQUES = new Set(["p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "table", "section", "article", "main", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "dd", "dt", "figcaption", "hr"]);

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", deg: "°", euro: "€", copy: "©", reg: "®",
  middot: "·", ordm: "º", ordf: "ª", bull: "•", times: "×", percnt: "%",
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (entera, ref: string) => {
    if (ref[0] === "#") {
      const codigo = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      const valido = codigo === 0x9 || codigo === 0xa || (codigo >= 0x20 && codigo <= 0xd7ff) || (codigo >= 0xe000 && codigo <= 0x10ffff);
      return valido ? String.fromCodePoint(codigo) : " ";
    }
    return ENTIDADES[ref] ?? entera;
  });
}

/**
 * Texto de un documento HTML, en una sola pasada (sin expresiones que retrocedan: el documento puede pesar 2 MB y venir
 * de afuera). Quita comentarios, los elementos de `OMITIDOS` con su contenido, las etiquetas y las entidades; deja
 * saltos de línea entre bloques y sin caracteres de control ni de dirección.
 */
export function textoDeHtml(html: string): string {
  const partes: string[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const abre = html.indexOf("<", i);
    if (abre === -1) {
      partes.push(html.slice(i));
      break;
    }
    partes.push(html.slice(i, abre));
    if (html.startsWith("<!--", abre)) {
      const fin = html.indexOf("-->", abre + 4);
      i = fin === -1 ? n : fin + 3;
      partes.push(" ");
      continue;
    }
    const cierra = html.indexOf(">", abre + 1);
    if (cierra === -1) break; // una etiqueta sin cerrar al final: se descarta el resto
    const etiqueta = html.slice(abre + 1, cierra);
    const nombre = /^\/?([a-zA-Z][a-zA-Z0-9-]{0,20})/.exec(etiqueta)?.[1]?.toLowerCase() ?? "";
    const deCierre = etiqueta.startsWith("/");
    if (!deCierre && OMITIDOS.has(nombre) && !etiqueta.endsWith("/")) {
      const fin = new RegExp(`</${nombre}\\b`, "gi");
      fin.lastIndex = cierra + 1;
      const m = fin.exec(html);
      const despues = m ? html.indexOf(">", m.index) : -1;
      i = despues === -1 ? n : despues + 1;
      partes.push(" ");
      continue;
    }
    partes.push(BLOQUES.has(nombre) ? "\n" : " ");
    i = cierra + 1;
  }
  return decodificarEntidades(partes.join(""))
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n[ \n]*/g, "\n")
    .trim();
}

/** Corta en `max` caracteres sin partir una palabra. */
export function cortar(texto: string, max = MAX_CARACTERES_DOCUMENTO): { texto: string; cortado: boolean } {
  if (texto.length <= max) return { texto, cortado: false };
  const trozo = texto.slice(0, max);
  const espacio = trozo.search(/\s\S*$/);
  return { texto: (espacio > max * 0.8 ? trozo.slice(0, espacio) : trozo).trimEnd(), cortado: true };
}

// ── Lectura ────────────────────────────────────────────────────────────────

const esPdf = (url: URL) => /\.pdf$/i.test(url.pathname);

/**
 * Lee como mucho `MAX_DOCUMENTOS` enlaces de los ítems, en orden, solo de fuentes con `lectura_ia`. Lo que no se puede
 * leer solo (PDF, otro tipo, un error, `robots.txt` que lo prohíbe o no responde) deja la bandera `lectura_manual`.
 */
export async function leerDocumentos(
  items: readonly ItemLeible[],
  fuentes: readonly Source[],
  descargar: Descargador,
  senal?: AbortSignal,
): Promise<Lectura> {
  const porId = new Map(fuentes.map((f) => [f.id, f]));
  const lectura: Lectura = { documentos: [], banderas: new Set(), inyeccion: false };
  const robots = new Map<string, Promise<{ texto: string | null } | null>>();
  const vistas = new Set<string>();

  for (const item of items) {
    if (lectura.documentos.length >= MAX_DOCUMENTOS || senal?.aborted) break;
    const fuente = porId.get(item.sourceId);
    if (!fuente || !permiteLecturaIa(fuente) || vistas.has(item.url)) continue;
    vistas.add(item.url);
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    if (esPdf(url)) {
      lectura.banderas.add("lectura_manual");
      continue;
    }

    let deHost = robots.get(url.host);
    if (!deHost) {
      deHost = descargar({ fuente, url: `https://${url.host}/robots.txt`, clase: "robots", senal }).then((r) => {
        if (r.estado === "ok") return { texto: decodificar(r.cuerpo, r.tipo) ?? "" };
        if (r.estado === "error" && r.codigo === "no_encontrado") return { texto: null };
        return null;
      });
      robots.set(url.host, deHost);
    }
    const reglas = await deHost;
    if (!reglas || (reglas.texto !== null && !permitePorRobots(reglas.texto, url))) {
      lectura.banderas.add("lectura_manual");
      continue;
    }

    const r = await descargar({ fuente, url: item.url, clase: "documento", senal });
    const html = r.estado === "ok" ? decodificar(r.cuerpo, r.tipo) : null;
    const texto = html ? textoDeHtml(html) : "";
    if (!texto) {
      lectura.banderas.add("lectura_manual");
      continue;
    }
    const recorte = cortar(texto);
    if (tieneMarcasDeInyeccion(recorte.texto)) {
      lectura.inyeccion = true;
      lectura.banderas.add("posible_inyeccion");
      lectura.documentos = [];
      return lectura;
    }
    if (recorte.cortado) lectura.banderas.add("lectura_parcial");
    lectura.documentos.push({ url: item.url, sourceId: item.sourceId, texto: recorte.texto });
  }
  return lectura;
}
