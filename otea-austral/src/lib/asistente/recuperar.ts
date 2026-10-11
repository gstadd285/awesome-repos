/**
 * Recuperación léxica sobre la base de conocimiento: qué entradas responden a una pregunta. Sin red, sin
 * modelos y sin costo; es el modo base del asistente y también elige el contexto que ve el modelo en el modo con
 * IA, así que una pregunta que aquí no encuentra nada tampoco llega al modelo.
 *
 * Puntaje de una entrada, de 0 a 1: qué parte de la pregunta explica. Cada raíz de la pregunta pesa según lo
 * rara que es en la base (una palabra que está en todas partes, como «alerta», casi no distingue) y según dónde
 * aparece en la entrada: en su pregunta o en una etiqueta pesa el triple que en su respuesta. Una etiqueta de
 * varias palabras («lista de espera») solo cuenta si la pregunta la trae completa. Las palabras que no están
 * en ninguna entrada restan: «escribe un poema sobre el mar» no debe responderse por «escribe».
 */
import { BASE_CONOCIMIENTO, type Entrada } from "./conocimiento";
import { normalizar, raiz, raices } from "./texto";

export type Coincidencia = { entrada: Entrada; puntaje: number };

/** Por debajo de este puntaje no hay nada relevante: se dice así en lugar de responder otra cosa. */
export const PUNTAJE_MINIMO = 0.4;

/** Cuántas entradas se entregan como contexto al modelo. */
export const ENTRADAS_DE_CONTEXTO = 3;

const PESO_FUERTE = 3; // en la pregunta o en una etiqueta
const PESO_RESPUESTA = 1;
/** Una palabra que no está en ninguna entrada pesa como una muy rara, aunque algo menos: puede ser una errata. */
const FACTOR_DESCONOCIDA = 0.8;

type Campos = {
  entrada: Entrada;
  pregunta: Set<string>;
  sinonimos: Set<string>;
  frases: string[][];
  respuesta: Set<string>;
  /** Las raíces de todas las palabras de la pregunta (también las vacías), solo para desempatar. */
  palabras: Set<string>;
};

type Indice = { campos: Campos[]; idf: Map<string, number>; idfDesconocida: number };

const indices = new WeakMap<readonly Entrada[], Indice>();

/** Todas las palabras de un texto, también las vacías, reducidas a su raíz. */
function palabrasDe(texto: string): string[] {
  return normalizar(texto).split(" ").map(raiz);
}

function indexar(base: readonly Entrada[]): Indice {
  const campos = base.map((entrada): Campos => {
    const sinonimos = new Set<string>();
    const frases: string[][] = [];
    for (const etiqueta of entrada.etiquetas) {
      const r = [...new Set(raices(etiqueta))];
      if (r.length === 1) sinonimos.add(r[0]);
      else if (r.length > 1) frases.push(r);
    }
    return {
      entrada,
      pregunta: new Set(raices(entrada.pregunta)),
      sinonimos,
      frases,
      respuesta: new Set(raices(entrada.respuesta)),
      palabras: new Set(palabrasDe(entrada.pregunta)),
    };
  });
  const apariciones = new Map<string, number>();
  for (const c of campos) {
    const raicesDeLaEntrada = new Set([...c.pregunta, ...c.sinonimos, ...c.frases.flat(), ...c.respuesta]);
    for (const raiz of raicesDeLaEntrada) apariciones.set(raiz, (apariciones.get(raiz) ?? 0) + 1);
  }
  const n = Math.max(1, base.length);
  const idf = new Map([...apariciones].map(([raiz, df]) => [raiz, Math.log(1 + n / df)] as const));
  return { campos, idf, idfDesconocida: Math.log(1 + n) * FACTOR_DESCONOCIDA };
}

function indiceDe(base: readonly Entrada[]): Indice {
  let indice = indices.get(base);
  if (!indice) {
    indice = indexar(base);
    indices.set(base, indice);
  }
  return indice;
}

/**
 * Raíces de la consulta que no aparecen en ninguna entrada de la base: palabras que la base no conoce («capital»,
 * «Francia»). Sirve para distinguir una pregunta de seguimiento («¿y eso por qué?», solo palabras conocidas o vacías) de
 * una pregunta sobre otro tema.
 */
export function palabrasDesconocidas(consulta: string, base: readonly Entrada[] = BASE_CONOCIMIENTO): string[] {
  const { idf } = indiceDe(base);
  return [...new Set(raices(consulta))].filter((r) => !idf.has(r));
}

/**
 * Las entradas que mejor responden a la consulta, de más a menos relevante. Incluye las que no llegan al mínimo
 * (para poder sugerir «¿quisiste preguntar…?»); quien decide si responde compara con `PUNTAJE_MINIMO`.
 */
export function recuperar(consulta: string, base: readonly Entrada[] = BASE_CONOCIMIENTO, max = 5): Coincidencia[] {
  const raicesConsulta = [...new Set(raices(consulta))];
  if (raicesConsulta.length === 0 || base.length === 0) return [];
  const { campos, idf, idfDesconocida } = indiceDe(base);
  const pesoDe = (raiz: string) => idf.get(raiz) ?? idfDesconocida;
  const total = raicesConsulta.reduce((suma, raiz) => suma + pesoDe(raiz), 0);
  const palabrasConsulta = new Set(palabrasDe(consulta));

  const candidatas: (Coincidencia & { enPregunta: number; parecido: number })[] = [];
  for (const c of campos) {
    const cubiertas = new Set(c.frases.filter((f) => f.every((r) => raicesConsulta.includes(r))).flat());
    let suma = 0;
    let enPregunta = 0;
    for (const raiz of raicesConsulta) {
      const fuerte = c.pregunta.has(raiz) || c.sinonimos.has(raiz) || cubiertas.has(raiz);
      const peso = fuerte ? PESO_FUERTE : c.respuesta.has(raiz) ? PESO_RESPUESTA : 0;
      suma += pesoDe(raiz) * peso;
      if (c.pregunta.has(raiz)) enPregunta += pesoDe(raiz);
    }
    if (suma === 0) continue;
    const comunes = [...c.palabras].filter((p) => palabrasConsulta.has(p)).length;
    candidatas.push({
      entrada: c.entrada,
      puntaje: suma / (total * PESO_FUERTE),
      enPregunta: enPregunta / total,
      parecido: comunes / (c.palabras.size + palabrasConsulta.size - comunes),
    });
  }
  // A igual puntaje gana la entrada cuya pregunta se parece más a lo escrito; luego, el orden de la base
  // (las curadas van antes que las derivadas). El orden es estable.
  const redondear = (x: number) => Math.round(x * 1e6);
  candidatas.sort(
    (a, b) =>
      redondear(b.puntaje) - redondear(a.puntaje) ||
      redondear(b.enPregunta) - redondear(a.enPregunta) ||
      redondear(b.parecido) - redondear(a.parecido),
  );
  return candidatas.slice(0, max).map(({ entrada, puntaje }) => ({ entrada, puntaje }));
}
