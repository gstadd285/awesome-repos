import { dentroDelDominio, parseHttpsUrl } from "@/lib/domain/url";

/**
 * Lector de feeds propio y sin dependencias (`docs/alertas-reales.md` §2.2): RSS 2.0, Atom 1.0 y, para las fuentes
 * con `formato: "api"`, JSON Feed 1.x. Solo extrae **título, enlace, guid/id y fecha**: la `description`, el
 * `summary`, el `content` y cualquier otro texto de la fuente no se leen ni se guardan (regla 6 de CLAUDE.md).
 *
 * Defensas, en este orden:
 * - Tamaño máximo del texto (además del límite en bytes de `descarga.ts`).
 * - XML: cualquier declaración `<!DOCTYPE`, `<!ENTITY`… se rechaza **antes** de analizar. Sin DTD no hay entidades
 *   externas (XXE) ni expansión de entidades («bomba de mil millones de risas»): solo se decodifican las cinco
 *   predefinidas y las referencias numéricas; una entidad con nombre desconocido queda como texto literal.
 * - Profundidad máxima de anidamiento, número máximo de elementos y de ítems, largo máximo de cada campo.
 * - JSON: la profundidad se mide con un recorrido lineal **antes** de `JSON.parse`.
 *
 * El analizador XML no arma un árbol: recorre el texto una vez y solo guarda los cuatro campos de cada ítem.
 */

export const LIMITES_LECTURA = {
  /** Caracteres del documento (1 MB en bytes como mucho, por `descarga.ts`). */
  caracteres: 1_048_576,
  profundidad: 32,
  elementos: 50_000,
  atributos: 64,
  items: 200,
  /** Caracteres guardados de cada campo antes de limpiarlo. */
  campo: 4_096,
} as const;

export type FormatoLectura = "rss" | "atom" | "api";

/** Un ítem tal como viene en el feed, antes de limpiar y validar. */
export type ItemCrudo = { titulo: string; enlace: string; guid: string | null; fecha: string | null };

export type CodigoLectura = "tamano" | "dtd" | "profundidad" | "elementos" | "mal_formado" | "formato" | "codificacion";

export type Lectura = { ok: true; items: ItemCrudo[] } | { ok: false; codigo: CodigoLectura };

const fallo = (codigo: CodigoLectura): Lectura => ({ ok: false, codigo });

// ── Codificación ───────────────────────────────────────────────────────────

const CODIFICACIONES: Record<string, string> = {
  "utf-8": "utf-8",
  utf8: "utf-8",
  "us-ascii": "utf-8",
  "iso-8859-1": "windows-1252",
  latin1: "windows-1252",
  "windows-1252": "windows-1252",
};

/**
 * Bytes → texto según el `charset` del tipo de contenido o, si falta, la declaración XML. Solo UTF-8 y Latin-1 (lo
 * que usan los sitios oficiales de la región); otra codificación devuelve `null` (no se adivina).
 */
export function decodificar(bytes: Uint8Array, tipoContenido: string | null): string | null {
  let charset = /;\s*charset\s*=\s*"?([A-Za-z0-9_-]{1,40})"?/i.exec(tipoContenido ?? "")?.[1];
  if (!charset) {
    const inicio = String.fromCharCode(...bytes.subarray(0, 200));
    charset = /^(?:\xEF\xBB\xBF)?\s*<\?xml[^>]{0,150}?encoding\s*=\s*["']([A-Za-z0-9_-]{1,40})["']/i.exec(inicio)?.[1];
  }
  const etiqueta = CODIFICACIONES[(charset ?? "utf-8").toLowerCase()];
  if (!etiqueta) return null;
  return new TextDecoder(etiqueta).decode(bytes);
}

// ── XML (RSS 2.0 y Atom 1.0) ───────────────────────────────────────────────

const PREDEFINIDAS: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
/** U+FFFD, el carácter de reemplazo: lo que no es un carácter válido de XML. */
const REEMPLAZO = String.fromCharCode(0xfffd);

function caracter(codigo: number): string {
  const valido =
    codigo === 0x9 ||
    codigo === 0xa ||
    codigo === 0xd ||
    (codigo >= 0x20 && codigo <= 0xd7ff) ||
    (codigo >= 0xe000 && codigo <= 0xfffd) ||
    (codigo >= 0x10000 && codigo <= 0x10ffff);
  return valido ? String.fromCodePoint(codigo) : REEMPLAZO;
}

/** Solo las cinco entidades predefinidas de XML y las referencias numéricas: nunca se expande nada definido por el documento. */
function decodificarXml(texto: string): string {
  if (!texto.includes("&")) return texto;
  return texto.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g, (entero, ref: string) => {
    if (ref[0] !== "#") return PREDEFINIDAS[ref] ?? entero;
    return caracter(ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
  });
}

type CampoXml = "titulo" | "enlace" | "guid" | "fecha";
type ItemEnCurso = { titulo: string | null; enlace: string | null; guid: string | null; fecha: string | null; guidEsEnlace: boolean };

const CAMPOS_RSS: Record<string, CampoXml> = { title: "titulo", link: "enlace", guid: "guid", pubDate: "fecha" };
const CAMPOS_ATOM: Record<string, CampoXml> = { title: "titulo", id: "guid", published: "fecha", updated: "fecha" };

const NOMBRE = /[A-Za-z_][\w.:-]{0,127}/y;
const ESPACIO = /\s*/y;

/**
 * Lee un documento RSS 2.0 (`formato: "rss"`) o Atom 1.0 (`"atom"`). Un documento de otro tipo, o del otro formato,
 * se rechaza: un feed verificado que cambia de forma merece una revisión, no una interpretación.
 */
export function leerXml(texto: string, formato: "rss" | "atom"): Lectura {
  if (texto.length > LIMITES_LECTURA.caracteres) return fallo("tamano");
  // Antes de analizar nada: sin DTD no hay entidades externas ni expansión (XXE, bomba de entidades).
  if (/<!\s*(DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)/i.test(texto)) return fallo("dtd");

  const raizEsperada = formato === "rss" ? "rss" : "feed";
  const nivelItem = formato === "rss" ? 2 : 1;
  const nombreItem = formato === "rss" ? "item" : "entry";
  const campos = formato === "rss" ? CAMPOS_RSS : CAMPOS_ATOM;

  const pila: string[] = [];
  const items: ItemCrudo[] = [];
  let elementos = 0;
  let raizCerrada = false;
  let item: ItemEnCurso | null = null;
  let campo: { nombre: CampoXml; nivel: number; texto: string } | null = null;
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0;

  const capturar = (fragmento: string) => {
    if (campo && campo.texto.length < LIMITES_LECTURA.campo) {
      campo.texto += fragmento.slice(0, LIMITES_LECTURA.campo - campo.texto.length);
    }
  };

  const abrir = (nombre: string, atributos: Record<string, string>): CodigoLectura | null => {
    const nivel = pila.length;
    if (++elementos > LIMITES_LECTURA.elementos) return "elementos";
    if (nivel + 1 > LIMITES_LECTURA.profundidad) return "profundidad";
    if (nivel === 0) {
      if (raizCerrada) return "mal_formado";
      if (nombre !== raizEsperada) return "formato";
    }
    if (nivel === nivelItem && nombre === nombreItem && (formato === "atom" || pila[1] === "channel")) {
      item = { titulo: null, enlace: null, guid: null, fecha: null, guidEsEnlace: true };
    } else if (item && nivel === nivelItem + 1 && !campo) {
      const destino = campos[nombre];
      if (destino && item[destino] === null) campo = { nombre: destino, nivel, texto: "" };
      if (formato === "rss" && nombre === "guid") item.guidEsEnlace = atributos.isPermaLink !== "false";
      if (formato === "atom" && nombre === "link" && item.enlace === null) {
        const rel = atributos.rel ?? "alternate";
        if (rel === "alternate" && atributos.href) item.enlace = atributos.href;
      }
    }
    pila.push(nombre);
    return null;
  };

  const cerrar = (nombre: string): CodigoLectura | null => {
    if (pila.pop() !== nombre) return "mal_formado";
    const nivel = pila.length;
    if (campo && nivel === campo.nivel && item) {
      item[campo.nombre] = campo.texto;
      campo = null;
    }
    if (item && nivel === nivelItem && nombre === nombreItem) {
      const terminado: ItemEnCurso = item;
      item = null;
      const guid = terminado.guid?.trim() || null;
      const enlace =
        terminado.enlace?.trim() || (formato === "rss" && terminado.guidEsEnlace && guid && /^https?:\/\//i.test(guid) ? guid : "");
      items.push({ titulo: terminado.titulo ?? "", enlace, guid, fecha: terminado.fecha?.trim() || null });
    }
    if (nivel === 0) raizCerrada = true;
    return null;
  };

  while (i < texto.length) {
    if (items.length >= LIMITES_LECTURA.items) break;
    const menor = texto.indexOf("<", i);
    const finTexto = menor === -1 ? texto.length : menor;
    if (finTexto > i) {
      const crudo = texto.slice(i, finTexto);
      if (pila.length === 0) {
        if (crudo.trim() !== "") return fallo("mal_formado");
      } else if (campo) {
        capturar(decodificarXml(crudo));
      }
      i = finTexto;
      continue;
    }

    if (texto.startsWith("<?", i)) {
      // Declaración XML o instrucción de proceso (p. ej. `xml-stylesheet`): no se interpretan.
      const fin = texto.indexOf("?>", i + 2);
      if (fin === -1) return fallo("mal_formado");
      i = fin + 2;
      continue;
    }
    if (texto.startsWith("<!--", i)) {
      const fin = texto.indexOf("-->", i + 4);
      if (fin === -1) return fallo("mal_formado");
      i = fin + 3;
      continue;
    }
    if (texto.startsWith("<![CDATA[", i)) {
      const fin = texto.indexOf("]]>", i + 9);
      if (fin === -1 || pila.length === 0) return fallo("mal_formado");
      if (campo) capturar(texto.slice(i + 9, fin));
      i = fin + 3;
      continue;
    }
    if (texto.startsWith("<!", i)) return fallo("dtd");

    if (texto.startsWith("</", i)) {
      NOMBRE.lastIndex = i + 2;
      const nombre = NOMBRE.exec(texto)?.[0];
      ESPACIO.lastIndex = i + 2 + (nombre?.length ?? 0);
      ESPACIO.exec(texto);
      if (!nombre || texto[ESPACIO.lastIndex] !== ">") return fallo("mal_formado");
      const error = cerrar(nombre);
      if (error) return fallo(error);
      i = ESPACIO.lastIndex + 1;
      continue;
    }

    // Etiqueta de apertura: nombre, atributos entre comillas y `>` o `/>`.
    NOMBRE.lastIndex = i + 1;
    const nombre = NOMBRE.exec(texto)?.[0];
    if (!nombre) return fallo("mal_formado");
    let j = i + 1 + nombre.length;
    const atributos: Record<string, string> = {};
    let cuenta = 0;
    let autocerrada = false;
    for (;;) {
      ESPACIO.lastIndex = j;
      ESPACIO.exec(texto);
      j = ESPACIO.lastIndex;
      if (texto.startsWith("/>", j)) {
        autocerrada = true;
        j += 2;
        break;
      }
      if (texto[j] === ">") {
        j += 1;
        break;
      }
      if (j === i + 1 + nombre.length || !/\s/.test(texto[j - 1])) return fallo("mal_formado");
      NOMBRE.lastIndex = j;
      const atributo = NOMBRE.exec(texto)?.[0];
      if (!atributo || ++cuenta > LIMITES_LECTURA.atributos) return fallo(atributo ? "elementos" : "mal_formado");
      j += atributo.length;
      ESPACIO.lastIndex = j;
      ESPACIO.exec(texto);
      j = ESPACIO.lastIndex;
      if (texto[j] !== "=") return fallo("mal_formado");
      ESPACIO.lastIndex = j + 1;
      ESPACIO.exec(texto);
      j = ESPACIO.lastIndex;
      const comilla = texto[j];
      if (comilla !== '"' && comilla !== "'") return fallo("mal_formado");
      const cierre = texto.indexOf(comilla, j + 1);
      if (cierre === -1) return fallo("mal_formado");
      const valor = texto.slice(j + 1, cierre);
      if (valor.includes("<")) return fallo("mal_formado");
      atributos[atributo] = decodificarXml(valor).slice(0, LIMITES_LECTURA.campo);
      j = cierre + 1;
    }
    const error = abrir(nombre, atributos) ?? (autocerrada ? cerrar(nombre) : null);
    if (error) return fallo(error);
    i = j;
  }

  if (items.length < LIMITES_LECTURA.items && (pila.length > 0 || !raizCerrada)) return fallo("mal_formado");
  return { ok: true, items };
}

// ── JSON Feed (formato «api») ──────────────────────────────────────────────

/** Profundidad de anidamiento de un JSON, con un recorrido lineal que ignora lo que va dentro de las cadenas. */
export function profundidadJson(texto: string, tope = LIMITES_LECTURA.profundidad): number {
  let nivel = 0;
  let maximo = 0;
  let enCadena = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (enCadena) {
      if (c === 0x5c) i++;
      else if (c === 0x22) enCadena = false;
    } else if (c === 0x22) {
      enCadena = true;
    } else if (c === 0x7b || c === 0x5b) {
      if (++nivel > maximo) maximo = nivel;
      if (maximo > tope) return maximo;
    } else if (c === 0x7d || c === 0x5d) {
      nivel--;
    }
  }
  return maximo;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cadena = (v: unknown): string | null => (typeof v === "string" ? v.slice(0, LIMITES_LECTURA.campo) : null);

/**
 * Lee un JSON Feed 1.x (`version` `https://jsonfeed.org/version/1…`, `items[]` con `id`, `url`, `title`,
 * `date_published`). Una API oficial con otra forma necesitará su propio adaptador aquí al verificarse.
 */
export function leerJson(texto: string): Lectura {
  if (texto.length > LIMITES_LECTURA.caracteres) return fallo("tamano");
  if (profundidadJson(texto) > LIMITES_LECTURA.profundidad) return fallo("profundidad");
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return fallo("mal_formado");
  }
  if (!esObjeto(datos) || typeof datos.version !== "string" || !datos.version.startsWith("https://jsonfeed.org/version/1")) {
    return fallo("formato");
  }
  if (!Array.isArray(datos.items)) return fallo("formato");
  if (datos.items.length > LIMITES_LECTURA.elementos) return fallo("elementos");
  const items: ItemCrudo[] = [];
  for (const crudo of datos.items.slice(0, LIMITES_LECTURA.items)) {
    if (!esObjeto(crudo)) continue;
    const id = typeof crudo.id === "number" && Number.isFinite(crudo.id) ? String(crudo.id) : cadena(crudo.id);
    items.push({
      titulo: cadena(crudo.title) ?? "",
      enlace: cadena(crudo.url)?.trim() ?? "",
      guid: id?.trim() || null,
      fecha: cadena(crudo.date_published)?.trim() || cadena(crudo.date_modified)?.trim() || null,
    });
  }
  return { ok: true, items };
}

/** Lee el documento según el formato declarado en el registro. */
export function leerFeed(texto: string, formato: FormatoLectura): Lectura {
  return formato === "api" ? leerJson(texto) : leerXml(texto, formato);
}

// ── Limpieza y validación de cada ítem ─────────────────────────────────────

export const MAX_TITULO = 300;
const MAX_IDENTIFICADOR = 120;

const ENTIDADES_HTML: Record<string, string> = { ...PREDEFINIDAS, nbsp: " ", "#39": "'" };

/** Caracteres de control, de formato invisible y de dirección (suplantación de texto). */
const INVISIBLES = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

/** Etiquetas en línea: se quitan sin dejar espacio («<i>Alza</i>,» → «Alza,»); las demás dejan uno. */
const EN_LINEA = new Set(["a", "abbr", "b", "code", "em", "i", "small", "span", "strong", "sub", "sup", "u"]);

/**
 * Título para guardar: se decodifican las entidades de HTML escapado (frecuente en RSS), se quitan etiquetas,
 * caracteres de control e invisibles, se compactan los espacios y se corta en 300 caracteres (puntos de código, como
 * cuenta `char_length` en Postgres).
 */
export function limpiarTitulo(crudo: string): string {
  const decodificado = crudo.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,7});/g, (entero, ref: string) => {
    if (ref[0] !== "#" || ref === "#39") return ENTIDADES_HTML[ref.toLowerCase()] ?? ENTIDADES_HTML[ref] ?? entero;
    return caracter(ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
  });
  const limpio = decodificado
    .replace(/<\/?([A-Za-z][A-Za-z0-9]{0,15})?[^<>]{0,500}>/g, (_etiqueta, nombre?: string) =>
      nombre && EN_LINEA.has(nombre.toLowerCase()) ? "" : " ",
    )
    .replace(INVISIBLES, " ")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  const puntos = Array.from(limpio);
  return puntos.length > MAX_TITULO ? puntos.slice(0, MAX_TITULO).join("").trimEnd() : limpio;
}

const MESES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const ZONAS: Record<string, number> = {
  ut: 0, utc: 0, gmt: 0, z: 0, est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420,
};

function instante(anio: number, mes: number, dia: number, hora: number, minuto: number, segundo: number, desfaseMin: number): number | null {
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 60) return null;
  const ms = Date.UTC(anio, mes, dia, hora, minuto, Math.min(segundo, 59));
  const comprobada = new Date(ms);
  // `Date.UTC` acepta el 31 de febrero (lo pasa a marzo): una fecha que no existe es inválida.
  if (comprobada.getUTCDate() !== dia || comprobada.getUTCMonth() !== mes) return null;
  return ms - desfaseMin * 60_000;
}

function desfase(signo: string, horas: string, minutos: string): number | null {
  const h = Number(horas);
  const m = Number(minutos);
  if (h > 14 || m > 59) return null;
  return (signo === "-" ? -1 : 1) * (h * 60 + m);
}

/** RFC 3339 / ISO 8601 con zona (Atom, JSON Feed). */
function fechaRfc3339(valor: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/.exec(valor);
  if (!m) return null;
  const zona = m[7] ? 0 : desfase(m[8], m[9], m[10]);
  if (zona === null) return null;
  return instante(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), zona);
}

/** RFC 822 / 1123 (`pubDate` de RSS): `Tue, 20 Oct 2026 14:30:00 -0300`. */
function fechaRfc822(valor: string): number | null {
  const m = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}|\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(?:([A-Za-z]{1,3})|([+-])(\d{2})(\d{2}))$/.exec(valor);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (mes === undefined) return null;
  const anio = m[3].length === 2 ? (+m[3] < 50 ? 2000 : 1900) + +m[3] : +m[3];
  const zona = m[7] ? ZONAS[m[7].toLowerCase()] : desfase(m[8], m[9], m[10]);
  if (zona === undefined || zona === null) return null;
  return instante(anio, mes, +m[1], +m[4], +m[5], +(m[6] ?? 0), zona);
}

const DIA_MS = 24 * 60 * 60_000;
const FECHA_MINIMA = Date.UTC(1995, 0, 1);

/**
 * Fecha declarada por el feed, o `null` si no se entiende, no existe (31 de febrero), es anterior a 1995 o está más
 * de un día en el futuro. Una fecha inválida no descarta el ítem: solo queda sin fecha.
 */
export function fechaFeed(valor: string | null, ahora: Date): Date | null {
  if (!valor) return null;
  const limpio = valor.trim();
  if (limpio.length > 64) return null;
  const ms = fechaRfc3339(limpio) ?? fechaRfc822(limpio);
  if (ms === null || ms < FECHA_MINIMA || ms > ahora.getTime() + DIA_MS) return null;
  return new Date(ms);
}

export type ItemNormalizado = {
  titulo: string;
  url: string;
  guid: string | null;
  identificador: string | null;
  publicado: Date | null;
};

export type ContextoItem = {
  /** URL del feed (resuelve enlaces relativos). */
  urlFeed: string;
  /** `url_base` de la fuente: todo enlace debe quedar en su dominio. */
  urlBase: string;
  ahora: Date;
};

/**
 * Ítem listo para guardar, o `null` si se descarta: sin título, sin enlace, con un enlace que no es https o que sale
 * del dominio de su fuente (`dentroDelDominio`).
 */
export function normalizarItem(crudo: ItemCrudo, contexto: ContextoItem): ItemNormalizado | null {
  const titulo = limpiarTitulo(crudo.titulo);
  if (!titulo) return null;
  let url: string;
  try {
    url = new URL(crudo.enlace.replace(INVISIBLES, "").trim(), contexto.urlFeed).href;
  } catch {
    return null;
  }
  if (!crudo.enlace.trim() || url.length > 2048 || !parseHttpsUrl(url) || !dentroDelDominio(url, contexto.urlBase)) {
    return null;
  }
  const guid = crudo.guid?.replace(INVISIBLES, "").trim() || null;
  const largo = guid ? Array.from(guid).length : 0;
  return {
    titulo,
    url,
    guid,
    identificador: guid && largo <= MAX_IDENTIFICADOR ? guid : null,
    publicado: fechaFeed(crudo.fecha, contexto.ahora),
  };
}
