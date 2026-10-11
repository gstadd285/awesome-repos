import type { Consultor } from "@/lib/db/cliente";
import { codigoError } from "@/lib/db/cliente";
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

const SQL_AJUSTAR = `update asistente_uso
  set costo_micros = greatest(0, costo_micros + $1::bigint), actualizado = now()
  where dia = (now() at time zone 'America/Santiago')::date`;

/**
 * Presupuesto en la base (migración 0005): lo comparten todas las instancias y sobrevive a los reinicios. Si la
 * base falla NO se reserva (y por tanto no se llama al modelo): sin poder contar el gasto, no se gasta.
 */
export function crearPresupuestoPostgres(db: Consultor, topes: Topes): Presupuesto {
  return {
    async reservar(micros) {
      if (!Number.isInteger(micros) || micros < 0 || micros > topes.micros) return false;
      try {
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
