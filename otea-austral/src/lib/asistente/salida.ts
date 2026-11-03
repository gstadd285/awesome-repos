/**
 * Revisión de lo que escribe el modelo ANTES de que llegue a la persona. El texto se retiene hasta completar
 * cada frase y solo sale si la frase pasa; si una falla, se corta ahí y el servicio responde con la base de
 * conocimiento. Así nada sin revisar se muestra, ni siquiera de forma pasajera.
 *
 * Qué se rechaza (el modelo no debería producirlo; esto es la red de seguridad, no la primera defensa):
 * - lenguaje de recomendación o promesas de rentabilidad (las mismas frases que veta el sitio en las alertas);
 * - enlaces, direcciones web y HTML: los únicos enlaces son los de la base, que los agrega el servidor;
 * - cifras de dos o más dígitos que no estén en el contexto ni en la pregunta (precios, fechas, porcentajes
 *   inventados);
 * - pistas de que está repitiendo sus instrucciones.
 */
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { normalizar } from "./texto";

export type Rechazo = "prohibida" | "enlace" | "formato" | "numero" | "filtracion";

/** Largo máximo de una respuesta con IA, en caracteres (unas 200 palabras). */
export const MAX_SALIDA = 1200;
/** Una «frase» sin un solo punto en tanto texto no es una respuesta: se corta. */
const MAX_FRASE = 800;

// La base menciona example.org (los enlaces de las alertas de ejemplo): es el único dominio que se permite citar.
const DOMINIOS_PERMITIDOS = new Set(["example.org"]);
const DOMINIO =
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|cl|org|net|io|ai|co|gov|edu|app|dev|info|me|ly|xyz|es|ar|pe|mx|br|us|uk|eu|ru|cn|top|site|online|link)\b/gi;
const ESQUEMA = /\b(?:https?|ftp|file|javascript|data|vbscript):/i;
const ENLACE_MARKDOWN = /!?\[[^\]]*\]\([^)]*\)/;
const ETIQUETA_HTML = /<\/?[a-z!][^>]*>/i;
const FILTRACION = /\b(system prompt|prompt del sistema|prompt inicial|mis instrucciones|instrucciones del sistema|mensaje del sistema)\b/;
const CIFRAS = /\d+(?:[.,]\d+)*/g;

/** ¿Cuál es el problema de esta frase? `undefined` si puede mostrarse. */
export function revisarFrase(frase: string, respaldo: string): Rechazo | undefined {
  if (frasesProhibidas(frase).length > 0) return "prohibida";
  if (ESQUEMA.test(frase) || /\bwww\./i.test(frase) || ENLACE_MARKDOWN.test(frase)) return "enlace";
  for (const dominio of frase.match(DOMINIO) ?? []) {
    if (!DOMINIOS_PERMITIDOS.has(dominio.toLowerCase())) return "enlace";
  }
  if (ETIQUETA_HTML.test(frase)) return "formato";
  if (FILTRACION.test(normalizar(frase))) return "filtracion";
  const conocidas = new Set(respaldo.match(CIFRAS) ?? []);
  for (const cifra of frase.match(CIFRAS) ?? []) {
    if (cifra.replace(/\D/g, "").length >= 2 && !conocidas.has(cifra)) return "numero";
  }
  return undefined;
}

/** Quita el formato Markdown que el modelo agrega aunque se le pida texto plano (la interfaz no lo interpreta). */
export function limpiarFormato(frase: string): string {
  return frase
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^(\s*)#{1,6}\s+/gm, "$1")
    .replace(/^(\s*)>\s?/gm, "$1")
    .replace(/^(\s*)[-*]\s+/gm, "$1• ");
}

export type Revision = {
  /** Frases ya revisadas y limpias, en orden, listas para enviar. */
  frases: string[];
  /** Por qué se cortó la respuesta. Después de esto el filtro no entrega nada más. */
  rechazo?: Rechazo;
  /** Se alcanzó el largo máximo: la respuesta termina en la última frase entregada, sin que sea un error. */
  truncada?: boolean;
};

export type FiltroSalida = {
  /** Recibe un fragmento del modelo y entrega las frases que quedaron completas y pasaron la revisión. */
  empujar(fragmento: string): Revision;
  /** El modelo terminó: revisa y entrega lo que quedaba sin cerrar. */
  terminar(): Revision;
  /** Todo lo entregado hasta ahora. */
  readonly entregado: string;
};

// Una frase termina en puntuación seguida de un espacio, o en un salto de línea. Un punto pegado a la
// letra siguiente («EE.UU.», «0.5») no la corta.
const FIN_DE_FRASE = /[.!?…]+["»”’)\]]*\s|\n+/g;

/**
 * @param respaldo Texto del que puede salir una cifra: el contexto que recibió el modelo y las preguntas.
 */
export function crearFiltroSalida(respaldo: string, maxCaracteres = MAX_SALIDA): FiltroSalida {
  let pendiente = "";
  let entregado = "";
  let cerrado: Pick<Revision, "rechazo" | "truncada"> | undefined;

  function procesar(candidatas: string[]): Revision {
    const frases: string[] = [];
    for (const frase of candidatas) {
      if (frase.trim() === "") {
        // Los espacios y saltos de línea del principio no se entregan.
        if (entregado !== "") {
          entregado += frase;
          frases.push(frase);
        }
        continue;
      }
      const rechazo = revisarFrase(frase, respaldo);
      if (rechazo) {
        cerrado = { rechazo };
        break;
      }
      const limpia = entregado === "" ? limpiarFormato(frase).trimStart() : limpiarFormato(frase);
      if (entregado.length + limpia.length > maxCaracteres) {
        cerrado = { truncada: true };
        break;
      }
      entregado += limpia;
      frases.push(limpia);
    }
    if (cerrado) pendiente = "";
    return { frases, ...cerrado };
  }

  function extraer(): string[] {
    const frases: string[] = [];
    let desde = 0;
    for (const m of pendiente.matchAll(FIN_DE_FRASE)) {
      const fin = (m.index ?? 0) + m[0].length;
      frases.push(pendiente.slice(desde, fin));
      desde = fin;
    }
    pendiente = pendiente.slice(desde);
    return frases;
  }

  return {
    empujar(fragmento) {
      if (cerrado) return { frases: [], ...cerrado };
      pendiente += fragmento;
      const revision = procesar(extraer());
      if (!cerrado && pendiente.length > MAX_FRASE) {
        cerrado = { rechazo: "formato" };
        pendiente = "";
        return { ...revision, ...cerrado };
      }
      return revision;
    },
    terminar() {
      if (cerrado) return { frases: [], ...cerrado };
      const resto = pendiente;
      pendiente = "";
      return procesar(extraer().concat(resto.trim() === "" ? [] : [resto]));
    },
    get entregado() {
      return entregado;
    },
  };
}
