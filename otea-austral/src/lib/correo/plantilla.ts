/**
 * Armado de los correos de la aplicación: de una misma lista de bloques salen el texto plano y el HTML. Todo lo que
 * entra al HTML se escapa y los enlaces se validan (https, o http solo hacia localhost en desarrollo): un correo no debe
 * poder llevar un `javascript:` ni HTML armado con datos.
 */
export type Bloque =
  | { tipo: "parrafo"; texto: string }
  /** Enlace principal: un botón en el HTML y «texto: dirección» en el texto plano. */
  | { tipo: "enlace"; texto: string; url: string }
  | { tipo: "lista"; items: readonly string[] };

export type CorreoArmado = { asunto: string; texto: string; html: string };

const PIE = ["Otea Austral · Inteligencia de eventos para mercados.", "Información y análisis. No constituye asesoría financiera."] as const;

export function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function urlSegura(url: string): string {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("Enlace de correo no permitido.");
  return u.href;
}

export function componerCorreo(asunto: string, bloques: readonly Bloque[]): CorreoArmado {
  // Una línea nueva en el asunto permitiría agregar cabeceras al mensaje.
  if (/[\r\n]/.test(asunto)) throw new Error("El asunto no admite saltos de línea.");

  const texto: string[] = ["Hola:", ""];
  const html: string[] = ['<p style="margin:0 0 16px">Hola:</p>'];
  for (const b of bloques) {
    if (b.tipo === "parrafo") {
      texto.push(b.texto, "");
      html.push(`<p style="margin:0 0 16px">${escapar(b.texto)}</p>`);
    } else if (b.tipo === "enlace") {
      const url = urlSegura(b.url);
      texto.push(`${b.texto}:`, url, "");
      html.push(
        `<p style="margin:0 0 8px"><a href="${escapar(url)}" style="display:inline-block;background:#B08D57;color:#0F1B2D;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${escapar(b.texto)}</a></p>`,
        `<p style="margin:0 0 16px;font-size:13px;color:#4C5665">Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="word-break:break-all">${escapar(url)}</span></p>`,
      );
    } else {
      for (const item of b.items) texto.push(`- ${item}`);
      texto.push("");
      html.push(`<ul style="margin:0 0 16px;padding-left:20px">${b.items.map((i) => `<li>${escapar(i)}</li>`).join("")}</ul>`);
    }
  }
  texto.push(...PIE);
  html.push(`<p style="margin:24px 0 0;font-size:13px;color:#4C5665">${PIE.map(escapar).join("<br>")}</p>`);

  return {
    asunto,
    texto: texto.join("\n"),
    html: `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#0F1B2D;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">\n${html.join("\n")}\n</body></html>`,
  };
}
