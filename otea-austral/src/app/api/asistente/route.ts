import { manejadorAsistente } from "@/lib/asistente/instancia";

/**
 * Asistente de preguntas del sitio. Recibe `{ pregunta, anteriores? }` y responde con eventos NDJSON
 * (`src/lib/asistente/limites.ts`). Sin `ASISTENTE_MODO=ia` responde solo con las preguntas frecuentes del sitio,
 * sin llamar a ningún servicio externo. Los controles de entrada están en `src/lib/asistente/manejador.ts`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return manejadorAsistente()(request);
}
