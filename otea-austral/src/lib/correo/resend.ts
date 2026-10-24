import { logSecurityEvent } from "@/lib/security/log";

/** Única dirección a la que el servidor envía correo (fija, nunca de un usuario). */
export const API_RESEND = "https://api.resend.com/emails";

export type Correo = {
  /** Destinatario: siempre un solo correo, el de la persona que hizo la solicitud. */
  para: string;
  asunto: string;
  texto: string;
  html: string;
};

export type EnviarCorreo = (correo: Correo) => Promise<void>;

type Opciones = {
  apiKey: string;
  /** Por ejemplo `Otea Austral <alertas@oteaustral.com>` (dominio verificado en Resend). */
  remitente: string;
  /** Solo las pruebas e2e cambian la dirección (un servidor que imita a Resend); `env.ts` lo limita a `OTEA_E2E=1`. */
  url?: string;
  fetchFn?: typeof fetch;
  tiempoLimiteMs?: number;
};

/**
 * Envía un correo con la API de Resend, con tiempo límite y sin seguir redirecciones. Si falla, registra solo un código
 * técnico (nunca el correo, el asunto ni los enlaces) y lanza para que quien llama pueda reintentar.
 */
export function crearEnviadorResend({
  apiKey,
  remitente,
  url = API_RESEND,
  fetchFn = fetch,
  tiempoLimiteMs = 10_000,
}: Opciones): EnviarCorreo {
  return async function enviar({ para, asunto, texto, html }) {
    let respuesta: Response;
    try {
      respuesta = await fetchFn(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: remitente, to: [para], subject: asunto, text: texto, html }),
        redirect: "error",
        signal: AbortSignal.timeout(tiempoLimiteMs),
      });
    } catch (error) {
      const codigo = error instanceof Error && error.name === "TimeoutError" ? "tiempo_agotado" : "red";
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "correo", codigo });
      throw new Error("No se pudo enviar el correo.");
    }
    // La respuesta no se lee ni se registra: puede repetir el correo.
    await respuesta.body?.cancel().catch(() => {});
    if (!respuesta.ok) {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "correo", codigo: `http_${respuesta.status}` });
      throw new Error("No se pudo enviar el correo.");
    }
  };
}
