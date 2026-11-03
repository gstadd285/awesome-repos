import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { traducirError } from "@/lib/asistente/proveedor-anthropic";
import type { UsoDetallado } from "@/lib/ia/gasto";
import { BorradorModeloSchema } from "./esquema";

/**
 * **El único archivo que llama al modelo para los borradores** (`docs/alertas-reales.md` §4.2), con las mismas reglas que
 * `asistente/proveedor-anthropic.ts`:
 *
 * - Clave, URL y credenciales explícitas (`authToken: null`, `webhookKey: null`, `baseURL`): el SDK no lee nada del
 *   entorno que `env.ts` no haya validado. La clave es la del espacio de trabajo de borradores, con su propio límite.
 * - Un solo reintento del SDK y 60 s de tope: cada reintento es otra llamada que se paga.
 * - Sin registros del SDK (`logLevel: "off"`): ni el texto de las fuentes ni el borrador quedan en los registros.
 * - **Sin herramientas** (`tools`, `tool_choice`, `mcp_servers`), sin `thinking` (Haiku 5.5 piensa de forma adaptativa),
 *   sin parámetros de muestreo ni relleno del asistente (400 en los modelos actuales). `effort: "low"` y salida
 *   estructurada con el esquema del borrador.
 *
 * Se usa `messages.create` con `zodOutputFormat` y no `messages.parse`: `parse` lanza antes de que se puedan leer
 * `stop_reason` y `usage` cuando el JSON no valida, y sin `usage` no se puede ajustar el gasto. La revisión
 * (`revision.ts`) valida el texto con el esquema local.
 */

export const URL_API_ANTHROPIC = "https://api.anthropic.com";
export const TIEMPO_MAXIMO_MS = 60_000;
export const MAX_TOKENS_BORRADOR = 3_000;

export type OpcionesProveedorBorrador = {
  apiKey: string;
  modelo: string;
  /** Solo pruebas: un servidor falso. Nunca se toma del entorno sin pasar por `env.ts`. */
  baseURL?: string;
  timeoutMs?: number;
};

export type SolicitudBorrador = { sistema: string; mensaje: string; maxTokens: number; senal?: AbortSignal };

export type RespuestaBorrador = {
  /** `completo` (end_turn), `limite` (max_tokens), `rechazo` (refusal) u `otro`. */
  motivo: "completo" | "limite" | "rechazo" | "otro";
  /** Categoría del rechazo (`stop_details.category`), si la hay: solo un código. */
  categoria: string | null;
  /** El texto de la respuesta (el JSON del borrador), sin revisar. */
  texto: string;
  uso: UsoDetallado;
};

export type ProveedorBorrador = {
  readonly nombre: string;
  /** Lanza `ErrorProveedor` (de `asistente/proveedor.ts`) si el servicio falla. */
  redactar(solicitud: SolicitudBorrador): Promise<RespuestaBorrador>;
};

function motivoDe(stop: string | null): RespuestaBorrador["motivo"] {
  if (stop === "end_turn") return "completo";
  if (stop === "max_tokens") return "limite";
  if (stop === "refusal") return "rechazo";
  return "otro";
}

/** Código corto de la categoría de un rechazo, o `null`. */
const codigo = (v: unknown): string | null => (typeof v === "string" && /^[a-z_]{1,40}$/.test(v) ? v : null);

/** El único cliente del SDK de los borradores: todo explícito, nada del entorno. */
function crearCliente({ apiKey, baseURL = URL_API_ANTHROPIC, timeoutMs = TIEMPO_MAXIMO_MS }: OpcionesProveedorBorrador): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL,
    maxRetries: 1,
    timeout: timeoutMs,
    logLevel: "off",
  });
}

export function crearProveedorBorrador(opciones: OpcionesProveedorBorrador): ProveedorBorrador {
  const cliente = crearCliente(opciones);
  const { modelo } = opciones;
  const formato = zodOutputFormat(BorradorModeloSchema);

  return {
    nombre: "anthropic",
    async redactar({ sistema, mensaje, maxTokens, senal }) {
      try {
        const r = await cliente.messages.create(
          {
            model: modelo,
            max_tokens: maxTokens,
            system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: mensaje }],
            output_config: { effort: "low", format: formato },
          },
          { signal: senal },
        );
        const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const u = r.usage;
        return {
          motivo: motivoDe(r.stop_reason),
          categoria: r.stop_reason === "refusal" ? codigo(r.stop_details?.category) : null,
          texto,
          uso: {
            entrada: u.input_tokens,
            cacheEscrita: u.cache_creation_input_tokens ?? 0,
            cacheLeida: u.cache_read_input_tokens ?? 0,
            salida: u.output_tokens,
          },
        };
      } catch (error) {
        throw traducirError(error);
      }
    },
  };
}

/**
 * Tokens de entrada que cuenta la API para una solicitud (`messages.countTokens`, gratis). Solo lo usa la prueba con la
 * API real (`real.test.ts`) para comprobar que el estimador de `gasto.ts` queda por encima.
 */
export async function contarTokens(
  opciones: OpcionesProveedorBorrador,
  { sistema, mensaje }: Pick<SolicitudBorrador, "sistema" | "mensaje">,
): Promise<number> {
  try {
    const r = await crearCliente(opciones).messages.countTokens({
      model: opciones.modelo,
      system: [{ type: "text", text: sistema }],
      messages: [{ role: "user", content: mensaje }],
      output_config: { format: zodOutputFormat(BorradorModeloSchema) },
    });
    return r.input_tokens;
  } catch (error) {
    throw traducirError(error);
  }
}
