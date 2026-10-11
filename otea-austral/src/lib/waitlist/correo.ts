import { logSecurityEvent } from "@/lib/security/log";

/** Única dirección a la que el servidor hace peticiones salientes (fija, nunca de un usuario). */
export const API_RESEND = "https://api.resend.com/emails";

export const ASUNTO_CONFIRMACION = "Confirma tu inscripción en Otea Austral";

type Opciones = {
  apiKey: string;
  /** Por ejemplo `Otea Austral <alertas@oteaustral.com>` (dominio verificado en Resend). */
  remitente: string;
  /** URL base pública (https) para armar el enlace. */
  urlSitio: string;
  fetchFn?: typeof fetch;
  tiempoLimiteMs?: number;
};

export function enlaceConfirmacion(urlSitio: string, token: string): string {
  const url = new URL("/lista-de-espera/confirmar", urlSitio);
  url.searchParams.set("token", token);
  return url.href;
}

export function textoConfirmacion(enlace: string): string {
  return [
    "Hola:",
    "",
    "Recibimos una solicitud para inscribir este correo en la lista de espera de Otea Austral.",
    "Para confirmarla, abre este enlace y presiona «Confirmar inscripción» (vence en 72 horas):",
    "",
    enlace,
    "",
    "Si no fuiste tú, ignora este mensaje: la inscripción sin confirmar se borra sola en 30 días.",
    "",
    "Otea Austral · Inteligencia de eventos para mercados.",
    "Información y análisis. No constituye asesoría financiera.",
  ].join("\n");
}

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function htmlConfirmacion(enlace: string): string {
  const e = escapar(enlace);
  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#0F1B2D;line-height:1.5">
<p>Hola:</p>
<p>Recibimos una solicitud para inscribir este correo en la lista de espera de Otea Austral. Para confirmarla, abre este enlace y presiona «Confirmar inscripción» (vence en 72 horas):</p>
<p><a href="${e}">${e}</a></p>
<p>Si no fuiste tú, ignora este mensaje: la inscripción sin confirmar se borra sola en 30 días.</p>
<p style="color:#4C5665;font-size:13px">Otea Austral · Inteligencia de eventos para mercados.<br>Información y análisis. No constituye asesoría financiera.</p>
</body></html>`;
}

/**
 * Envía el enlace de confirmación con la API de Resend, con tiempo límite y
 * sin seguir redirecciones. Si falla, registra solo un código técnico (nunca
 * el correo ni el token) y lanza para que se pueda reintentar.
 */
export function crearRemitenteResend({
  apiKey,
  remitente,
  urlSitio,
  fetchFn = fetch,
  tiempoLimiteMs = 10_000,
}: Opciones) {
  return async function enviarConfirmacion(correo: string, token: string): Promise<void> {
    const enlace = enlaceConfirmacion(urlSitio, token);
    let respuesta: Response;
    try {
      respuesta = await fetchFn(API_RESEND, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: remitente,
          to: [correo],
          subject: ASUNTO_CONFIRMACION,
          text: textoConfirmacion(enlace),
          html: htmlConfirmacion(enlace),
        }),
        redirect: "error",
        signal: AbortSignal.timeout(tiempoLimiteMs),
      });
    } catch (error) {
      const codigo = error instanceof Error && error.name === "TimeoutError" ? "tiempo_agotado" : "red";
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "correo", codigo });
      throw new Error("No se pudo enviar el correo de confirmación.");
    }
    // La respuesta no se lee ni se registra: puede repetir el correo.
    await respuesta.body?.cancel().catch(() => {});
    if (!respuesta.ok) {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "correo", codigo: `http_${respuesta.status}` });
      throw new Error("No se pudo enviar el correo de confirmación.");
    }
  };
}
