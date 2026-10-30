import { TEMAS, type Tema } from "@/lib/domain/temas";

/**
 * Léxico de la agrupación en eventos candidatos (`docs/alertas-reales.md` §3): normalización de títulos, palabras por
 * tema en español e inglés, palabras de decisión y claves de agenda. Solo trabaja con **títulos** (metadatos): la
 * ingesta nunca guarda el texto de una fuente. Funciones puras, sin dependencias de servidor.
 */

/** Raíz mínima para que el singular y el plural coincidan (tasa/tasas, arancel/aranceles, rate/rates). */
function raiz(t: string): string {
  if (t.length <= 4 || t.endsWith("+") || /^\d/.test(t)) return t;
  if (t.endsWith("es") && /[lnrdzj]$/.test(t.slice(0, -2))) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Minúsculas, sin tildes, tokens alfanuméricos (con un «+» final: OPEP+) y raíz mínima. */
export function tokens(texto: string): string[] {
  const plano = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return (plano.match(/[a-z0-9]+\+?/g) ?? []).map(raiz);
}

const VACIAS = new Set(
  [
    // Español
    "del", "las", "los", "una", "uno", "unos", "unas", "por", "para", "con", "sin", "que", "sus", "como", "mas", "sobre",
    "entre", "tras", "ante", "hasta", "desde", "segun", "contra", "durante", "este", "esta", "estos", "estas", "ese", "esa",
    "pero", "ser", "son", "fue", "hay", "muy", "ya", "nuevo", "nueva",
    // Inglés
    "the", "and", "for", "with", "from", "that", "this", "into", "over", "after", "about", "its", "are", "was", "has",
    "have", "new", "will", "not",
    // Marcas de los datos de prueba: nunca significan nada para agrupar.
    "ejemplo", "example",
  ].map(raiz),
);

/** Palabras significativas de un título: sin vacías, de 3 caracteres o más y sin cifras sueltas (años, folios). */
export function palabrasSignificativas(titulo: string): Set<string> {
  return new Set(tokens(titulo).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !VACIAS.has(t)));
}

/** Jaccard entre las palabras significativas de dos títulos (0 si alguno no tiene ninguna). */
export function similitud(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes++;
  return comunes / (a.size + b.size - comunes);
}

type Frase = readonly string[];
const frase = (texto: string): Frase => tokens(texto);

/** ¿Aparece la frase (tokens contiguos) en el título? */
function contiene(titulo: readonly string[], f: Frase): boolean {
  if (f.length === 0 || f.length > titulo.length) return false;
  for (let i = 0; i + f.length <= titulo.length; i++) {
    let igual = true;
    for (let j = 0; j < f.length && igual; j++) igual = titulo[i + j] === f[j];
    if (igual) return true;
  }
  return false;
}

const LEXICO_CRUDO: Record<Tema, readonly string[]> = {
  energia: [
    "petróleo", "crudo", "crude", "oil", "brent", "wti", "gas", "gas natural", "natural gas", "gnl", "lng", "opep", "opep+",
    "opec", "opec+", "energía", "energy", "combustible", "gasolina", "gasoline", "refinería", "refinery", "barril", "barrel",
    "electricidad", "electricity",
  ],
  chips: ["semiconductor", "semiconductores", "chip", "microchip", "obleas", "wafer", "litografía", "lithography"],
  cobre: ["cobre", "copper", "cochilco", "cátodo", "cathode", "molibdeno", "molybdenum"],
  comercio_eeuu_china: [
    "arancel", "tariff", "china", "chino", "chinese", "beijing", "pekín", "control de exportaciones", "export controls",
    "guerra comercial", "trade war", "trade",
  ],
  divisas: [
    "tasa", "rate", "tipo de cambio", "exchange rate", "dólar", "dollar", "peso chileno", "divisa", "inflación", "inflation",
    "ipc", "cpi", "fomc", "rpm", "ipom", "tpm", "política monetaria", "monetary policy", "interest", "employment situation",
    "nóminas", "payroll",
  ],
  geopolitica: [
    "sanción", "sanciones", "sanction", "guerra", "war", "conflicto", "conflict", "ormuz", "hormuz", "militar", "military",
    "ataque", "attack", "embargo", "otan", "nato", "misil", "missile",
  ],
};

/** Cada tema con sus frases ya normalizadas y sin repetir («sanción» y «sanciones» son la misma). */
const LEXICO = new Map<Tema, readonly Frase[]>(
  TEMAS.map((t) => [t, [...new Set(LEXICO_CRUDO[t].map((e) => frase(e).join(" ")))].map((e) => e.split(" "))]),
);

/** Cuántas entradas distintas del léxico de cada tema aparecen en el título. */
export function aciertosPorTema(titulo: string): Record<Tema, number> {
  const t = tokens(titulo);
  const aciertos = {} as Record<Tema, number>;
  for (const tema of TEMAS) aciertos[tema] = (LEXICO.get(tema) ?? []).filter((f) => contiene(t, f)).length;
  return aciertos;
}

const DECISION: readonly Frase[] = [
  "decisión", "decide", "decidió", "acuerda", "acordó", "sanción", "sanciones", "recorte", "recorta", "cuota", "cuotas",
  "decision", "decides", "rate decision", "sanction", "cut", "quota",
].map(frase);

/** ¿El título trae una palabra de decisión (`decisión`, `rate decision`, `sanciones`, `recorte`, `cuotas`…)? */
export function tieneDecision(titulo: string): boolean {
  const t = tokens(titulo);
  return DECISION.some((f) => contiene(t, f));
}

/**
 * Claves de agenda: publicaciones con fecha conocida que, aunque los títulos difieran, son el mismo evento. Cada clave
 * exige que todos sus grupos aparezcan (cada grupo, cualquiera de sus frases). IPC (Chile) y CPI (EE. UU.) son claves
 * distintas a propósito: misma clase de dato, eventos distintos.
 */
const AGENDA: readonly { clave: string; etiqueta: string; grupos: readonly (readonly Frase[])[] }[] = [
  { clave: "fomc", etiqueta: "FOMC", grupos: [["fomc", "federal open market committee"].map(frase)] },
  { clave: "rpm", etiqueta: "RPM", grupos: [["rpm", "reunión de política monetaria"].map(frase)] },
  { clave: "ipom", etiqueta: "IPoM", grupos: [["ipom", "informe de política monetaria"].map(frase)] },
  { clave: "ipc", etiqueta: "IPC", grupos: [["ipc", "índice de precios al consumidor"].map(frase)] },
  { clave: "cpi", etiqueta: "CPI", grupos: [["cpi", "consumer price index"].map(frase)] },
  { clave: "employment_situation", etiqueta: "Employment Situation", grupos: [["employment situation"].map(frase)] },
  {
    clave: "opep_reunion",
    etiqueta: "Reunión OPEP+",
    grupos: [["opep", "opep+", "opec", "opec+"].map(frase), ["reunión", "meeting", "ministerial", "jmmc"].map(frase)],
  },
  {
    clave: "weo",
    etiqueta: "WEO",
    grupos: [["weo", "world economic outlook", "perspectivas de la economía mundial"].map(frase)],
  },
];

export const CLAVES_AGENDA: readonly string[] = AGENDA.map((a) => a.clave);

/** La primera clave de agenda que reconoce el título (en el orden de la lista), o `null`. */
export function claveDeAgenda(titulo: string): string | null {
  const t = tokens(titulo);
  return AGENDA.find((a) => a.grupos.every((g) => g.some((f) => contiene(t, f))))?.clave ?? null;
}

/** Nombre visible de una clave de agenda (la clave misma si no está en la lista). */
export function etiquetaAgenda(clave: string): string {
  return AGENDA.find((a) => a.clave === clave)?.etiqueta ?? clave;
}
