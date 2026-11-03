import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Trampa de tiempo contra bots: el formulario lleva la hora a la que el servidor lo generó, firmada con
 * HMAC-SHA256. Un envío sin marca, con una marca falsa, vencida o demasiado rápido (una persona tarda más
 * de unos segundos en escribir su correo y marcar la casilla) no se procesa. No sustituye a un desafío
 * tipo CAPTCHA: frena a los bots que envían el formulario sin cargarlo o sin esperar.
 */
export const ESPERA_MINIMA_MS = 3_000;
/** Una pestaña abierta más de un día debe recargarse. */
export const VIGENCIA_MARCA_MS = 24 * 60 * 60_000;
/** Diferencia de reloj tolerada entre instancias (una marca «del futuro» por poco cuenta como reciente). */
const DESFASE_RELOJ_MS = 60_000;

const firmar = (clave: Buffer, ms: number) => createHmac("sha256", clave).update(`lista-tiempo.${ms}`).digest("base64url");

export function crearMarcaDeTiempo(clave: Buffer, ahoraMs: number): string {
  return `${ahoraMs}.${firmar(clave, ahoraMs)}`;
}

export type RevisionMarca = "ok" | "ausente" | "invalida" | "muy_rapida" | "vencida";

export function revisarMarcaDeTiempo(clave: Buffer, valor: unknown, ahoraMs: number): RevisionMarca {
  if (valor === undefined || valor === null || valor === "") return "ausente";
  if (typeof valor !== "string" || valor.length > 80) return "invalida";
  const m = /^(\d{10,15})\.([A-Za-z0-9_-]{43})$/.exec(valor);
  if (!m) return "invalida";
  const emitida = Number(m[1]);
  const esperada = Buffer.from(firmar(clave, emitida));
  const recibida = Buffer.from(m[2]);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return "invalida";
  const edad = ahoraMs - emitida;
  if (edad < -DESFASE_RELOJ_MS) return "invalida";
  if (edad < ESPERA_MINIMA_MS) return "muy_rapida";
  if (edad > VIGENCIA_MARCA_MS) return "vencida";
  return "ok";
}
