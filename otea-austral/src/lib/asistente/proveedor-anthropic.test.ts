import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Módulo JS compartido con el e2e.
import { CLAVE_FALSA, crearServidorAnthropicFalso, trocear } from "../../../scripts/lib/anthropic-falso.mjs";
import { ErrorProveedor, type EventoModelo } from "./proveedor";
import { crearProveedorAnthropic, traducirError } from "./proveedor-anthropic";

type Falso = Awaited<ReturnType<typeof crearServidorAnthropicFalso>>;
type Guion = Record<string, unknown>;

let falso: Falso;
let guion: Guion | ((n: number) => Guion) = {};

beforeAll(async () => {
  falso = await crearServidorAnthropicFalso({
    responder: (_solicitud: unknown, n: number) => (typeof guion === "function" ? guion(n) : guion),
  });
});
afterAll(async () => {
  await falso.cerrar();
});

function proveedor(extra: { timeoutMs?: number; apiKey?: string } = {}) {
  return crearProveedorAnthropic({ apiKey: CLAVE_FALSA, modelo: "claude-haiku-5-5", baseURL: falso.url, ...extra });
}

const solicitud = (senal = new AbortController().signal) => ({
  sistema: "Eres un asistente.",
  mensaje: "<pregunta>\n¿Hola?\n</pregunta>",
  maxTokens: 500,
  senal,
});

async function recoger(p = proveedor(), s = solicitud()): Promise<EventoModelo[]> {
  const eventos: EventoModelo[] = [];
  for await (const e of p.generar(s)) eventos.push(e);
  return eventos;
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorProveedor> {
  try {
    await promesa;
  } catch (e) {
    return e as ErrorProveedor;
  }
  throw new Error("Debía fallar");
}

describe("proveedor de Anthropic (SDK oficial contra un servidor falso)", () => {
  it("entrega el texto en fragmentos y al final el motivo y el uso", async () => {
    guion = { fragmentos: ["Hola, ", "esto es ", "una prueba."], uso: { input_tokens: 321, output_tokens: 17 } };
    const eventos = await recoger();
    expect(eventos.filter((e) => e.tipo === "texto").map((e) => (e as { texto: string }).texto)).toEqual([
      "Hola, ",
      "esto es ",
      "una prueba.",
    ]);
    expect(eventos.at(-1)).toEqual({ tipo: "fin", motivo: "completo", uso: { entrada: 321, salida: 17 } });
  });

  it("ignora el pensamiento del modelo: solo entrega texto", async () => {
    guion = { pensamiento: true, fragmentos: ["Respuesta."] };
    const eventos = await recoger();
    expect(eventos.map((e) => e.tipo)).toEqual(["texto", "fin"]);
    expect(JSON.stringify(eventos)).not.toContain("Pienso");
  });

  it("distingue por qué terminó: límite de tokens y rechazo", async () => {
    guion = { fragmentos: ["Corta"], stopReason: "max_tokens" };
    expect((await recoger()).at(-1)).toMatchObject({ tipo: "fin", motivo: "limite" });
    guion = { fragmentos: [], stopReason: "refusal" };
    expect(await recoger()).toEqual([{ tipo: "fin", motivo: "rechazo", uso: { entrada: 25, salida: 1 } }]);
  });

  it("envía la solicitud que esperan los modelos admitidos, sin parámetros que rechazan", async () => {
    guion = { fragmentos: ["Ok."] };
    const antes = falso.solicitudes.length;
    await recoger(proveedor());
    const { cuerpo, cabeceras } = falso.solicitudes[antes];
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.max_tokens).toBe(500);
    expect(cuerpo.stream).toBe(true);
    expect(cuerpo.system).toBe("Eres un asistente.");
    expect(cuerpo.messages).toEqual([{ role: "user", content: "<pregunta>\n¿Hola?\n</pregunta>" }]);
    expect(cuerpo.output_config).toEqual({ effort: "low" });
    for (const prohibido of ["thinking", "temperature", "top_p", "top_k", "tools", "tool_choice", "budget_tokens"]) {
      expect(cuerpo, prohibido).not.toHaveProperty(prohibido);
    }
    expect(cabeceras["x-api-key"]).toBe(CLAVE_FALSA);
    expect(cabeceras["authorization"]).toBeUndefined();
  });

  it("no usa credenciales ni destinos del entorno", async () => {
    const previo = { ...process.env };
    process.env.ANTHROPIC_AUTH_TOKEN = "token-del-entorno";
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-del-entorno";
    try {
      guion = { fragmentos: ["Ok."] };
      const antes = falso.solicitudes.length;
      await recoger(proveedor());
      expect(falso.solicitudes.length).toBe(antes + 1);
      expect(falso.solicitudes[antes].cabeceras["x-api-key"]).toBe(CLAVE_FALSA);
      expect(falso.solicitudes[antes].cabeceras["authorization"]).toBeUndefined();
    } finally {
      for (const k of ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY"]) {
        if (previo[k] === undefined) delete process.env[k];
        else process.env[k] = previo[k];
      }
    }
  });

  it.each([
    [429, "rate_limit_error", "limite_tasa"],
    [401, "authentication_error", "autenticacion"],
    [403, "permission_error", "autenticacion"],
    [400, "invalid_request_error", "solicitud"],
    [404, "not_found_error", "solicitud"],
    [500, "api_error", "servidor"],
    [529, "overloaded_error", "servidor"],
  ])("HTTP %i → código «%s» → %s", async (estado, tipoError, codigo) => {
    guion = { estado, tipoError };
    const error = await fallo(recoger());
    expect(error).toBeInstanceOf(ErrorProveedor);
    expect(error.codigo).toBe(codigo);
    expect(error.estado).toBe(estado);
  });

  it("reintenta una sola vez ante un error pasajero (cada reintento se paga)", async () => {
    guion = { estado: 500, tipoError: "api_error" };
    const antes = falso.solicitudes.length;
    await fallo(recoger());
    expect(falso.solicitudes.length - antes).toBe(2);
  });

  it("si el segundo intento sale bien, entrega la respuesta", async () => {
    const base = falso.solicitudes.length;
    guion = (n) => (n === base ? { estado: 529, tipoError: "overloaded_error" } : { fragmentos: ["Ya sí."] });
    const eventos = await recoger();
    expect(eventos.some((e) => e.tipo === "texto")).toBe(true);
  });

  it("no reintenta un error que no va a cambiar (clave inválida)", async () => {
    const antes = falso.rechazadasPorClave;
    const otraClave = "sk-ant-api03-otra-clave-0123456789abcdef"; // escaner:ignorar valor falso a propósito
    const error = await fallo(recoger(proveedor({ apiKey: otraClave })));
    expect(error.codigo).toBe("autenticacion");
    expect(falso.rechazadasPorClave - antes).toBe(1);
  });

  it("la clave nunca aparece en el error", async () => {
    guion = { estado: 500 };
    const error = await fallo(recoger());
    expect(JSON.stringify({ m: error.message, s: error.stack, c: error.codigo })).not.toContain("CANARIO");
    expect(error.message).not.toContain("sk-ant");
  });

  it("una conexión cortada a mitad de la respuesta es un fallo de conexión o de flujo, no un texto a medias", async () => {
    guion = { fragmentos: ["Empieza y se corta"], cortar: true };
    const eventos: EventoModelo[] = [];
    let error: ErrorProveedor | undefined;
    try {
      for await (const e of proveedor().generar(solicitud())) eventos.push(e);
    } catch (e) {
      error = e as ErrorProveedor;
    }
    expect(error).toBeInstanceOf(ErrorProveedor);
    expect(eventos.some((e) => e.tipo === "fin")).toBe(false);
  });

  it("se rinde al pasar el tiempo máximo", async () => {
    guion = { colgar: true };
    const t0 = Date.now();
    const error = await fallo(recoger(proveedor({ timeoutMs: 300 })));
    expect(error.codigo).toBe("tiempo");
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 10_000);

  it("cancelar la señal corta la generación y cierra la conexión", async () => {
    guion = { fragmentos: trocear("palabra ".repeat(200), 8), intervaloMs: 10 };
    const control = new AbortController();
    const antes = falso.solicitudes.length;
    const eventos: EventoModelo[] = [];
    let error: ErrorProveedor | undefined;
    try {
      for await (const e of proveedor().generar(solicitud(control.signal))) {
        eventos.push(e);
        if (eventos.length === 3) control.abort();
      }
    } catch (e) {
      error = e as ErrorProveedor;
    }
    expect(error?.codigo).toBe("abortado");
    expect(eventos.length).toBeLessThan(20);
    await new Promise((r) => setTimeout(r, 100));
    expect(falso.solicitudes[antes].abortada).toBe(true);
  });

  it("si quien consume deja de leer, la conexión se cierra", async () => {
    guion = { fragmentos: trocear("palabra ".repeat(200), 8), intervaloMs: 10 };
    const antes = falso.solicitudes.length;
    for await (const e of proveedor().generar(solicitud())) {
      if (e.tipo === "texto") break;
    }
    await new Promise((r) => setTimeout(r, 150));
    expect(falso.solicitudes[antes].abortada).toBe(true);
  });
});

describe("traducirError", () => {
  it("deja pasar los errores propios y convierte lo desconocido", () => {
    const propio = new ErrorProveedor("servidor", 500);
    expect(traducirError(propio)).toBe(propio);
    expect(traducirError(new Error("quién sabe")).codigo).toBe("desconocido");
    expect(traducirError("texto").codigo).toBe("desconocido");
  });
});
