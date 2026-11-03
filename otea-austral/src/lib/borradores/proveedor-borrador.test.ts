import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Módulo JS compartido con el e2e.
import { CLAVE_FALSA, crearServidorAnthropicFalso } from "../../../scripts/lib/anthropic-falso.mjs";
import { ErrorProveedor } from "@/lib/asistente/proveedor";
import { crearProveedorBorrador, MAX_TOKENS_BORRADOR } from "./proveedor-borrador";

type Falso = Awaited<ReturnType<typeof crearServidorAnthropicFalso>>;
type Guion = Record<string, unknown> | undefined;

let falso: Falso;
let guion: Guion | ((n: number) => Guion);

beforeAll(async () => {
  falso = await crearServidorAnthropicFalso({
    responder: (_s: unknown, n: number) => (typeof guion === "function" ? guion(n) : guion),
  });
});
afterAll(async () => {
  await falso.cerrar();
});

const proveedor = (extra: { timeoutMs?: number; apiKey?: string } = {}) =>
  crearProveedorBorrador({ apiKey: CLAVE_FALSA, modelo: "claude-haiku-5-5", baseURL: falso.url, ...extra });

// DATOS DE PRUEBA: un mensaje con la forma de `prompt.ts`, títulos sintéticos.
const MENSAJE =
  "<evento>\nTema: Divisas\n</evento>\n\n<fuentes>\n[1] Banco de prueba (ejemplo) · fuente primaria · 2026-10-25 · Decisión de prueba (ejemplo)\n</fuentes>";
const solicitud = (senal?: AbortSignal) => ({ sistema: "Instrucciones de prueba.", mensaje: MENSAJE, maxTokens: MAX_TOKENS_BORRADOR, senal });

async function fallo(promesa: Promise<unknown>): Promise<ErrorProveedor> {
  try {
    await promesa;
  } catch (e) {
    return e as ErrorProveedor;
  }
  throw new Error("Debía fallar");
}

describe("proveedor de borradores (SDK oficial contra el servidor falso)", () => {
  it("envía la solicitud prevista: sin flujo, sin herramientas ni pensamiento, salida estructurada, esfuerzo bajo, sistema en caché", async () => {
    guion = undefined; // el borrador por omisión del servidor falso
    const antes = falso.solicitudes.length;
    const r = await proveedor().redactar(solicitud());
    const { cuerpo, cabeceras } = falso.solicitudes[antes];
    expect(Object.keys(cuerpo).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.max_tokens).toBe(3000);
    expect(cuerpo.stream).toBeUndefined();
    expect(cuerpo.system).toEqual([{ type: "text", text: "Instrucciones de prueba.", cache_control: { type: "ephemeral" } }]);
    expect(cuerpo.messages).toEqual([{ role: "user", content: MENSAJE }]);
    expect(cuerpo.output_config.effort).toBe("low");
    expect(cuerpo.output_config.format.type).toBe("json_schema");
    expect(cuerpo.output_config.format.schema.additionalProperties).toBe(false);
    expect(Object.keys(cuerpo.output_config.format.schema.properties).sort()).toEqual(["dudas", "evento", "filas", "impacto_sugerido", "resumen"]);
    expect(cabeceras["x-api-key"]).toBe(CLAVE_FALSA);
    expect(cabeceras.authorization).toBeUndefined();
    // La respuesta: el texto sin revisar, el motivo y el uso con la caché aparte.
    expect(r.motivo).toBe("completo");
    expect(JSON.parse(r.texto).evento).toBe("Borrador de prueba del servidor falso (una fuente)");
    expect(r.uso).toEqual({ entrada: 2400, cacheEscrita: 0, cacheLeida: 0, salida: 420 });
  });

  it("informa la caché leída y escrita", async () => {
    guion = { texto: "{}", uso: { input_tokens: 100, output_tokens: 10 }, cache: { cache_creation_input_tokens: 1500, cache_read_input_tokens: 0 } };
    expect((await proveedor().redactar(solicitud())).uso).toEqual({ entrada: 100, cacheEscrita: 1500, cacheLeida: 0, salida: 10 });
    guion = { texto: "{}", uso: { input_tokens: 100, output_tokens: 10 }, cache: { cache_creation_input_tokens: 0, cache_read_input_tokens: 1500 } };
    expect((await proveedor().redactar(solicitud())).uso.cacheLeida).toBe(1500);
  });

  it("distingue refusal (con su categoría) y max_tokens", async () => {
    guion = { texto: "", stopReason: "refusal", categoria: "general_harms" };
    expect(await proveedor().redactar(solicitud())).toMatchObject({ motivo: "rechazo", categoria: "general_harms", texto: "" });
    guion = { texto: '{"evento":"Cor', stopReason: "max_tokens" };
    expect(await proveedor().redactar(solicitud())).toMatchObject({ motivo: "limite", categoria: null });
  });

  it("devuelve un JSON roto tal cual: lo rechaza la revisión, no el proveedor (así se puede ajustar el gasto)", async () => {
    guion = { texto: "{ esto no es JSON", uso: { input_tokens: 50, output_tokens: 5 } };
    const r = await proveedor().redactar(solicitud());
    expect(r.texto).toBe("{ esto no es JSON");
    expect(r.uso.salida).toBe(5);
  });

  it("traduce los errores a códigos cortos, sin el mensaje del servicio; reintenta una sola vez", async () => {
    guion = { estado: 429, tipoError: "rate_limit_error" };
    const antes = falso.solicitudes.length;
    expect((await fallo(proveedor().redactar(solicitud()))).codigo).toBe("limite_tasa");
    expect(falso.solicitudes.length - antes).toBe(2); // maxRetries: 1
    guion = { estado: 500, tipoError: "api_error" };
    expect((await fallo(proveedor().redactar(solicitud()))).codigo).toBe("servidor");
    guion = undefined;
    const e = await fallo(proveedor({ apiKey: "sk-ant-api03-otra-clave-de-prueba-000000" }).redactar(solicitud())); // escaner:ignorar valor falso
    expect(e).toBeInstanceOf(ErrorProveedor);
    expect(e.codigo).toBe("autenticacion");
    expect(e.message).not.toMatch(/x-api-key|sk-ant/);
  });

  it("corta por tiempo y con la señal de la corrida", async () => {
    guion = { colgar: true };
    expect((await fallo(proveedor({ timeoutMs: 200 }).redactar(solicitud()))).codigo).toBe("tiempo");
    const control = new AbortController();
    setTimeout(() => control.abort(), 100);
    expect((await fallo(proveedor().redactar(solicitud(control.signal)))).codigo).toBe("abortado");
  });
});
