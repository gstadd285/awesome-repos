// Importar `env` valida la configuración: si es insegura o está incompleta (por ejemplo
// `WAITLIST_MODE=memoria` en producción) esta ruta no carga y la sonda falla con 500.
import "@/lib/env";

/**
 * Sonda de arranque y de vida para Cloud Run. Responde 200 solo si el proceso
 * está arriba **y** la configuración es válida, así Cloud Run no envía tráfico
 * a una revisión mal configurada en vez de servir errores 500.
 *
 * No toca la base de datos ni servicios externos, para que una caída de Neon
 * o de Resend no haga reiniciar el servidor. No revela versión, configuración
 * ni estado interno.
 */
export const dynamic = "force-dynamic";

const CABECERAS = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };

export function GET() {
  return new Response(JSON.stringify({ estado: "ok" }), { headers: CABECERAS });
}

export function HEAD() {
  return new Response(null, { headers: CABECERAS });
}
