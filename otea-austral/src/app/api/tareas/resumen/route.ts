import { notFound } from "next/navigation";
import { env, resumenActivo } from "@/lib/env";
import { ejecutarResumen } from "@/lib/resumen/instancia";
import { logSecurityEvent } from "@/lib/security/log";
import { exigirTarea } from "@/lib/tareas/exigir";

/**
 * Resumen diario por correo (`docs/alertas-reales.md` §7). Existe solo en el servicio privado `otea-tareas` con
 * `RESUMEN_MODO=activo` (apagado por omisión), que Cloud Scheduler llama una vez al día con OIDC y el encabezado
 * `X-Otea-Tarea`. En cualquier otro caso —el sitio público, el resumen apagado, otro método, un cuerpo, sin secreto—
 * responde 404, igual que una ruta inexistente. No lee el cuerpo ni cookies, y responde solo conteos.
 *
 * Todos los métodos pasan por la misma puerta: si no, Next.js respondería 405 u `OPTIONS` con `Allow` y delataría la ruta.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function manejar(request: Request): Promise<Response> {
  if (!exigirTarea(request, env, logSecurityEvent, "resumen") || !resumenActivo()) notFound();
  const r = await ejecutarResumen();
  return Response.json(
    {
      resultado: r.resultado,
      cuentas: r.cuentas,
      enviados: r.enviados,
      sin_novedades: r.sinNovedades,
      fallos: r.fallos,
      cupo_agotado: r.cupoAgotado,
    },
    { status: r.resultado === "fallida" ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = manejar;
export const HEAD = manejar;
export const POST = manejar;
export const PUT = manejar;
export const PATCH = manejar;
export const DELETE = manejar;
export const OPTIONS = manejar;
