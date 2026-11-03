import type { BaseDeDatos } from "@/lib/db/cliente";
import { codigoError } from "@/lib/db/cliente";
import type { Presupuesto, Topes } from "@/lib/ia/gasto";
import { SQL_CANDADO_GASTO, SQL_GASTO_TOTAL } from "@/lib/ia/gasto-postgres";
import { logSecurityEvent } from "@/lib/security/log";

/**
 * Tope mensual de los borradores en la base (`borradores_uso`, migración 0010; mismo patrón que `asistente_uso`). El mes es
 * el de Chile y lo decide el reloj de la base: todas las instancias cuentan sobre el mismo mes. Reservar es una sentencia
 * dentro de una transacción con el candado del gasto de la IA (`gasto-postgres.ts`), así que el tope mensual, el número de
 * llamadas y, si se fijó, el tope acumulado de toda la IA se comprueban juntos y de a una reserva a la vez.
 *
 * Si la base falla NO se reserva (y por tanto no se llama al modelo): sin poder contar el gasto, no se gasta.
 */

/** El techo autorizado, en micros: la base tampoco admite un tope mayor (`borradores_uso.tope_micros`). */
export const TECHO_MENSUAL_MICROS = 5_000_000;

// $1 micros a reservar · $2 tope del mes · $3 llamadas del mes · $4 tope total (o nulo).
const SQL_RESERVAR = `insert into borradores_uso as u (mes, llamadas, costo_micros, tope_micros)
  select date_trunc('month', now() at time zone 'America/Santiago')::date, 1, $1::bigint, $2::bigint
  where $4::bigint is null or ${SQL_GASTO_TOTAL} + $1::bigint <= $4::bigint
  on conflict (mes) do update
    set llamadas = u.llamadas + 1, costo_micros = u.costo_micros + $1::bigint, tope_micros = $2::bigint, actualizado = now()
    where u.llamadas < $3::integer
      and u.costo_micros + $1::bigint <= least($2::bigint, 5000000)
      and ($4::bigint is null or ${SQL_GASTO_TOTAL} + $1::bigint <= $4::bigint)
  returning mes::text as mes`;

const SQL_AJUSTAR = `update borradores_uso
  set costo_micros = greatest(0, costo_micros + $1::bigint), actualizado = now()
  where mes = $2::date`;

export type TopesBorradores = Topes & {
  /** Tope acumulado de toda la IA, en micros (`IA_TOPE_TOTAL_USD`); sin él, solo cuenta el del mes. */
  totalMicros?: number;
};

export function crearPresupuestoBorradoresPostgres(db: BaseDeDatos, topes: TopesBorradores): Presupuesto {
  const techo = Math.min(topes.micros, TECHO_MENSUAL_MICROS);
  /** Mes de la última reserva: el ajuste va a esa fila aunque la llamada termine pasada la medianoche del último día. */
  let mesReservado: string | null = null;

  return {
    async reservar(micros) {
      if (!Number.isInteger(micros) || micros < 0 || micros > techo) return false;
      if (topes.totalMicros !== undefined && (!Number.isInteger(topes.totalMicros) || topes.totalMicros <= 0)) return false;
      try {
        const mes = await db.transaccion(async (tx) => {
          await tx.consulta(SQL_CANDADO_GASTO);
          const [fila] = await tx.consulta<{ mes: string }>(SQL_RESERVAR, [micros, techo, topes.llamadas, topes.totalMicros ?? null]);
          return fila?.mes ?? null;
        });
        if (mes) mesReservado = mes;
        return mes !== null;
      } catch (error) {
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: codigoError(error) ?? "borradores_reservar" });
        return false;
      }
    },

    async ajustar(reservado, real) {
      const diferencia = Math.round(real - reservado);
      if (!Number.isFinite(diferencia) || diferencia === 0 || !mesReservado) return;
      try {
        await db.consulta(SQL_AJUSTAR, [diferencia, mesReservado]);
      } catch (error) {
        // Queda la reserva completa, que es lo prudente.
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: codigoError(error) ?? "borradores_ajustar" });
      }
    },
  };
}
