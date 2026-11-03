import type { BaseDeDatos, Consultor } from "@/lib/db/cliente";
import { codigoError } from "@/lib/db/cliente";
import { SQL_CANDADO_GASTO, SQL_GASTO_TOTAL } from "@/lib/ia/gasto-postgres";
import { logSecurityEvent } from "@/lib/security/log";
import type { Presupuesto, Topes } from "./presupuesto";

// El día es el de Chile y lo decide el reloj de la base: todas las instancias cuentan sobre el mismo día.
// Reservar es UNA sentencia atómica: si el día ya está al tope no cambia nada y no devuelve filas.
const SQL_RESERVAR = `insert into asistente_uso as u (dia, llamadas, costo_micros)
  values ((now() at time zone 'America/Santiago')::date, 1, $1::bigint)
  on conflict (dia) do update
    set llamadas = u.llamadas + 1, costo_micros = u.costo_micros + $1::bigint, actualizado = now()
    where u.llamadas < $3::integer and u.costo_micros + $1::bigint <= $2::bigint
  returning 1`;

// Con el tope acumulado de toda la IA (`IA_TOPE_TOTAL_USD`): la misma reserva, que además no deja pasar la suma de lo
// gastado por el asistente y los borradores. Corre con el candado del gasto (`gasto-postgres.ts`). $4: el tope total.
const SQL_RESERVAR_CON_TOTAL = `insert into asistente_uso as u (dia, llamadas, costo_micros)
  select (now() at time zone 'America/Santiago')::date, 1, $1::bigint
  where ${SQL_GASTO_TOTAL} + $1::bigint <= $4::bigint
  on conflict (dia) do update
    set llamadas = u.llamadas + 1, costo_micros = u.costo_micros + $1::bigint, actualizado = now()
    where u.llamadas < $3::integer and u.costo_micros + $1::bigint <= $2::bigint
      and ${SQL_GASTO_TOTAL} + $1::bigint <= $4::bigint
  returning 1`;

const SQL_AJUSTAR = `update asistente_uso
  set costo_micros = greatest(0, costo_micros + $1::bigint), actualizado = now()
  where dia = (now() at time zone 'America/Santiago')::date`;

/**
 * Presupuesto en la base (migración 0005): lo comparten todas las instancias y sobrevive a los reinicios. Si la
 * base falla NO se reserva (y por tanto no se llama al modelo): sin poder contar el gasto, no se gasta.
 *
 * Con `totalMicros` (el tope acumulado de toda la IA, opcional) cada reserva corre en una transacción con el candado del
 * gasto, para que el asistente y los borradores no pasen juntos el tope; sin él, la reserva es la de siempre.
 */
export function crearPresupuestoPostgres(
  db: Consultor & Partial<Pick<BaseDeDatos, "transaccion">>,
  topes: Topes,
  { totalMicros }: { totalMicros?: number } = {},
): Presupuesto {
  return {
    async reservar(micros) {
      if (!Number.isInteger(micros) || micros < 0 || micros > topes.micros) return false;
      try {
        if (totalMicros !== undefined) {
          // Sin transacciones no se puede comprobar el tope total: no se reserva.
          if (!db.transaccion || !Number.isInteger(totalMicros) || totalMicros <= 0) return false;
          return await db.transaccion(async (tx) => {
            await tx.consulta(SQL_CANDADO_GASTO);
            const filas = await tx.consulta(SQL_RESERVAR_CON_TOTAL, [micros, topes.micros, topes.llamadas, totalMicros]);
            return filas.length === 1;
          });
        }
        const filas = await db.consulta(SQL_RESERVAR, [micros, topes.micros, topes.llamadas]);
        return filas.length === 1;
      } catch (error) {
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: codigoError(error) ?? "asistente_reservar" });
        return false;
      }
    },

    async ajustar(reservado, real) {
      const diferencia = Math.round(real - reservado);
      if (!Number.isFinite(diferencia) || diferencia === 0) return;
      try {
        await db.consulta(SQL_AJUSTAR, [diferencia]);
      } catch (error) {
        // Queda la reserva completa, que es lo prudente.
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: codigoError(error) ?? "asistente_ajustar" });
      }
    },
  };
}
