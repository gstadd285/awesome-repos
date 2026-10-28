// Servidor que imita la API de mensajes de Anthropic (solo lo que usan el asistente y los borradores: POST /v1/messages,
// con `stream: true` para el asistente y sin flujo, con salida estructurada, para los borradores). Con él se prueba el
// proveedor real —el SDK oficial— y los recorridos completos sin llamar a nadie ni gastar nada. Lo usan las pruebas
// unitarias y `scripts/anthropic-falso.mjs` (e2e).
//
// El formato de los eventos es el de la documentación de streaming de la API de mensajes: message_start,
// content_block_start / delta / stop, message_delta (con `stop_reason` y el uso) y message_stop. Sin flujo, un
// objeto `message` con `content`, `stop_reason`, `stop_details` y `usage`.
import http from "node:http";

/** Clave que acepta el servidor falso (la de las pruebas; nunca una real). */
export const CLAVE_FALSA = "sk-ant-api03-CANARIO-clave-de-prueba-0123456789"; // escaner:ignorar valor falso a propósito
/** La de los borradores: el esquema de entorno exige que sea distinta de la del asistente. */
export const CLAVE_FALSA_BORRADORES = "sk-ant-api03-CANARIO-clave-borradores-prueba-0123456789"; // escaner:ignorar valor falso a propósito
const CLAVES = new Set([CLAVE_FALSA, CLAVE_FALSA_BORRADORES]);

/** Una línea de eventos SSE. */
export function eventoSse(nombre, datos) {
  return `event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`;
}

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * @typedef {object} Guion
 * @property {number} [estado] Código HTTP (por omisión 200). Distinto de 200: responde un error de la API.
 * @property {string} [tipoError] `type` del error de la API (p. ej. `rate_limit_error`).
 * @property {string[]} [fragmentos] Trozos de texto de la respuesta.
 * @property {string} [stopReason] `end_turn` (por omisión), `max_tokens`, `refusal`…
 * @property {{ input_tokens?: number, output_tokens?: number }} [uso]
 * @property {boolean} [pensamiento] Antes del texto, un bloque de pensamiento (que el asistente ignora).
 * @property {number} [intervaloMs] Pausa entre fragmentos.
 * @property {boolean} [cortar] Después de los fragmentos, cierra la conexión sin terminar el mensaje.
 * @property {boolean} [colgar] No responde nunca.
 * @property {number} [retardoMs] Espera antes de empezar a responder.
 * @property {string} [texto] Sin flujo: el texto de la respuesta (el JSON del borrador).
 * @property {string | null} [categoria] Sin flujo y con `refusal`: la categoría de `stop_details`.
 * @property {{ cache_creation_input_tokens?: number, cache_read_input_tokens?: number }} [cache] Sin flujo: uso de la caché.
 */

/**
 * @typedef {object} SolicitudRegistrada
 * @property {Record<string, string | string[] | undefined>} cabeceras
 * @property {any} cuerpo
 * @property {string} pregunta Lo que hay dentro de `<pregunta>` en el mensaje de la persona.
 * @property {string[]} contexto Las respuestas de `<contexto>`, en orden.
 * @property {boolean} abortada El cliente cerró la conexión antes de que terminara.
 */

/** Extrae `<pregunta>` y las respuestas de `<contexto>` del mensaje que arma el asistente. */
export function leerMensaje(cuerpo) {
  const contenido = cuerpo?.messages?.[0]?.content;
  const texto = typeof contenido === "string" ? contenido : (contenido ?? []).map((b) => b.text ?? "").join("");
  const pregunta = /<pregunta>\n([\s\S]*?)\n<\/pregunta>/.exec(texto)?.[1] ?? "";
  const bloque = /<contexto>\n([\s\S]*?)\n<\/contexto>/.exec(texto)?.[1] ?? "";
  const contexto = bloque
    .split(/\n\n(?=\[\d+\] Pregunta: )/)
    .map((parte) => /\nRespuesta: ([\s\S]*)$/.exec(parte)?.[1])
    .filter((respuesta) => respuesta !== undefined);
  return { pregunta, contexto };
}

/**
 * Lee el mensaje de un borrador (`src/lib/borradores/prompt.ts`): los títulos de `<fuentes>` y los documentos, con su límite.
 * @returns {{ titulos: string[], documentos: string[], limites: string[], esBorrador: boolean }}
 */
export function leerMensajeBorrador(cuerpo) {
  const contenido = cuerpo?.messages?.[0]?.content;
  const texto = typeof contenido === "string" ? contenido : (contenido ?? []).map((b) => b.text ?? "").join("");
  const bloque = /<fuentes>\n([\s\S]*?)\n<\/fuentes>/.exec(texto)?.[1] ?? "";
  const titulos = bloque
    .split("\n")
    .map((l) => /^\[\d+\] .*? · .*? · \d{4}-\d{2}-\d{2} · (.*)$/.exec(l)?.[1])
    .filter((t) => t !== undefined);
  const documentos = [];
  const limites = [];
  for (const m of texto.matchAll(/<documento n="\d+" limite="([0-9a-f]{16})">\n([\s\S]*?)\n<\/documento \1>/g)) {
    limites.push(m[1]);
    documentos.push(m[2]);
  }
  return { titulos, documentos, limites, esBorrador: cuerpo?.output_config?.format?.type === "json_schema" };
}

/**
 * Borrador por omisión (sin flujo, salida estructurada): uno válido a partir del primer título, que es lo que haría un
 * buen modelo; unas marcas de una palabra en los títulos provocan cada caso (ZZRECHAZO, ZZROTO, ZZRECOMIENDA, ZZCOPIA,
 * ZZLARGO, ZZERROR, ZZCIFRA). Todo es de prueba.
 * @returns {Guion}
 */
export function guionBorradorPorOmision(cuerpo) {
  const { titulos, documentos } = leerMensajeBorrador(cuerpo);
  const marcas = titulos.join(" ");
  if (marcas.includes("ZZERROR")) return { estado: 500, tipoError: "api_error" };
  if (marcas.includes("ZZRECHAZO")) return { texto: "", stopReason: "refusal", categoria: "general_harms" };
  if (marcas.includes("ZZLARGO")) return { texto: '{"evento":"Corta', stopReason: "max_tokens" };
  if (marcas.includes("ZZROTO")) return { texto: "{ esto no es JSON" };
  // Sin repetir el título: un buen modelo escribe con sus palabras (y la anticopia lo exige).
  const borrador = {
    evento: `Borrador de prueba del servidor falso (${titulos.length === 1 ? "una fuente" : "varias fuentes"})`,
    resumen: marcas.includes("ZZRECOMIENDA")
      ? "Recomendamos comprar acciones de prueba antes de la decisión."
      : marcas.includes("ZZCIFRA")
        ? "La tasa de prueba llegaría a 87,5 % según el texto ficticio."
        : marcas.includes("ZZCOPIA") && documentos[0]
          ? documentos[0].slice(0, 590)
          : "Resumen de prueba redactado por el servidor falso con palabras propias, sin datos reales.",
    filas: [{ sector: "Sector de prueba", direccion: "condicionado", condicion: "Si la decisión de prueba se confirma, el efecto podría notarse." }],
    impacto_sugerido: "medio",
    dudas: ["Comprobar en el documento oficial la fecha de la decisión de prueba."],
  };
  return { texto: JSON.stringify(borrador), uso: { input_tokens: 2_400, output_tokens: 420 }, cache: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
}

/** Parte un texto en trozos pequeños, como llegaría de un modelo. */
export function trocear(texto, largo = 14) {
  const trozos = [];
  for (let i = 0; i < texto.length; i += largo) trozos.push(texto.slice(i, i + largo));
  return trozos;
}

/**
 * Respuesta por omisión (e2e): repite con fidelidad las primeras frases de la primera entrada del contexto, que es
 * lo que haría un buen modelo, y obedece unas marcas escritas en la pregunta para provocar cada caso de error. Las
 * marcas son una sola palabra sin significado (ZZERROR…): así no se parecen a nada de la base de conocimiento y no
 * cambian qué entradas encuentra el asistente.
 * @returns {Guion}
 */
export function guionPorOmision({ pregunta, contexto }) {
  if (pregunta.includes("ZZERROR")) return { estado: 500, tipoError: "api_error" };
  if (pregunta.includes("ZZLIMITE")) return { estado: 429, tipoError: "rate_limit_error" };
  if (pregunta.includes("ZZRECHAZO")) return { fragmentos: [], stopReason: "refusal" };
  if (pregunta.includes("ZZPROHIBIDA")) {
    return { fragmentos: trocear("Primero una frase correcta. Te recomendamos comprar cobre ahora. Y una final.") };
  }
  if (pregunta.includes("ZZENLACE")) return { fragmentos: trocear("Visita https://ejemplo.com para saber más.") };
  const base = (contexto[0] ?? "No tengo esa información.").split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
  const texto = `Respuesta de la IA de prueba: ${base}`;
  return {
    fragmentos: trocear(texto),
    intervaloMs: pregunta.includes("ZZLENTA") ? 250 : 0,
    uso: { input_tokens: 900, output_tokens: Math.ceil(texto.length / 3) },
  };
}

/**
 * @param {{
 *   responder?: (solicitud: SolicitudRegistrada, n: number) => Guion | undefined | Promise<Guion | undefined>,
 *   puerto?: number,
 *   exponerSolicitudes?: boolean,
 * }} [opciones]
 *   Si `responder` no devuelve nada, responde el guion por omisión (el del asistente con flujo; el del borrador sin flujo). Con `exponerSolicitudes`, `GET /__solicitudes` entrega un
 *   resumen de lo que llegó (para que una prueba e2e, que corre en otro proceso, compruebe qué se envió al «proveedor»).
 */
export async function crearServidorAnthropicFalso({ responder = () => undefined, puerto = 0, exponerSolicitudes = false } = {}) {
  /** @type {SolicitudRegistrada[]} */
  const solicitudes = [];
  let sinClave = 0;

  const servidor = http.createServer(async (req, res) => {
    const partes = [];
    for await (const parte of req) partes.push(parte);
    const crudo = Buffer.concat(partes).toString("utf8");

    if (exponerSolicitudes && req.method === "GET" && req.url?.split("?")[0] === "/__solicitudes") {
      // Solo un resumen: nunca la clave (aunque aquí sea la falsa) ni cabeceras.
      const resumen = solicitudes.map((r) => {
        const borrador = leerMensajeBorrador(r.cuerpo);
        return {
          pregunta: r.pregunta,
          contexto: r.contexto,
          abortada: r.abortada,
          modelo: r.cuerpo?.model,
          maxTokens: r.cuerpo?.max_tokens,
          sistema: r.cuerpo?.system,
          parametros: Object.keys(r.cuerpo ?? {}).sort(),
          claveCorrecta: CLAVES.has(String(r.cabeceras["x-api-key"])),
          // Borradores: qué títulos y cuántos documentos llegaron, y el mensaje entero (todo es de prueba).
          borrador: borrador.esBorrador,
          titulos: borrador.titulos,
          documentos: borrador.documentos.length,
          mensaje: borrador.esBorrador ? r.cuerpo?.messages?.[0]?.content : undefined,
          formato: r.cuerpo?.output_config?.format?.type,
          esfuerzo: r.cuerpo?.output_config?.effort,
        };
      });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(resumen));
      return;
    }
    if (req.method !== "POST" || req.url?.split("?")[0] !== "/v1/messages") {
      res.writeHead(404, { "content-type": "application/json" }).end(
        JSON.stringify({ type: "error", error: { type: "not_found_error", message: "Ruta desconocida" } }),
      );
      return;
    }
    if (!CLAVES.has(String(req.headers["x-api-key"]))) {
      sinClave += 1;
      res.writeHead(401, { "content-type": "application/json", "x-should-retry": "false" }).end(
        JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
      );
      return;
    }

    let cuerpo;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end(
        JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "JSON inválido" } }),
      );
      return;
    }
    const { pregunta, contexto } = leerMensaje(cuerpo);
    /** @type {SolicitudRegistrada} */
    const registro = { cabeceras: req.headers, cuerpo, pregunta, contexto, abortada: false };
    const n = solicitudes.push(registro) - 1;
    res.on("close", () => {
      if (!res.writableEnded) registro.abortada = true;
    });

    const sinFlujo = cuerpo.stream !== true;
    const guion = (await responder(registro, n)) ?? (sinFlujo ? guionBorradorPorOmision(cuerpo) : guionPorOmision(registro));
    if (guion.retardoMs) await pausa(guion.retardoMs);
    if (guion.colgar) return; // nunca responde: el cliente debe rendirse por su cuenta

    const estado = guion.estado ?? 200;
    if (estado !== 200) {
      res
        .writeHead(estado, {
          "content-type": "application/json",
          // Sin esperas largas en las pruebas: el SDK respeta estas cabeceras al decidir el reintento.
          "retry-after-ms": "1",
          ...(estado === 429 || estado >= 500 ? {} : { "x-should-retry": "false" }),
        })
        .end(
          JSON.stringify({
            type: "error",
            error: { type: guion.tipoError ?? "api_error", message: "Error simulado" },
          }),
        );
      return;
    }

    if (sinFlujo) {
      // Mensaje completo (los borradores: `messages.create` sin flujo, con salida estructurada).
      const texto = guion.texto ?? (guion.fragmentos ?? []).join("");
      const stop = guion.stopReason ?? "end_turn";
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          id: "msg_falso",
          type: "message",
          role: "assistant",
          model: cuerpo.model,
          content: texto ? [{ type: "text", text: texto }] : [],
          stop_reason: stop,
          stop_sequence: null,
          stop_details: stop === "refusal" ? { type: "refusal", category: guion.categoria ?? null, explanation: null } : null,
          usage: { input_tokens: 25, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...guion.uso, ...guion.cache },
        }),
      );
      return;
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const uso = { input_tokens: 25, output_tokens: 1, ...guion.uso };
    res.write(
      eventoSse("message_start", {
        type: "message_start",
        message: {
          id: "msg_falso",
          type: "message",
          role: "assistant",
          model: cuerpo.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: uso.input_tokens, output_tokens: 1 },
        },
      }),
    );
    let indice = 0;
    if (guion.pensamiento) {
      res.write(
        eventoSse("content_block_start", {
          type: "content_block_start",
          index: indice,
          content_block: { type: "thinking", thinking: "", signature: "" },
        }),
      );
      res.write(
        eventoSse("content_block_delta", {
          type: "content_block_delta",
          index: indice,
          delta: { type: "thinking_delta", thinking: "Pienso en la respuesta." },
        }),
      );
      res.write(
        eventoSse("content_block_delta", {
          type: "content_block_delta",
          index: indice,
          delta: { type: "signature_delta", signature: "firma" },
        }),
      );
      res.write(eventoSse("content_block_stop", { type: "content_block_stop", index: indice }));
      indice += 1;
    }
    const fragmentos = guion.fragmentos ?? [];
    if (fragmentos.length > 0) {
      res.write(
        eventoSse("content_block_start", {
          type: "content_block_start",
          index: indice,
          content_block: { type: "text", text: "" },
        }),
      );
      for (const texto of fragmentos) {
        if (res.destroyed) return;
        res.write(
          eventoSse("content_block_delta", {
            type: "content_block_delta",
            index: indice,
            delta: { type: "text_delta", text: texto },
          }),
        );
        if (guion.intervaloMs) await pausa(guion.intervaloMs);
      }
      if (guion.cortar) {
        res.destroy();
        return;
      }
      res.write(eventoSse("content_block_stop", { type: "content_block_stop", index: indice }));
    } else if (guion.cortar) {
      res.destroy();
      return;
    }
    res.write(
      eventoSse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: guion.stopReason ?? "end_turn", stop_sequence: null },
        usage: { output_tokens: uso.output_tokens },
      }),
    );
    res.end(eventoSse("message_stop", { type: "message_stop" }));
  });

  await new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, "127.0.0.1", resolver);
  });
  const direccion = servidor.address();
  const url = `http://127.0.0.1:${typeof direccion === "object" && direccion ? direccion.port : puerto}`;

  return {
    url,
    solicitudes,
    /** Cuántas solicitudes llegaron con una clave que no es la de las pruebas. */
    get rechazadasPorClave() {
      return sinClave;
    },
    cerrar: () =>
      new Promise((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => resolver(undefined));
      }),
  };
}
