import { createHash } from "node:crypto";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import { ipCliente } from "@/lib/security/ip";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";
import { tokenDeBaja, type ResultadoBaja } from "./baja";

/**
 * `POST /api/resumen/baja?t=…`: la baja de un clic del resumen diario (RFC 8058). La envían los programas de correo (cabecera
 * `List-Unsubscribe-Post`) y el botón de `/resumen/baja`. Puertas, en orden:
 *
 * - Sin base (la baja no existe en esta instalación): 404 a todo.
 * - `GET`/`HEAD` **no cambian nada**: llevan a la página que pide confirmar con un botón (abrir un enlace no da de baja).
 * - `POST` sin leer el cuerpo (el de RFC 8058 no aporta nada): con `Content-Length` > 1 KB, 413; límites por IP (cifrada,
 *   en memoria) y globales, 429; el token solo sale de la dirección y se valida su forma antes de tocar la base.
 * - Un navegador (`Sec-Fetch-Mode: navigate`) vuelve a la página con el resultado; un programa de correo recibe texto.
 *
 * Sin cookies ni sesión: el token es la única credencial y solo sirve para dejar el resumen.
 */

const MAX_CUERPO_BYTES = 1024;
const PAGINA = "/resumen/baja";

export type DependenciasBaja = {
  /** `null` si no hay base: la ruta responde 404. */
  darDeBaja: ((token: unknown) => Promise<ResultadoBaja>) | null;
  proxiesConfiables: number;
  porIp?: FixedWindowLimiter;
  global?: FixedWindowLimiter;
  registrar?: (e: SecurityEvent) => void;
};

const noEncontrado = () => new Response(null, { status: 404 });
const texto = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
/** A la página de la baja, por una ruta relativa fija: la consulta solo lleva un token ya validado o un estado propio. */
const aLaPagina = (consulta: string) => new Response(null, { status: 303, headers: { Location: `${PAGINA}${consulta}`, "Cache-Control": "no-store" } });

export function crearManejadorBaja(deps: DependenciasBaja) {
  const porIp = deps.porIp ?? createFixedWindowLimiter({ limite: 20, ventanaMs: 10 * 60_000 });
  const global = deps.global ?? createFixedWindowLimiter({ limite: 600, ventanaMs: 10 * 60_000 });
  const registrar = deps.registrar ?? logSecurityEvent;

  return async function manejar(request: Request): Promise<Response> {
    if (!deps.darDeBaja) return noEncontrado();
    const token = tokenDeBaja(new URL(request.url).searchParams.get("t"));

    if (request.method === "GET" || request.method === "HEAD") {
      // Solo lleva a la página que pide confirmar: un GET (un antivirus que abre los enlaces, una vista previa) no da de baja.
      return aLaPagina(token ? `?t=${token}` : "");
    }
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST" } });

    const largo = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(largo) || largo > MAX_CUERPO_BYTES || request.headers.has("transfer-encoding")) return texto("Solicitud demasiado grande.", 413);

    const navegador = request.headers.get("sec-fetch-mode") === "navigate";
    const huella = createHash("sha256").update(ipCliente(request.headers, deps.proxiesConfiables)).digest("hex");
    if (!global.tryConsume() || !porIp.tryConsume(huella)) {
      registrar({ tipo: "resumen_baja", resultado: "limite" });
      return navegador ? aLaPagina("?estado=limite") : texto("Demasiados intentos. Prueba en unos minutos.", 429);
    }

    let resultado: ResultadoBaja;
    try {
      resultado = await deps.darDeBaja(token);
    } catch {
      registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_baja" });
      return navegador ? aLaPagina("?estado=error") : texto("No pudimos completar la baja. Prueba de nuevo en unos minutos.", 503);
    }
    registrar({ tipo: "resumen_baja", resultado: resultado === "baja" ? "baja" : "enlace_invalido" });
    if (navegador) return aLaPagina(resultado === "baja" ? "?estado=listo" : "?estado=invalido");
    return texto(resultado === "baja" ? "Listo: ya no recibirás el resumen diario de Otea Austral." : "El enlace venció o ya se usó.", 200);
  };
}
