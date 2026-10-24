import { API_RESEND, crearEnviadorResend } from "@/lib/correo/resend";

export { API_RESEND };

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
 * Envía el enlace de confirmación de la lista de espera con la API de Resend (ver `@/lib/correo/resend`): con tiempo
 * límite, sin seguir redirecciones y registrando solo un código técnico si falla.
 */
export function crearRemitenteResend({ apiKey, remitente, urlSitio, fetchFn, tiempoLimiteMs }: Opciones) {
  const enviar = crearEnviadorResend({ apiKey, remitente, fetchFn, tiempoLimiteMs });
  return async function enviarConfirmacion(correo: string, token: string): Promise<void> {
    const enlace = enlaceConfirmacion(urlSitio, token);
    await enviar({
      para: correo,
      asunto: ASUNTO_CONFIRMACION,
      texto: textoConfirmacion(enlace),
      html: htmlConfirmacion(enlace),
    });
  };
}
