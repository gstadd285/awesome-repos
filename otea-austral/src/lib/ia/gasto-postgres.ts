/**
 * Tope acumulado de toda la IA (`IA_TOPE_TOTAL_USD`, opcional; `docs/alertas-reales.md` §4.1 y §4.6): lo gastado por el
 * asistente (`asistente_uso`, por día) más lo gastado por los borradores (`borradores_uso`, por mes), desde el primer
 * día. No necesita tabla propia: las dos tablas son el historial.
 *
 * Para que dos reservas a la vez (de cualquiera de los dos servicios) no pasen el tope juntas, cada reserva con tope
 * total corre en una transacción que toma primero un candado de transacción (`pg_advisory_xact_lock`, que el agrupador de
 * conexiones de Neon admite porque se suelta al confirmar) y después reserva con una sola sentencia que vuelve a sumar.
 * Si la base falla, no se reserva y no se llama al modelo.
 */

/** Suma, en micros, de todo lo gastado en IA. Una constante: se interpola en las sentencias de reserva. */
export const SQL_GASTO_TOTAL = `((select coalesce(sum(costo_micros), 0) from asistente_uso)
    + (select coalesce(sum(costo_micros), 0) from borradores_uso))`;

/** Serializa las reservas con tope total (el número es fijo y propio de esta aplicación). */
export const SQL_CANDADO_GASTO = "select pg_advisory_xact_lock(731732)";

/** Lo gastado hasta ahora, para el tablero. */
export const SQL_LEER_GASTO_TOTAL = `select ${SQL_GASTO_TOTAL}::bigint as micros`;
