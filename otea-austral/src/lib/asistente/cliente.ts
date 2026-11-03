/**
 * Lado del navegador del asistente: hace la pregunta, lee la respuesta que llega por NDJSON y la convierte en
 * el estado que muestra la interfaz. Sin Zod ni nada del servidor (lo importa un componente de cliente): solo
 * `limites.ts`.
 */
import {
  RUTA_ASISTENTE,
  type CodigoErrorEvento,
  type Enlace,
  type EventoAsistente,
  type ModoRespuesta,
  type SolicitudAsistente,
} from "./limites";

/** Por qué no llegó una respuesta (antes de empezarla o a mitad de camino). */
export type FalloSolicitud = "limite" | "invalida" | "servidor" | "red" | "cortada";

export class ErrorAsistente extends Error {
  constructor(readonly tipo: FalloSolicitud) {
    super(`El asistente no pudo responder (${tipo})`);
    this.name = "ErrorAsistente";
  }
}

const esTexto = (v: unknown): v is string => typeof v === "string";
const esEnlace = (v: unknown): v is Enlace =>
  typeof v === "object" && v !== null && esTexto((v as Enlace).titulo) && esTexto((v as Enlace).href);

/** ¿Es un evento del formato que habla el servidor? Lo demás se ignora: la interfaz no debe romperse por un evento raro. */
export function esEvento(valor: unknown): valor is EventoAsistente {
  if (typeof valor !== "object" || valor === null) return false;
  const e = valor as Record<string, unknown>;
  switch (e.t) {
    case "inicio":
      return (e.modo === "base" || e.modo === "ia") && (e.coincidencia === undefined || esTexto(e.coincidencia));
    case "texto":
      return esTexto(e.d);
    case "fuentes":
      return Array.isArray(e.items) && e.items.every(esEnlace);
    case "sugerencias":
      return Array.isArray(e.items) && e.items.every(esTexto);
    case "error":
      return e.codigo === "proveedor" || e.codigo === "salida" || e.codigo === "limite" || e.codigo === "interno";
    case "fin":
      return true;
    default:
      return false;
  }
}

/** Convierte un flujo de bytes en líneas (el último trozo sin salto de línea espera al siguiente). */
export async function* lineas(cuerpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      let corte = resto.indexOf("\n");
      while (corte >= 0) {
        yield resto.slice(0, corte);
        resto = resto.slice(corte + 1);
        corte = resto.indexOf("\n");
      }
    }
    resto += decodificador.decode();
    if (resto.trim() !== "") yield resto;
  } finally {
    lector.releaseLock();
  }
}

function fallo(estado: number): FalloSolicitud {
  if (estado === 429) return "limite";
  if (estado >= 500) return "servidor";
  return "invalida";
}

/**
 * Hace la pregunta y entrega los eventos a medida que llegan. Lanza `ErrorAsistente` si no se pudo hablar con el
 * servidor, si este respondió con un error o si la respuesta se cortó antes de su `fin`.
 */
export async function* preguntar(
  solicitud: SolicitudAsistente,
  senal: AbortSignal,
  peticion: typeof fetch = fetch,
): AsyncGenerator<EventoAsistente> {
  let respuesta: Response;
  try {
    respuesta = await peticion(RUTA_ASISTENTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(solicitud),
      signal: senal,
      cache: "no-store",
    });
  } catch (error) {
    if (senal.aborted) throw error;
    throw new ErrorAsistente("red");
  }
  if (!respuesta.ok) throw new ErrorAsistente(fallo(respuesta.status));
  if (!respuesta.body) throw new ErrorAsistente("servidor");

  let termino = false;
  try {
    for await (const linea of lineas(respuesta.body)) {
      if (linea.trim() === "") continue;
      let dato: unknown;
      try {
        dato = JSON.parse(linea);
      } catch {
        continue;
      }
      if (!esEvento(dato)) continue;
      if (dato.t === "fin") termino = true;
      yield dato;
    }
  } catch (error) {
    if (senal.aborted) throw error;
    throw new ErrorAsistente("cortada");
  }
  if (!termino) throw new ErrorAsistente("cortada");
}

// ── Estado de una respuesta ────────────────────────────────────────────────

/** Un tramo de respuesta: la de la IA, o la de las preguntas frecuentes (que puede ir después de una que falló). */
export type Bloque = { modo: ModoRespuesta; coincidencia?: string; texto: string };

export type Respuesta = {
  bloques: Bloque[];
  fuentes: Enlace[];
  sugerencias: string[];
  /** La IA no pudo responder (o se cortó): por qué. */
  aviso?: CodigoErrorEvento;
  estado: "cargando" | "listo" | "fallo";
  fallo?: FalloSolicitud;
};

export const RESPUESTA_INICIAL: Respuesta = { bloques: [], fuentes: [], sugerencias: [], estado: "cargando" };

/**
 * Los enlaces del asistente son siempre rutas del propio sitio (`/metodologia`, `/#temas`). Lo que llegue por la red y
 * no lo sea (otro dominio, `//host`, `javascript:`) no se muestra: la interfaz no confía en el servidor para esto.
 */
export function esRutaInterna(href: string): boolean {
  return /^\/(?![/\\])/.test(href) && !/[\s\u0000-\u001f]/.test(href);
}

/** Aplica un evento del servidor al estado de la respuesta (sin mutarlo). */
export function aplicar(r: Respuesta, evento: EventoAsistente): Respuesta {
  const ultimo = r.bloques[r.bloques.length - 1];
  switch (evento.t) {
    case "inicio": {
      const nuevo: Bloque = { modo: evento.modo, coincidencia: evento.coincidencia, texto: "" };
      // Un bloque que no llegó a tener texto se reemplaza; uno con texto (la IA que se cortó) queda y el nuevo va debajo.
      const bloques = ultimo && ultimo.texto === "" ? [...r.bloques.slice(0, -1), nuevo] : [...r.bloques, nuevo];
      return { ...r, bloques, fuentes: [], sugerencias: [] };
    }
    case "texto": {
      if (!ultimo) return { ...r, bloques: [{ modo: "base", texto: evento.d }] };
      return { ...r, bloques: [...r.bloques.slice(0, -1), { ...ultimo, texto: ultimo.texto + evento.d }] };
    }
    case "fuentes":
      return { ...r, fuentes: evento.items.filter((e) => esRutaInterna(e.href)) };
    case "sugerencias":
      return { ...r, sugerencias: evento.items };
    case "error":
      return { ...r, aviso: evento.codigo };
    case "fin":
      return { ...r, estado: "listo" };
  }
}

/** La conexión falló o se cortó: se conserva lo que ya llegó. */
export function fallar(r: Respuesta, tipo: FalloSolicitud): Respuesta {
  return { ...r, estado: "fallo", fallo: tipo };
}

// ── Textos de la interfaz ──────────────────────────────────────────────────

/** Lo primero que ve la persona en la conversación. */
export const SALUDO_INICIAL =
  "Hola, soy el asistente de Otea Austral. Te cuento cómo funciona el sitio, cómo calculamos la confianza de una alerta y de dónde salen las fuentes. No doy consejos de inversión ni pronósticos.";

/** Qué se le dice a la persona cuando la IA no pudo responder y se le muestra la pregunta frecuente. */
export const AVISOS_DE_IA: Record<CodigoErrorEvento, string> = {
  proveedor: "No pude redactar la respuesta con IA en este momento. Esto es lo que dicen las preguntas frecuentes:",
  salida:
    "Descarté la respuesta con IA porque no cumplía las reglas de lenguaje del sitio. Esto es lo que dicen las preguntas frecuentes:",
  limite: "Se agotó el cupo de respuestas con IA por hoy. Esto es lo que dicen las preguntas frecuentes:",
  interno: "Algo falló de nuestro lado. Esto es lo que dicen las preguntas frecuentes:",
};

export const MENSAJES_DE_FALLO: Record<FalloSolicitud, string> = {
  limite: "Hiciste muchas preguntas seguidas. Espera un minuto y vuelve a intentarlo.",
  invalida: "No pudimos procesar esa pregunta. Prueba con otra más corta.",
  servidor: "El asistente no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
  red: "No hay conexión con el sitio. Revisa tu conexión e inténtalo de nuevo.",
  cortada: "La respuesta se interrumpió. Inténtalo de nuevo.",
};
