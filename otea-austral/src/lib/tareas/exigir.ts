import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env, tareasActivas, type Env } from "@/lib/env";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";

/**
 * Puerta de las tareas programadas (`POST /api/tareas/*`, `docs/alertas-reales.md` §2.1). Es la **segunda** barrera:
 * la primera es la plataforma, que en `otea-tareas` rechaza a quien no tenga `run.invoker` (Cloud Scheduler con OIDC).
 *
 * Deja pasar solo si: las tareas están activas y configuradas (`TAREAS_MODO=activo`), el método es `POST`, la
 * solicitud no trae cuerpo y el encabezado `X-Otea-Tarea` es el secreto (comparado en tiempo constante). Ante
 * cualquier falla la ruta responde 404, igual que una ruta que no existe: no revela que la tarea está ahí.
 */

export const CABECERA_TAREA = "x-otea-tarea";

type Configuracion = Pick<Env, "TAREAS_MODO" | "TAREAS_SECRETO" | "INGESTA_CONTACTO" | "DATABASE_URL">;

const resumen = (valor: string) => createHash("sha256").update(valor, "utf8").digest();

/** `true` si la solicitud puede ejecutar la tarea. */
export function exigirTarea(
  request: Request,
  configuracion: Configuracion = env,
  registrar: (evento: SecurityEvent) => void = logSecurityEvent,
  tarea: "ingesta" | "resumen" = "ingesta",
): boolean {
  // En el servicio público las tareas no existen: ni siquiera se anota el intento (sería ruido de escáneres).
  if (!tareasActivas(configuracion) || !configuracion.TAREAS_SECRETO) return false;

  const largo = request.headers.get("content-length");
  const conCuerpo = (largo !== null && largo.trim() !== "0") || request.headers.has("transfer-encoding");
  const enviado = request.headers.get(CABECERA_TAREA) ?? "";
  // Se comparan resúmenes de igual largo: ni el contenido ni el largo del secreto se filtran por el tiempo.
  const secretoValido = timingSafeEqual(resumen(enviado), resumen(configuracion.TAREAS_SECRETO));

  if (request.method !== "POST" || conCuerpo || !secretoValido) {
    // Aquí ya pasó la barrera de la plataforma (IAM): un rechazo es raro y merece quedar anotado (sin detalles).
    registrar({ tipo: "tarea", tarea, resultado: "rechazada" });
    return false;
  }
  return true;
}
