// Servidor que imita la API de correo de Resend (solo `POST /emails`), para las pruebas e2e de las cuentas: los correos no
// salen a internet ni gastan la cuota del proveedor, y las pruebas leen el enlace que "llegó" para seguir el recorrido real.
// Lo usan las pruebas unitarias y `scripts/resend-falso.mjs` (e2e).
import http from "node:http";

/** Clave que acepta el servidor falso (la de las pruebas; nunca una real). */
export const CLAVE_RESEND_FALSA = "re_CANARIO_clave_de_prueba_0123456789abcdef"; // escaner:ignorar valor falso a propósito

const MAX_CUERPO = 256 * 1024;

/**
 * @typedef {object} CorreoRecibido
 * @property {string} para
 * @property {string} de
 * @property {string} asunto
 * @property {string} texto
 * @property {string} html
 * @property {string} recibido Instante ISO.
 */

/**
 * @param {{ puerto: number, clave?: string, exponerCorreos?: boolean }} opciones
 *   `exponerCorreos`: abre `GET /__correos?para=…` y `DELETE /__correos` (solo para pruebas; nunca en un servidor real).
 *   Un destinatario cuyo correo empiece por `falla.` recibe un error 500, para probar qué hace la aplicación si el envío falla.
 */
export async function crearServidorResendFalso({ puerto, clave = CLAVE_RESEND_FALSA, exponerCorreos = false }) {
  /** @type {CorreoRecibido[]} */
  const correos = [];

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const responder = (estado, cuerpo) => {
      res.writeHead(estado, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cuerpo));
    };

    if (exponerCorreos && url.pathname === "/__correos") {
      if (req.method === "DELETE") {
        correos.length = 0;
        return responder(200, { ok: true });
      }
      if (req.method === "GET") {
        const para = url.searchParams.get("para");
        return responder(200, para ? correos.filter((c) => c.para.toLowerCase() === para.toLowerCase()) : correos);
      }
    }

    if (req.method !== "POST" || url.pathname !== "/emails") return responder(404, { message: "No existe." });
    if (req.headers.authorization !== `Bearer ${clave}`) return responder(401, { message: "API key inválida." });

    let tamano = 0;
    const trozos = [];
    req.on("data", (trozo) => {
      tamano += trozo.length;
      if (tamano > MAX_CUERPO) {
        responder(413, { message: "Demasiado grande." });
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      let cuerpo;
      try {
        cuerpo = JSON.parse(Buffer.concat(trozos).toString("utf8"));
      } catch {
        return responder(422, { message: "JSON inválido." });
      }
      const para = Array.isArray(cuerpo?.to) ? cuerpo.to[0] : undefined;
      if (typeof para !== "string" || typeof cuerpo.subject !== "string" || typeof cuerpo.from !== "string") {
        return responder(422, { message: "Faltan campos." });
      }
      if (para.toLowerCase().startsWith("falla.")) return responder(500, { message: "Error simulado." });
      correos.push({
        para,
        de: cuerpo.from,
        asunto: cuerpo.subject,
        texto: String(cuerpo.text ?? ""),
        html: String(cuerpo.html ?? ""),
        recibido: new Date().toISOString(),
      });
      responder(200, { id: `falso-${correos.length}` });
    });
  });

  await new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, "127.0.0.1", () => resolver(undefined));
  });
  const direccion = servidor.address();
  const puertoReal = typeof direccion === "object" && direccion ? direccion.port : puerto;

  return {
    url: `http://127.0.0.1:${puertoReal}`,
    correos,
    cerrar: () => new Promise((resolver) => servidor.close(() => resolver(undefined))),
  };
}
