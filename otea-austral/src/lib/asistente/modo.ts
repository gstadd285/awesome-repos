import "server-only";
import { env } from "@/lib/env";
import type { ModoRespuesta } from "./limites";

/**
 * Cómo responde el asistente de este despliegue: `ia` solo si la IA está activada y trae su clave y su modelo; en
 * cualquier otro caso, `base` (preguntas frecuentes, sin IA y sin costo). Va aparte de `instancia.ts` para que la
 * portada pueda saberlo sin cargar el SDK ni la base de datos.
 */
export function modoAsistente(): ModoRespuesta {
  return env.ASISTENTE_MODO === "ia" && env.ANTHROPIC_API_KEY && env.ASISTENTE_MODELO ? "ia" : "base";
}
