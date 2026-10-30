import type { Confianza } from "@/lib/domain/respaldo";
import { TEMAS, type Tema } from "@/lib/domain/temas";

/**
 * Qué lleva el resumen diario de cada cuenta (`docs/alertas-reales.md` §7): funciones puras, sin reloj ni base.
 *
 * - **Ventana**: las alertas publicadas desde el último resumen que salió (su `hasta`); si nunca salió uno, desde que lo pidió
 *   y como mínimo las últimas 24 horas (así quien se quedó sin cupo o sin novedades no pierde nada). Nunca más de 7 días
 *   atrás: tras una pausa larga no llega un correo con un mes de alertas.
 * - **Temas**: los que sigue la cuenta; si no eligió ninguno, todos (lo mismo que ve en /alertas).
 * - Solo alertas **reales** publicadas o corregidas (lo filtra la consulta y otra vez aquí); las más recientes primero.
 */

/** Lo único que el resumen sabe de una alerta: su título de Otea, tema, confianza calculada y cuándo se publicó. */
export type AlertaParaResumen = {
  id: string;
  tema: Tema;
  evento: string;
  confianza: Confianza;
  /** Instante ISO de publicación (la `fecha` pública de la alerta). */
  publicada: string;
  estado: "publicada" | "corregida";
  es_ejemplo: boolean;
};

export const PRIMERA_VENTANA_MS = 24 * 60 * 60_000;
export const VENTANA_MAXIMA_MS = 7 * 24 * 60 * 60_000;
/** Las que se listan en el correo; el resto se cuenta («y N más») y se ve en /alertas. */
export const MAXIMO_EN_CORREO = 12;

export type Ventana = { desde: Date; hasta: Date };

/**
 * La ventana de una cuenta, hasta ahora: desde su último resumen enviado; si no hay, desde que lo pidió o hace 24 horas (lo
 * que sea antes). Como mucho 7 días.
 */
export function ventanaDe(ultimoHasta: Date | null, ahora: Date, pedidoDesde: Date | null = null): Ventana {
  const minimo = ahora.getTime() - VENTANA_MAXIMA_MS;
  const primera = Math.min(pedidoDesde?.getTime() ?? Infinity, ahora.getTime() - PRIMERA_VENTANA_MS);
  const desde = ultimoHasta ? ultimoHasta.getTime() : primera;
  return { desde: new Date(Math.min(Math.max(desde, minimo), ahora.getTime() - 1)), hasta: ahora };
}

/** Los temas que cuentan: los elegidos (válidos y sin repetir) o, si no hay ninguno, todos. */
export function temasEfectivos(temas: readonly string[]): Tema[] {
  const elegidos = TEMAS.filter((t) => temas.includes(t));
  return elegidos.length > 0 ? elegidos : [...TEMAS];
}

/** Las alertas reales publicadas en `(desde, hasta]` y en los temas de la cuenta, de la más reciente a la más antigua. */
export function seleccionar(alertas: readonly AlertaParaResumen[], temas: readonly string[], ventana: Ventana): AlertaParaResumen[] {
  const deLaCuenta = new Set<string>(temasEfectivos(temas));
  const desde = ventana.desde.getTime();
  const hasta = ventana.hasta.getTime();
  return alertas
    .filter((a) => !a.es_ejemplo && (a.estado === "publicada" || a.estado === "corregida") && deLaCuenta.has(a.tema))
    .filter((a) => {
      const t = Date.parse(a.publicada);
      return t > desde && t <= hasta;
    })
    .sort((a, b) => Date.parse(b.publicada) - Date.parse(a.publicada) || a.id.localeCompare(b.id));
}
