/**
 * Endpoint del asistente (`POST /api/asistente`): el borde HTTP. Antes de que una pregunta llegue al servicio
 * pasa por las mismas puertas que los demás puntos que reciben datos del sitio: tipo de contenido, origen,
 * volumen por persona, tamaño del cuerpo y validación estricta. La respuesta se transmite como NDJSON (un evento
 * por línea) para que la persona vea la respuesta con IA aparecer frase por frase.
 */
import { z } from "zod";
import { ipCliente } from "@/lib/security/ip";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import { leerCuerpoLimitado } from "@/lib/security/csp-report";
import { MAX_ANTERIORES, MAX_CUERPO_BYTES, type EventoAsistente } from "./limites";
import { limpiarPregunta } from "./politicas";
import type { Consulta } from "./servicio";

const Solicitud = z.strictObject({
  pregunta: z.string(),
  anteriores: z.array(z.string()).max(MAX_ANTERIORES).optional(),
});

export type DependenciasManejador = {
  /** El servicio con su configuración (modo base o con IA). */
  responder: (consulta: Consulta, senal: AbortSignal) => AsyncIterable<EventoAsistente>;
  /** Proxies de confianza delante del servidor (para saber cuál es la IP real). */
  proxiesConfiables?: number;
  /** Preguntas por minuto y por día de cada persona (en memoria, por instancia). */
  porMinuto?: FixedWindowLimiter;
  porDia?: FixedWindowLimiter;
  registrar?: (evento: SecurityEvent) => void;
};

export const LIMITE_POR_MINUTO = 12;
export const LIMITE_POR_DIA = 150;

const CABECERAS_JSON = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function error(estado: number, codigo: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: codigo }), { status: estado, headers: { ...CABECERAS_JSON, ...extra } });
}

/** Huella de la IP para contar solicitudes: solo en memoria, nunca se guarda ni se registra. */
async function huella(ip: string): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ¿La solicitud viene de una página de este mismo sitio? Sin `Origin` (curl, pruebas) no es un navegador y se deja pasar. */
export function esMismoOrigen(cabeceras: Headers): boolean {
  const sitio = cabeceras.get("sec-fetch-site");
  if (sitio && sitio !== "same-origin") return false;
  const origen = cabeceras.get("origin");
  if (!origen) return true;
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  try {
    return host !== null && new URL(origen).host === host;
  } catch {
    return false;
  }
}

export function crearManejadorAsistente({
  responder,
  proxiesConfiables = 1,
  porMinuto = createFixedWindowLimiter({ limite: LIMITE_POR_MINUTO, ventanaMs: 60_000 }),
  porDia = createFixedWindowLimiter({ limite: LIMITE_POR_DIA, ventanaMs: 24 * 60 * 60_000 }),
  registrar = logSecurityEvent,
}: DependenciasManejador) {
  // A lo más un aviso de «límite excedido» por minuto, para no inundar el registro.
  const avisos = createFixedWindowLimiter({ limite: 1, ventanaMs: 60_000 });

  return async function POST(request: Request): Promise<Response> {
    const tipo = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (tipo !== "application/json") return error(415, "tipo");
    if (!esMismoOrigen(request.headers)) return error(403, "origen");

    const persona = await huella(ipCliente(request.headers, proxiesConfiables));
    if (!porMinuto.tryConsume(persona) || !porDia.tryConsume(persona)) {
      if (avisos.tryConsume()) registrar({ tipo: "limite_excedido", recurso: "asistente" });
      return error(429, "limite", { "Retry-After": "60" });
    }

    const texto = await leerCuerpoLimitado(request, MAX_CUERPO_BYTES);
    if (texto === null) return error(413, "grande");
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      return error(400, "invalida");
    }
    const solicitud = Solicitud.safeParse(datos);
    if (!solicitud.success) return error(400, "invalida");

    const pregunta = limpiarPregunta(solicitud.data.pregunta);
    if (!pregunta.ok) return error(400, pregunta.motivo);
    const anteriores = (solicitud.data.anteriores ?? []).flatMap((p) => {
      const limpia = limpiarPregunta(p);
      return limpia.ok ? [limpia.texto] : [];
    });

    // La conexión se cierra cuando la persona se va: el servicio deja de gastar y de esperar.
    const control = new AbortController();
    const senal = AbortSignal.any([request.signal, control.signal]);
    const iterador = responder({ pregunta: pregunta.texto, anteriores, clave: persona }, senal)[Symbol.asyncIterator]();
    const codificador = new TextEncoder();
    const linea = (evento: EventoAsistente) => codificador.encode(`${JSON.stringify(evento)}\n`);

    const cuerpo = new ReadableStream<Uint8Array>({
      async pull(flujo) {
        try {
          const paso = await iterador.next();
          if (paso.done) flujo.close();
          else flujo.enqueue(linea(paso.value));
        } catch {
          // El servicio no debería lanzar; si lo hace, la persona recibe un error genérico, nunca el detalle.
          flujo.enqueue(linea({ t: "error", codigo: "interno" }));
          flujo.close();
        }
      },
      async cancel() {
        control.abort();
        await iterador.return?.();
      },
    });

    return new Response(cuerpo, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Evita que un proxy intermedio retenga la respuesta en vez de transmitirla.
        "X-Accel-Buffering": "no",
      },
    });
  };
}
