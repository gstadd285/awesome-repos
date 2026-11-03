import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ErrorProveedor, type EventoModelo, type MotivoFin, type Proveedor } from "./proveedor";

/**
 * Proveedor de IA con el SDK oficial de Anthropic (Claude). Solo se crea si la persona responsable activa el
 * modo `ia` con su propia clave y modelo (ver `docs/asistente-ia.md`): por omisión el asistente no llama a nadie.
 *
 * Lo que importa de la configuración del cliente:
 * - Clave, URL y credenciales van explícitas. El SDK lee del entorno (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
 *   `ANTHROPIC_CUSTOM_HEADERS`…) lo que no recibe; aquí no se le deja leer nada que `env.ts` no haya validado.
 * - Un solo reintento y 20 s de tope: cada reintento es otra llamada que se paga.
 * - Sin registros del SDK: no deben quedar pregunta ni respuesta en los registros del servidor.
 * - Sin `thinking` ni parámetros de muestreo: los modelos admitidos piensan de forma adaptativa y rechazan (400)
 *   los demás ajustes. `effort: "low"` basta para responder desde un texto y es lo más barato.
 */

export const URL_API_ANTHROPIC = "https://api.anthropic.com";
export const TIEMPO_MAXIMO_MS = 20_000;

export type OpcionesAnthropic = {
  apiKey: string;
  /** Modelo elegido por la persona responsable (lista cerrada en `env.ts`). */
  modelo: string;
  /** Solo pruebas: un servidor falso. Nunca se toma del entorno sin pasar por `env.ts`. */
  baseURL?: string;
  timeoutMs?: number;
};

function motivoDe(stop: string | null): MotivoFin {
  if (stop === "end_turn") return "completo";
  if (stop === "max_tokens") return "limite";
  if (stop === "refusal") return "rechazo";
  return "otro";
}

/** Traduce los errores del SDK a un código técnico corto; el mensaje original puede traer detalles que no se registran. */
export function traducirError(error: unknown): ErrorProveedor {
  if (error instanceof ErrorProveedor) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ErrorProveedor("abortado");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ErrorProveedor("tiempo");
  if (error instanceof Anthropic.APIConnectionError) return new ErrorProveedor("conexion");
  if (error instanceof Anthropic.APIError) {
    const estado = error.status;
    if (estado === 429) return new ErrorProveedor("limite_tasa", estado);
    if (estado === 401 || estado === 403) return new ErrorProveedor("autenticacion", estado);
    if (estado !== undefined && estado >= 500) return new ErrorProveedor("servidor", estado);
    if (estado !== undefined) return new ErrorProveedor("solicitud", estado);
    return new ErrorProveedor("flujo");
  }
  return new ErrorProveedor("desconocido");
}

export function crearProveedorAnthropic({
  apiKey,
  modelo,
  baseURL = URL_API_ANTHROPIC,
  timeoutMs = TIEMPO_MAXIMO_MS,
}: OpcionesAnthropic): Proveedor {
  const cliente = new Anthropic({
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL,
    maxRetries: 1,
    timeout: timeoutMs,
    logLevel: "off",
  });

  return {
    nombre: "anthropic",
    async *generar({ sistema, mensaje, maxTokens, senal }): AsyncGenerator<EventoModelo> {
      const flujo = cliente.messages.stream(
        {
          model: modelo,
          max_tokens: maxTokens,
          system: sistema,
          messages: [{ role: "user", content: mensaje }],
          output_config: { effort: "low" },
        },
        { signal: senal },
      );
      try {
        for await (const evento of flujo) {
          if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
            yield { tipo: "texto", texto: evento.delta.text };
          }
        }
        const final = await flujo.finalMessage();
        const u = final.usage;
        yield {
          tipo: "fin",
          motivo: motivoDe(final.stop_reason),
          uso: {
            entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
            salida: u.output_tokens,
          },
        };
      } catch (error) {
        throw traducirError(error);
      } finally {
        if (!flujo.ended) flujo.abort();
      }
    },
  };
}
