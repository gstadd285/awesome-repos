/**
 * Gasto de la IA, común al asistente (`asistente/presupuesto.ts`, tope diario) y a los borradores
 * (`borradores/presupuesto-postgres.ts`, tope mensual). La plata se mide en «micros»: millonésimas de dólar. Como el
 * precio de un modelo se publica en dólares por millón de tokens, ese mismo número es el costo en micros de cada token
 * (a US$ 0,10 por millón, un token cuesta 0,1 micro).
 *
 * El flujo de cada llamada es reservar el peor caso ANTES de llamar al modelo y ajustar a lo realmente usado al
 * terminar: así una ráfaga de solicitudes simultáneas no puede pasarse del tope. Si no se puede comprobar el tope (la
 * base cae), no se llama al modelo.
 */

/** Dólares por millón de tokens. */
export type Precios = { entrada: number; salida: number };

export type Topes = { micros: number; llamadas: number };

/** Tokens de una llamada. `entrada` incluye, para el asistente, lo leído y lo escrito en la caché. */
export type Uso = { entrada: number; salida: number };

/** Uso con la caché del prompt aparte: escribir en ella cuesta 1,25 veces la entrada y leerla, 0,1 veces. */
export type UsoDetallado = { entrada: number; cacheEscrita: number; cacheLeida: number; salida: number };

/** Factores de la caché de 5 minutos sobre el precio de entrada (referencia de precios de Anthropic). */
export const FACTOR_CACHE_ESCRITA = 1.25;
export const FACTOR_CACHE_LEIDA = 0.1;

export interface Presupuesto {
  /** Reserva `micros` del tope vigente. `false` si ya no alcanza, si se llegó al máximo de llamadas o si no se pudo comprobar. */
  reservar(micros: number): Promise<boolean>;
  /** Cambia la reserva por el costo real (puede ser menor o mayor). */
  ajustar(reservado: number, real: number): Promise<void>;
}

/** Tokens que ocupa un texto, por lo alto: el español con el tokenizador de los modelos actuales ronda 1 por cada 3 caracteres. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 2.5);
}

/** Costo, en micros, de lo que se usó (la entrada al precio de entrada, sin distinguir la caché: por lo alto). */
export function costoEnMicros(uso: Uso, precios: Precios): number {
  return Math.ceil(uso.entrada * precios.entrada + uso.salida * precios.salida);
}

/** Costo, en micros, con la caché a su precio. */
export function costoDetalladoEnMicros(uso: UsoDetallado, precios: Precios): number {
  const entrada = uso.entrada + uso.cacheEscrita * FACTOR_CACHE_ESCRITA + uso.cacheLeida * FACTOR_CACHE_LEIDA;
  return Math.ceil(entrada * precios.entrada + uso.salida * precios.salida);
}

/** Lo más que puede costar una llamada: la entrada estimada por lo alto y la salida completa. */
export function costoMaximoEnMicros(textoEntrada: string, maxTokens: number, precios: Precios): number {
  return costoEnMicros({ entrada: estimarTokens(textoEntrada), salida: maxTokens }, precios);
}

/** En dólares, para los mensajes y la documentación. */
export const microsADolares = (micros: number) => micros / 1_000_000;
export const dolaresAMicros = (dolares: number) => Math.round(dolares * 1_000_000);
