import type { Tablero } from "./cola-postgres";

/**
 * Avisos de operación del tablero de `/admin` (`docs/alertas-reales.md` §8.3 y `docs/rutina-diaria.md`): lo que la dueña
 * debe mirar hoy, en una lista corta. Función pura: recibe el tablero y la hora; sin red ni base.
 */

export const HORAS_SIN_INGESTA = 3;
export const HORAS_SIN_RESUMEN = 26;
const HORA_MS = 60 * 60_000;

export function avisosDeOperacion(t: Tablero, ahora: Date): string[] {
  const avisos: string[] = [];
  const c = t.ultimaCorrida;
  if (c) {
    if (ahora.getTime() - Date.parse(c.fin) > HORAS_SIN_INGESTA * HORA_MS) {
      avisos.push(`La ingesta no corre hace más de ${HORAS_SIN_INGESTA} horas: revisa el servicio de tareas y el trabajo de Cloud Scheduler.`);
    }
    if (c.resultado === "fallida") avisos.push("La última corrida de la ingesta falló: revisa los registros de otea-tareas.");
  }
  if (t.feedsConProblemas.length > 0) {
    avisos.push(`${t.feedsConProblemas.length} ${t.feedsConProblemas.length === 1 ? "feed en pausa o con fallos" : "feeds en pausa o con fallos"} (detalle en «Ingesta»).`);
  }
  if (t.feedsSinNovedades.length > 0) {
    avisos.push(`${t.feedsSinNovedades.length} ${t.feedsSinNovedades.length === 1 ? "feed sin ítems nuevos" : "feeds sin ítems nuevos"} en 14 días: comprueba que la dirección siga viva.`);
  }
  const g = t.gastoMes;
  if (g.topeMicros && g.micros >= g.topeMicros * 0.8) avisos.push("El gasto de los borradores pasó el 80 % del tope del mes.");
  const r = t.resumen;
  if (r.fallidosHoy > 0) avisos.push(`${r.fallidosHoy} ${r.fallidosHoy === 1 ? "resumen diario no salió" : "resúmenes diarios no salieron"} hoy: revisa Resend y los registros.`);
  if (r.ultimaCorrida) {
    if (r.ultimaCorrida.resultado === "fallida") avisos.push("La última corrida del resumen diario falló.");
    if (r.suscritas > 0 && ahora.getTime() - Date.parse(r.ultimaCorrida.inicio) > HORAS_SIN_RESUMEN * HORA_MS) {
      avisos.push("El resumen diario no corrió en el último día: revisa su trabajo de Cloud Scheduler.");
    }
  }
  return avisos;
}
