/**
 * Comprobación anticopia (`docs/alertas-reales.md` §4.5, paso 5): el borrador debe estar escrito con palabras de Otea,
 * nunca copiado de la fuente (CLAUDE.md, regla 6). Se compara el texto normalizado (sin tildes, minúsculas, solo letras
 * y números) del borrador con el texto leído de las fuentes, **en memoria**: de la comparación solo se guardan las dos
 * cifras.
 *
 * - `tramo`: la secuencia común más larga, en palabras, entre un campo del borrador y un documento.
 * - `proporcion`: parte de los 5-gramas del borrador que también están en algún documento.
 *
 * Se rechaza con un tramo de 10 palabras o más, o con más del 10 % de 5-gramas en común. Un nombre propio de varias
 * palabras («Reunión de Política Monetaria del Banco Central de Chile») cuenta como **una** palabra: citar un organismo
 * no es copiar. Los umbrales se calibran con comunicados reales en cuanto haya fuentes con `lectura_ia`.
 */

export const TRAMO_MAXIMO = 9;
export const PROPORCION_MAXIMA = 0.1;
const N = 5;

export type ResultadoCopia = {
  /** Secuencia común más larga, en palabras. */
  tramo: number;
  /** Entre 0 y 1, con tres decimales. */
  proporcion: number;
};

/** Dos o más palabras con mayúscula inicial seguidas (con «de», «del», «la», «y»… entre ellas): un nombre propio. */
const NOMBRE_PROPIO = /\p{Lu}[\p{L}\p{N}]*(?:\s+(?:(?:de|del|la|las|los|y|e|para|en)\s+)?\p{Lu}[\p{L}\p{N}]*)+/gu;

/**
 * Palabras del texto normalizado: sin tildes, en minúsculas, solo letras y números. Cada nombre propio de varias palabras
 * queda como una sola, la misma en el borrador y en la fuente.
 */
export function palabras(texto: string): string[] {
  return texto
    .replace(NOMBRE_PROPIO, (nombre) => ` ${nombre.replace(/[^\p{L}\p{N}]+/gu, "")} `)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function ngramas(lista: readonly string[], n: number): string[] {
  const salida: string[] = [];
  for (let i = 0; i + n <= lista.length; i++) salida.push(lista.slice(i, i + n).join(" "));
  return salida;
}

/**
 * Secuencia común más larga de palabras entre `a` y `b` (programación dinámica con dos filas: O(|a|·|b|) en tiempo,
 * O(|b|) en memoria). Con el borrador acotado (~600 palabras) y 3 documentos de 12.000 caracteres, son unos pocos
 * millones de comparaciones.
 */
export function tramoComun(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  // Las palabras pasan a números para comparar enteros.
  const ids = new Map<string, number>();
  const codificar = (p: string) => {
    let id = ids.get(p);
    if (id === undefined) {
      id = ids.size;
      ids.set(p, id);
    }
    return id;
  };
  const ca = a.map(codificar);
  const cb = b.map(codificar);
  let anterior = new Uint16Array(cb.length + 1);
  let actual = new Uint16Array(cb.length + 1);
  let mejor = 0;
  for (let i = 1; i <= ca.length; i++) {
    for (let j = 1; j <= cb.length; j++) {
      if (ca[i - 1] === cb[j - 1]) {
        const v = Math.min(anterior[j - 1] + 1, 65_535);
        actual[j] = v;
        if (v > mejor) mejor = v;
      } else {
        actual[j] = 0;
      }
    }
    [anterior, actual] = [actual, anterior];
    actual.fill(0);
  }
  return mejor;
}

/**
 * Compara los campos del borrador (cada uno por separado: una secuencia no cruza de un campo a otro) con los textos
 * leídos de las fuentes.
 */
export function compararCopia(campos: readonly string[], fuentes: readonly string[]): ResultadoCopia {
  const documentos = fuentes.map(palabras).filter((p) => p.length > 0);
  if (documentos.length === 0) return { tramo: 0, proporcion: 0 };
  const deLasFuentes = new Set(documentos.flatMap((p) => ngramas(p, N)));
  let tramo = 0;
  let total = 0;
  let comunes = 0;
  for (const campo of campos) {
    const p = palabras(campo);
    for (const doc of documentos) tramo = Math.max(tramo, tramoComun(p, doc));
    for (const g of ngramas(p, N)) {
      total += 1;
      if (deLasFuentes.has(g)) comunes += 1;
    }
  }
  const proporcion = total === 0 ? 0 : Math.round((comunes / total) * 1000) / 1000;
  return { tramo, proporcion };
}

/** ¿Es copia según los umbrales? */
export function esCopia({ tramo, proporcion }: ResultadoCopia): boolean {
  return tramo > TRAMO_MAXIMO || proporcion > PROPORCION_MAXIMA;
}
