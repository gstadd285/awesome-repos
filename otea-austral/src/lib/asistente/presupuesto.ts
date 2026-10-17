/**
 * Tope de gasto diario de la IA. La plata se mide en «micros»: millonésimas de dólar. Como el precio de un
 * modelo se publica en dólares por millón de tokens, ese mismo número es el costo en micros de cada token
 * (a US$ 0,10 por millón, un token cuesta 0,1 micro).
 *
 * El flujo de cada llamada es reservar el peor caso ANTES de llamar al modelo y ajustar a lo realmente usado
 * al terminar: así una ráfaga de solicitudes simultáneas no puede pasarse del tope. Si no se puede comprobar el
 * tope (la base cae), no se llama al modelo.
 */
import { hoyEnChile } from "@/lib/format";
import type { Uso } from "./proveedor";

/** Dólares por millón de tokens. */
export type Precios = { entrada: number; salida: number };

export type Topes = { micros: number; llamadas: number };

export interface Presupuesto {
  /** Reserva `micros` del tope de hoy. `false` si ya no alcanza, si se llegó al máximo de llamadas o si no se pudo comprobar. */
  reservar(micros: number): Promise<boolean>;
  /** Cambia la reserva por el costo real (puede ser menor o mayor). */
  ajustar(reservado: number, real: number): Promise<void>;
}

/** Tokens que ocupa un texto, por lo alto: el español con el tokenizador de los modelos actuales ronda 1 por cada 3 caracteres. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 2.5);
}

/** Costo, en micros, de lo que se usó. */
export function costoEnMicros(uso: Uso, precios: Precios): number {
  return Math.ceil(uso.entrada * precios.entrada + uso.salida * precios.salida);
}

/** Lo más que puede costar una llamada: la entrada estimada por lo alto y la salida completa. */
export function costoMaximoEnMicros(textoEntrada: string, maxTokens: number, precios: Precios): number {
  return costoEnMicros({ entrada: estimarTokens(textoEntrada), salida: maxTokens }, precios);
}

/** En dólares, para los mensajes y la documentación. */
export const microsADolares = (micros: number) => micros / 1_000_000;
export const dolaresAMicros = (dolares: number) => Math.round(dolares * 1_000_000);

/**
 * Presupuesto en memoria: vale por instancia y se pierde al reiniciarla. Solo para desarrollo y pruebas; en
 * producción el modo `ia` exige la base (`presupuesto-postgres.ts`), que comparten todas las instancias.
 */
export function crearPresupuestoMemoria(topes: Topes, ahora: () => Date = () => new Date()): Presupuesto {
  let dia = "";
  let micros = 0;
  let llamadas = 0;
  const alDia = () => {
    const hoy = hoyEnChile(ahora());
    if (hoy !== dia) {
      dia = hoy;
      micros = 0;
      llamadas = 0;
    }
  };
  return {
    async reservar(pedido) {
      alDia();
      if (!Number.isFinite(pedido) || pedido < 0 || llamadas >= topes.llamadas || micros + pedido > topes.micros) {
        return false;
      }
      llamadas += 1;
      micros += pedido;
      return true;
    },
    async ajustar(reservado, real) {
      alDia();
      micros = Math.max(0, micros + (real - reservado));
    },
  };
}
