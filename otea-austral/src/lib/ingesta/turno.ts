import type { Consultor } from "@/lib/db/cliente";
import type { Turno } from "./servicio";

/**
 * Turno de una tarea en la base (`tareas_turnos`, migración `0007`): evita dos corridas a la vez sin candados de sesión,
 * que el agrupador de conexiones de Neon no conserva. Tomarlo es **una** sentencia atómica: con dos corridas a la vez,
 * la segunda espera a que la primera confirme, vuelve a evaluar la condición y no obtiene filas. El turno vence a los
 * 10 minutos (la corrida dura como mucho 4), así que una instancia que muere no bloquea la siguiente hora.
 */

export const DURACION_TURNO = "10 minutes";

// El valor del turno es la «ficha»: soltarlo solo libera el turno propio, nunca el de otra corrida que lo tomó después.
const SQL_TOMAR = `update tareas_turnos set ocupado_hasta = now() + interval '10 minutes'
  where tarea = $1 and ocupado_hasta < now()
  returning ocupado_hasta::text as ficha`;

const SQL_SOLTAR = `update tareas_turnos set ocupado_hasta = now()
  where tarea = $1 and ocupado_hasta = $2::timestamptz`;

export function crearTurnoPostgres(db: Consultor, tarea: "ingesta" | "resumen"): Turno {
  return {
    async tomar() {
      const [fila] = await db.consulta<{ ficha: string }>(SQL_TOMAR, [tarea]);
      return fila?.ficha ?? null;
    },
    async soltar(ficha) {
      await db.consulta(SQL_SOLTAR, [tarea, ficha]);
    },
  };
}
