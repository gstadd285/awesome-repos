import { notFound } from "next/navigation";
import { ejecutarIngesta } from "@/lib/ingesta/instancia";
import { exigirTarea } from "@/lib/tareas/exigir";

/**
 * Ingesta de metadatos (`docs/alertas-reales.md` §2). Existe solo en el servicio privado `otea-tareas`
 * (`TAREAS_MODO=activo`), que Cloud Scheduler llama cada hora con OIDC y el encabezado `X-Otea-Tarea`. En cualquier
 * otro caso —el sitio público, otro método, un cuerpo, sin secreto— responde 404, igual que una ruta inexistente.
 * No lee el cuerpo ni cookies, y responde solo conteos (también los de la agrupación en eventos candidatos).
 *
 * Todos los métodos pasan por la misma puerta: si no, Next.js respondería 405 u `OPTIONS` con `Allow` y delataría la ruta.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function manejar(request: Request): Promise<Response> {
  if (!exigirTarea(request)) notFound();
  const r = await ejecutarIngesta();
  return Response.json(
    {
      resultado: r.resultado,
      feeds: r.feeds,
      nuevos: r.nuevos,
      fallos: r.fallos,
      pausados: r.pausados,
      sin_feeds: r.sinFeeds,
      agrupados: r.agrupacion?.asignados ?? 0,
      eventos_nuevos: r.agrupacion?.eventosNuevos ?? 0,
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
