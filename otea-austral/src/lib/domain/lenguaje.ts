/**
 * Otea informa; no aconseja (CLAUDE.md, regla 2). Frases de recomendación de
 * inversión o de promesa de rentabilidad que no pueden aparecer en el texto
 * público de una alerta ni de una corrección. Se comparan sin tildes ni
 * mayúsculas y como palabras completas.
 */
const FRASES_PROHIBIDAS = [
  "recomendamos comprar",
  "recomendamos vender",
  "recomendamos invertir",
  "te recomendamos",
  "le recomendamos",
  "les recomendamos",
  "compra ya",
  "compra ahora",
  "vende ya",
  "vende ahora",
  "invierte ya",
  "invierte ahora",
  "senal de compra",
  "senal de venta",
  "rentabilidad garantizada",
  "rentabilidad asegurada",
  "retorno garantizado",
  "retorno asegurado",
  "ganancia garantizada",
  "ganancias garantizadas",
  "ganancia asegurada",
  "ganancias aseguradas",
  "inversion sin riesgo",
  "sin ningun riesgo",
  "no puedes perder",
  "dinero facil",
  "hazte rico",
  "te haras rico",
] as const;

function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** Frases prohibidas presentes en el texto (vacío si no hay ninguna). */
export function frasesProhibidas(texto: string): string[] {
  const t = normalizar(texto);
  return FRASES_PROHIBIDAS.filter((frase) => t.includes(` ${frase} `));
}

/** Motivo legible para mostrar a quien redacta. */
export function motivoLenguaje(campo: string, frases: readonly string[]): string {
  return `${campo}: evita lenguaje de recomendación o promesas de rentabilidad («${frases.join("», «")}»).`;
}
