/**
 * Constantes y tipos que comparten el servidor y el navegador del asistente de preguntas. Sin dependencias:
 * lo importa un componente de cliente y no debe arrastrar Zod ni nada del servidor.
 */

export const RUTA_ASISTENTE = "/api/asistente";

/** Largo máximo de una pregunta, en caracteres. */
export const MAX_PREGUNTA = 500;

/**
 * Preguntas anteriores que viajan como contexto para resolver referencias («¿y eso cómo se calcula?»). Solo lo
 * que escribió la persona: las respuestas no se reenvían, porque el navegador podría inventarlas.
 */
export const MAX_ANTERIORES = 2;

/** Tope del cuerpo de la solicitud. */
export const MAX_CUERPO_BYTES = 8 * 1024;

/** `base`: preguntas frecuentes, sin IA y sin costo. `ia`: respuesta redactada por un modelo, con ese mismo contenido. */
export type ModoRespuesta = "base" | "ia";

export type Enlace = { titulo: string; href: string };

/**
 * Por qué una respuesta con IA no llegó a buen término (la persona recibe entonces la pregunta frecuente más
 * cercana): `proveedor` falló o se negó, `salida` incumplió las reglas de lenguaje, `limite` se agotó el cupo
 * de IA (de esa persona o del día) e `interno` es cualquier otro fallo del servidor.
 */
export type CodigoErrorEvento = "proveedor" | "salida" | "limite" | "interno";

/**
 * Una línea JSON por evento en la respuesta (NDJSON). Cada `inicio` abre un bloque de respuesta: si llega otro
 * después de un `error`, es la respuesta de respaldo y va debajo de lo que ya se mostró.
 */
export type EventoAsistente =
  | { t: "inicio"; modo: ModoRespuesta; coincidencia?: string }
  | { t: "texto"; d: string }
  | { t: "fuentes"; items: Enlace[] }
  | { t: "sugerencias"; items: string[] }
  | { t: "error"; codigo: CodigoErrorEvento }
  | { t: "fin" };

/** Cuerpo de la solicitud. */
export type SolicitudAsistente = { pregunta: string; anteriores?: string[] };
