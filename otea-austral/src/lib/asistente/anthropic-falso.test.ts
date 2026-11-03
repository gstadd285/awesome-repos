import { afterEach, describe, expect, it } from "vitest";
import { CLAVE_FALSA, crearServidorAnthropicFalso, guionPorOmision, leerMensaje, trocear } from "../../../scripts/lib/anthropic-falso.mjs";
import { armarMensaje } from "./prompt";
import { entradaPorId } from "./conocimiento";

/**
 * El servidor falso es una herramienta de prueba, pero las pruebas e2e del asistente con IA se apoyan en lo que dice
 * (qué recibió, qué no). Estas pruebas vigilan que diga la verdad.
 */
const abiertos: { cerrar: () => Promise<unknown> }[] = [];
afterEach(async () => {
  while (abiertos.length > 0) await abiertos.pop()!.cerrar();
});

async function abrir(opciones: Parameters<typeof crearServidorAnthropicFalso>[0] = {}) {
  const servidor = await crearServidorAnthropicFalso(opciones);
  abiertos.push(servidor);
  return servidor;
}

const mensaje = (pregunta: string, respuestas: string[] = ["Una respuesta del contexto."]) =>
  armarMensaje({
    contexto: respuestas.map((respuesta, i) => ({ id: `e${i}`, pregunta: `Pregunta ${i}`, respuesta, etiquetas: [], fuentes: [] })),
    anteriores: [],
    pregunta,
  });

async function enviar(url: string, pregunta: string, clave = CLAVE_FALSA) {
  const respuesta = await fetch(`${url}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 50,
      stream: true,
      system: "sistema de prueba",
      messages: [{ role: "user", content: mensaje(pregunta) }],
    }),
  });
  return { respuesta, texto: await respuesta.text() };
}

describe("servidor falso de Anthropic · resumen de solicitudes", () => {
  it("por omisión no expone nada: la ruta no existe", async () => {
    const { url } = await abrir();
    expect((await fetch(`${url}/__solicitudes`)).status).toBe(404);
  });

  it("con exponerSolicitudes resume lo recibido, sin cabeceras ni la clave", async () => {
    const { url } = await abrir({ exponerSolicitudes: true });
    await enviar(url, "¿Cómo funciona esto?");
    const resumen = await (await fetch(`${url}/__solicitudes`)).json();

    expect(resumen).toHaveLength(1);
    expect(resumen[0]).toMatchObject({
      pregunta: "¿Cómo funciona esto?",
      contexto: ["Una respuesta del contexto."],
      abortada: false,
      modelo: "claude-haiku-5-5",
      maxTokens: 50,
      sistema: "sistema de prueba",
      claveCorrecta: true,
    });
    expect(resumen[0].parametros).toEqual(["max_tokens", "messages", "model", "stream", "system"]);
    expect(JSON.stringify(resumen)).not.toContain(CLAVE_FALSA);
  });

  it("una clave equivocada se rechaza y no figura entre las solicitudes", async () => {
    const servidor = await abrir({ exponerSolicitudes: true });
    const { respuesta } = await enviar(servidor.url, "Hola", "sk-ant-api03-otra-clave-cualquiera-0123456789"); // escaner:ignorar valor falso a propósito
    expect(respuesta.status).toBe(401);
    expect(servidor.rechazadasPorClave).toBe(1);
    expect(await (await fetch(`${servidor.url}/__solicitudes`)).json()).toEqual([]);
  });

  it("marca como abortada la solicitud que el cliente cerró antes de que terminara", async () => {
    const { url } = await abrir({
      exponerSolicitudes: true,
      responder: () => ({ fragmentos: trocear("Una respuesta lenta que nadie leerá entera.", 4), intervaloMs: 40 }),
    });
    const control = new AbortController();
    const respuesta = await fetch(`${url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": CLAVE_FALSA },
      body: JSON.stringify({ model: "m", max_tokens: 10, stream: true, messages: [{ role: "user", content: mensaje("lenta") }] }),
      signal: control.signal,
    });
    const lector = respuesta.body!.getReader();
    await lector.read();
    control.abort();
    await lector.read().catch(() => undefined);

    await expect
      .poll(async () => (await (await fetch(`${url}/__solicitudes`)).json())[0]?.abortada, { timeout: 3000 })
      .toBe(true);
  });
});

describe("servidor falso de Anthropic · guion por omisión", () => {
  it("lee la pregunta y el contexto del mensaje que arma el asistente", () => {
    const entrada = entradaPorId("confianza")!;
    const cuerpo = { messages: [{ role: "user", content: armarMensaje({ contexto: [entrada], anteriores: [], pregunta: "¿Y la confianza?" }) }] };
    expect(leerMensaje(cuerpo)).toEqual({ pregunta: "¿Y la confianza?", contexto: [entrada.respuesta] });
  });

  it.each([
    ["ZZERROR", { estado: 500 }],
    ["ZZLIMITE", { estado: 429 }],
    ["ZZRECHAZO", { stopReason: "refusal" }],
  ])("%s provoca el caso de error que dice su nombre", (marca, esperado) => {
    expect(guionPorOmision({ pregunta: `algo ${marca}`, contexto: ["x"] })).toMatchObject(esperado);
  });

  it("sin marcas repite las primeras frases del contexto con un prefijo reconocible", () => {
    const guion = guionPorOmision({ pregunta: "¿Cómo?", contexto: ["Uno. Dos. Tres. Cuatro."] });
    expect((guion.fragmentos ?? []).join("")).toBe("Respuesta de la IA de prueba: Uno. Dos. Tres.");
  });
});
