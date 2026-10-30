// Servidor de FUENTES FALSAS para las pruebas de la ingesta (`src/lib/ingesta/`): sirve los fixtures sintéticos de
// `e2e/fixtures/fuentes/` (marcados como de prueba, nunca presentados como reales) y casos malignos generados al vuelo.
// La ingesta llega aquí solo con `origenPrueba` (`INGESTA_URL_PRUEBA`, que exige OTEA_E2E=1): cada solicitud ya
// validada contra el registro se reescribe a `http://127.0.0.1:PUERTO/<host>/<ruta>`.
//
// Rutas especiales (bajo cualquier host): /especial/lento, /especial/goteo, /especial/gigante.rss.xml,
// /especial/gigante-declarado.rss.xml, /especial/redirige-dentro, /especial/redirige-fuera, /especial/redirige-sufijo,
// /especial/redirige-http, /especial/redirige-ip, /especial/bucle, /especial/tipo-html, /especial/ritmo,
// /especial/caido y /especial/error. `robots-caido.*/robots.txt` responde 500. Lo demás, el fixture o 404.
import { createHash } from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIRECTORIO_FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../e2e/fixtures/fuentes");

/** Fecha fija de los fixtures (Last-Modified): son datos de prueba, no cambian. */
const MODIFICADO = "Fri, 23 Oct 2026 12:00:00 GMT";

const TIPOS = [
  [/\.rss\.xml$/, "application/rss+xml; charset=utf-8"],
  [/\.atom\.xml$/, "application/atom+xml; charset=utf-8"],
  [/\.xml$/, "application/xml; charset=utf-8"],
  [/\.json$/, "application/json; charset=utf-8"],
  [/\.txt$/, "text/plain; charset=utf-8"],
  // Documentos para la lectura transitoria de los borradores con IA.
  [/\.html$/, "text/html; charset=utf-8"],
];

const RSS_MINIMO =
  '<?xml version="1.0"?>\n<!-- Fixture sintético de prueba de Otea Austral. -->\n<rss version="2.0"><channel><title>Mínimo (ejemplo)</title>' +
  "<item><title>Ítem mínimo (ejemplo)</title><link>https://fuente-prueba.example.org/minimo</link></item></channel></rss>\n";

/**
 * @typedef {{ host: string, ruta: string, metodo: string, agente: string | null, siNoCoincide: string | null, siModificado: string | null }} SolicitudFuente
 */

/**
 * @param {{ puerto?: number, directorio?: string, exponerSolicitudes?: boolean }} [opciones]
 * @returns {Promise<{ url: string, solicitudes: SolicitudFuente[], cerrar: () => Promise<void> }>}
 */
export async function crearServidorFuentesFalsas({ puerto = 0, directorio = DIRECTORIO_FIXTURES, exponerSolicitudes = false } = {}) {
  /** @type {SolicitudFuente[]} */
  const solicitudes = [];
  const abiertas = new Set();

  const servidor = http.createServer(async (req, res) => {
    const direccion = new URL(req.url ?? "/", "http://fuentes-falsas.invalid");
    if (exponerSolicitudes && direccion.pathname === "/__solicitudes") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(solicitudes));
      return;
    }
    const [, host = "", ...resto] = direccion.pathname.split("/");
    const ruta = `/${resto.join("/")}`;
    solicitudes.push({
      host,
      ruta: `${ruta}${direccion.search}`,
      metodo: req.method ?? "",
      agente: req.headers["user-agent"] ?? null,
      siNoCoincide: req.headers["if-none-match"] ?? null,
      siModificado: req.headers["if-modified-since"] ?? null,
    });
    if (!/^[a-z0-9.-]{1,253}$/.test(host) || ruta.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    const origen = `https://${host}`;

    switch (ruta) {
      case "/especial/lento":
        setTimeout(() => res.writeHead(200, { "content-type": "application/rss+xml" }).end(RSS_MINIMO), 3_000);
        return;
      case "/especial/goteo": {
        res.writeHead(200, { "content-type": "application/rss+xml" });
        res.write('<?xml version="1.0"?><rss version="2.0"><channel>');
        const reloj = setInterval(() => res.write("<!-- goteo -->"), 200);
        res.on("close", () => clearInterval(reloj));
        return;
      }
      case "/especial/gigante.rss.xml": {
        // 2 MiB sin Content-Length (en trozos): el lector debe cortar al pasar 1 MiB.
        res.writeHead(200, { "content-type": "application/rss+xml" });
        const trozo = `<item><title>${"x".repeat(1000)}</title><link>${origen}/g</link></item>`.repeat(64);
        res.write('<?xml version="1.0"?><rss version="2.0"><channel>');
        let enviados = 0;
        const enviar = () => {
          while (enviados < 2 * 1024 * 1024) {
            enviados += trozo.length;
            if (!res.write(trozo)) return void res.once("drain", enviar);
          }
          res.end("</channel></rss>");
        };
        res.on("error", () => undefined);
        enviar();
        return;
      }
      case "/especial/gigante-declarado.rss.xml":
        res.writeHead(200, { "content-type": "application/rss+xml", "content-length": String(5 * 1024 * 1024) });
        res.write(RSS_MINIMO);
        return; // nunca termina: la descarga debe rechazarlo por el largo declarado sin esperar el cuerpo
      case "/especial/redirige-dentro":
        res.writeHead(302, { location: "/canal.rss.xml" }).end();
        return;
      case "/especial/redirige-fuera":
        res.writeHead(302, { location: "https://otro-dominio.example.net/canal.rss.xml" }).end();
        return;
      case "/especial/redirige-sufijo":
        res.writeHead(302, { location: `https://${host}.otro-dominio.example.net/canal.rss.xml` }).end();
        return;
      case "/especial/redirige-http":
        res.writeHead(301, { location: `http://${host}/canal.rss.xml` }).end();
        return;
      case "/especial/redirige-ip":
        res.writeHead(302, { location: "https://127.0.0.1/canal.rss.xml" }).end();
        return;
      case "/especial/bucle":
        res.writeHead(302, { location: `${origen}/especial/bucle` }).end();
        return;
      case "/especial/tipo-html":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(RSS_MINIMO);
        return;
      case "/especial/ritmo":
        res.writeHead(429, { "retry-after": "120" }).end();
        return;
      case "/especial/caido":
        res.writeHead(503, { "retry-after": "99999999" }).end();
        return;
      case "/especial/error":
        res.writeHead(500).end();
        return;
    }

    if (ruta === "/robots.txt" && host.startsWith("robots-caido.")) {
      res.writeHead(500).end();
      return;
    }

    try {
      const archivo = path.join(directorio, host, ruta);
      if (!archivo.startsWith(path.join(directorio, host) + path.sep)) throw new Error("fuera");
      const cuerpo = await readFile(archivo);
      const etag = `"${createHash("sha256").update(cuerpo).digest("hex").slice(0, 16)}"`;
      const tipo = TIPOS.find(([patron]) => patron.test(ruta))?.[1] ?? "application/octet-stream";
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { etag }).end();
        return;
      }
      res.writeHead(200, { "content-type": tipo, etag, "last-modified": MODIFICADO }).end(cuerpo);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("no encontrado");
    }
  });

  servidor.on("connection", (socket) => {
    abiertas.add(socket);
    socket.on("close", () => abiertas.delete(socket));
  });
  await new Promise((resolver) => servidor.listen(puerto, "127.0.0.1", () => resolver(undefined)));
  const direccion = servidor.address();
  const real = typeof direccion === "object" && direccion ? direccion.port : puerto;

  return {
    url: `http://127.0.0.1:${real}`,
    solicitudes,
    cerrar: () =>
      new Promise((resolver) => {
        for (const socket of abiertas) socket.destroy();
        servidor.close(() => resolver());
      }),
  };
}
