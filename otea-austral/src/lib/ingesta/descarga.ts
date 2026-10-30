import "server-only";
import type { Source } from "@/lib/domain/schemas";
import { dentroDelDominio, parseHttpsUrl } from "@/lib/domain/url";

/**
 * **El único archivo de la ingesta (y de los borradores) que sale a internet** (`arquitectura.test.ts` lo vigila;
 * `docs/alertas-reales.md` §2.2). Cada solicitud:
 *
 * 1. Se valida **antes de conectar**: https, puerto 443, sin credenciales ni IP literal, en el dominio de `url_base`
 *    de la fuente y, si es un feed, la URL **exacta** de uno de sus feeds verificados del registro.
 * 2. Respeta un ritmo de al menos 2 s entre solicitudes al mismo host (secuencial).
 * 3. Sigue a mano (`redirect: "manual"`) hasta 3 redirecciones y valida cada salto: https y el mismo dominio de la
 *    fuente; si no, corta.
 * 4. Corta a los 10 s (incluida la lectura del cuerpo) y al pasar el tamaño máximo, leyendo en flujo: el cuerpo nunca
 *    se lee entero sin tope, y el tope cuenta los bytes ya descomprimidos.
 * 5. Exige el tipo de contenido de su clase y declara un User-Agent con contacto (`agenteIngesta`).
 * 6. Devuelve `Retry-After` (como mucho 24 h) para que el feed quede en pausa.
 */

export type ClaseDescarga = "feed_xml" | "feed_json" | "robots" | "documento";

export const TIPOS_PERMITIDOS: Record<ClaseDescarga, readonly string[]> = {
  feed_xml: ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"],
  feed_json: ["application/json", "application/feed+json"],
  robots: ["text/plain"],
  documento: ["text/html"],
};

const MB = 1024 * 1024;
export const MAX_BYTES: Record<ClaseDescarga, number> = { feed_xml: MB, feed_json: MB, robots: MB / 2, documento: 2 * MB };
export const TIEMPO_POR_SOLICITUD_MS = 10_000;
export const MAX_REDIRECCIONES = 3;
export const PAUSA_MISMO_HOST_MS = 2_000;
export const MAX_REINTENTO_MS = 24 * 60 * 60_000;

export type FuenteDescarga = Pick<Source, "url_base" | "feeds">;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** https, puerto 443, sin credenciales, sin IP literal y en el dominio (o un subdominio) de `urlBase`. */
export function destinoSeguro(valor: string, urlBase: string): URL | null {
  const url = parseHttpsUrl(valor);
  if (!url || url.port !== "") return null;
  if (url.hostname.startsWith("[") || IPV4.test(url.hostname) || url.hostname.endsWith(".")) return null;
  return dentroDelDominio(url.href, urlBase) ? url : null;
}

/**
 * ¿Puede la ingesta pedir esta URL a esta fuente? Un feed solo si es **exactamente** uno de sus feeds verificados (del
 * formato de la clase); `robots.txt` solo en la raíz de un host del dominio; un documento, en el dominio.
 */
export function destinoPermitido(valor: string, fuente: FuenteDescarga, clase: ClaseDescarga): URL | null {
  const destino = destinoSeguro(valor, fuente.url_base);
  if (!destino) return null;
  if (clase === "feed_xml" || clase === "feed_json") {
    const formatos: readonly string[] = clase === "feed_json" ? ["api"] : ["rss", "atom"];
    const registrado = fuente.feeds.some((f) => formatos.includes(f.formato) && parseHttpsUrl(f.url)?.href === destino.href);
    return registrado ? destino : null;
  }
  if (clase === "robots") return destino.pathname === "/robots.txt" && destino.search === "" ? destino : null;
  return destino;
}

/** `OteaAustral/1.0 (+https://sitio/fuentes; mailto:rol@dominio)`: organización y contacto, como pide la SEC. */
export function agenteIngesta(sitio: string, contacto: string): string {
  return `OteaAustral/1.0 (+${sitio.replace(/\/+$/, "")}/fuentes; ${contacto})`;
}

export type SolicitudDescarga = {
  fuente: FuenteDescarga;
  url: string;
  clase: ClaseDescarga;
  /** Lo guardado de la lectura anterior: `If-None-Match` / `If-Modified-Since` (un 304 no cuesta nada). */
  etag?: string | null;
  ultimaModificacion?: string | null;
  /** Señal de la corrida: al agotarse su presupuesto se corta lo que esté en curso. */
  senal?: AbortSignal;
};

export type CodigoDescarga =
  | "destino"
  | "redireccion_fuera"
  | "redireccion_http"
  | "redirecciones"
  | "tiempo"
  | "tamano"
  | "tipo"
  | "no_encontrado"
  | "http_cliente"
  | "http_servidor"
  | "ritmo"
  | "red";

export type Descarga =
  | { estado: "ok"; cuerpo: Uint8Array; tipo: string; etag: string | null; ultimaModificacion: string | null; url: string }
  | { estado: "sin_cambios"; url: string }
  | { estado: "error"; codigo: CodigoDescarga; http?: number; reintentarDesde?: Date };

export type Descargador = (solicitud: SolicitudDescarga) => Promise<Descarga>;

export type ConfigDescarga = {
  /** User-Agent completo (`agenteIngesta`). */
  agente: string;
  /**
   * Solo pruebas (`INGESTA_URL_PRUEBA`, que `env.ts` admite solo con `OTEA_E2E=1`): cada solicitud ya validada se
   * envía a `origen/host/ruta` en un servidor de fuentes falsas. La validación usa siempre la URL original.
   */
  origenPrueba?: string;
  tiempoMs?: number;
  pausaHostMs?: number;
  reloj?: () => number;
  esperar?: (ms: number, senal?: AbortSignal) => Promise<void>;
};

const error = (codigo: CodigoDescarga, extra: { http?: number; reintentarDesde?: Date } = {}): Descarga => ({
  estado: "error",
  codigo,
  ...extra,
});

/** Valor de cabecera que se puede guardar y reenviar: ASCII visible, sin saltos de línea. */
function cabeceraSegura(valor: string | null | undefined, max: number): string | null {
  return valor && valor.length <= max && /^[\x21-\x7e][\x20-\x7e]*$/.test(valor) ? valor : null;
}

/** `Retry-After` en segundos o como fecha HTTP, acotado a 24 h. */
export function reintentoDesde(valor: string | null, ahora: number): Date | undefined {
  if (!valor) return undefined;
  const limpio = valor.trim();
  let ms: number;
  if (/^\d{1,10}$/.test(limpio)) ms = Number(limpio) * 1000;
  else {
    const fecha = Date.parse(limpio);
    if (!Number.isFinite(fecha)) return undefined;
    ms = fecha - ahora;
  }
  return new Date(ahora + Math.min(Math.max(ms, 0), MAX_REINTENTO_MS));
}

function esperarReal(ms: number, senal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (senal?.aborted) return rechazar(senal.reason);
    const reloj = setTimeout(() => {
      senal?.removeEventListener("abort", alAbortar);
      resolver();
    }, ms);
    const alAbortar = () => {
      clearTimeout(reloj);
      rechazar(senal?.reason);
    };
    senal?.addEventListener("abort", alAbortar, { once: true });
  });
}

const esAborto = (e: unknown) =>
  typeof e === "object" && e !== null && "name" in e && (e.name === "TimeoutError" || e.name === "AbortError");

async function descartar(respuesta: Response): Promise<void> {
  await respuesta.body?.cancel().catch(() => undefined);
}

/** Lee el cuerpo en flujo y corta al pasar `max` bytes (`null`). */
async function leerLimitado(respuesta: Response, max: number): Promise<Uint8Array | null> {
  const lector = respuesta.body?.getReader();
  if (!lector) return new Uint8Array();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    trozos.push(value);
  }
  const cuerpo = new Uint8Array(total);
  let posicion = 0;
  for (const trozo of trozos) {
    cuerpo.set(trozo, posicion);
    posicion += trozo.byteLength;
  }
  return cuerpo;
}

export function crearDescargador(config: ConfigDescarga): Descargador {
  if (!/^[\x20-\x7e]{1,300}$/.test(config.agente)) throw new Error("User-Agent inválido para la ingesta.");
  const reloj = config.reloj ?? Date.now;
  const esperar = config.esperar ?? esperarReal;
  const tiempoMs = config.tiempoMs ?? TIEMPO_POR_SOLICITUD_MS;
  const pausaHost = config.pausaHostMs ?? PAUSA_MISMO_HOST_MS;
  const origen = config.origenPrueba ? new URL(config.origenPrueba).origin : null;
  const ultimaPorHost = new Map<string, number>();

  const direccion = (url: URL) => (origen ? `${origen}/${url.hostname}${url.pathname}${url.search}` : url.href);

  async function turnoDelHost(host: string, senal?: AbortSignal): Promise<void> {
    const ultima = ultimaPorHost.get(host);
    const falta = ultima === undefined ? 0 : ultima + pausaHost - reloj();
    if (falta > 0) await esperar(falta, senal);
    ultimaPorHost.set(host, reloj());
  }

  return async function descargar(solicitud) {
    const { clase } = solicitud;
    let actual = destinoPermitido(solicitud.url, solicitud.fuente, clase);
    if (!actual) return error("destino");

    const cabeceras: Record<string, string> = { "User-Agent": config.agente, Accept: TIPOS_PERMITIDOS[clase].join(", ") };
    if (clase === "feed_xml" || clase === "feed_json") {
      const etag = cabeceraSegura(solicitud.etag, 200);
      const modificada = cabeceraSegura(solicitud.ultimaModificacion, 100);
      if (etag) cabeceras["If-None-Match"] = etag;
      if (modificada) cabeceras["If-Modified-Since"] = modificada;
    }

    try {
      for (let saltos = 0; ; saltos++) {
        await turnoDelHost(actual.host, solicitud.senal);
        const limite = AbortSignal.timeout(tiempoMs);
        const respuesta = await fetch(direccion(actual), {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          headers: cabeceras,
          signal: solicitud.senal ? AbortSignal.any([limite, solicitud.senal]) : limite,
        });
        const { status } = respuesta;

        if ([301, 302, 303, 307, 308].includes(status)) {
          await descartar(respuesta);
          const ubicacion = respuesta.headers.get("location");
          if (!ubicacion || saltos >= MAX_REDIRECCIONES) return error("redirecciones", { http: status });
          let siguiente: URL;
          try {
            siguiente = new URL(ubicacion, actual);
          } catch {
            return error("redireccion_fuera", { http: status });
          }
          if (siguiente.protocol !== "https:") return error("redireccion_http", { http: status });
          const valida = destinoSeguro(siguiente.href, solicitud.fuente.url_base);
          if (!valida) return error("redireccion_fuera", { http: status });
          actual = valida;
          continue;
        }
        if (status === 304) {
          await descartar(respuesta);
          return { estado: "sin_cambios", url: actual.href };
        }
        if (status !== 200) {
          await descartar(respuesta);
          const reintentarDesde = reintentoDesde(respuesta.headers.get("retry-after"), reloj());
          const extra = { http: status, ...(reintentarDesde && (status === 429 || status === 503) ? { reintentarDesde } : {}) };
          if (status === 429) return error("ritmo", extra);
          if (status === 404 || status === 410) return error("no_encontrado", extra);
          return error(status >= 500 ? "http_servidor" : "http_cliente", extra);
        }

        const tipo = (respuesta.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!TIPOS_PERMITIDOS[clase].includes(tipo)) {
          await descartar(respuesta);
          return error("tipo", { http: status });
        }
        const declarado = Number(respuesta.headers.get("content-length") ?? "0");
        if (declarado > MAX_BYTES[clase]) {
          await descartar(respuesta);
          return error("tamano", { http: status });
        }
        const cuerpo = await leerLimitado(respuesta, MAX_BYTES[clase]);
        if (!cuerpo) return error("tamano", { http: status });
        return {
          estado: "ok",
          cuerpo,
          tipo: respuesta.headers.get("content-type") ?? tipo,
          etag: cabeceraSegura(respuesta.headers.get("etag"), 200),
          ultimaModificacion: cabeceraSegura(respuesta.headers.get("last-modified"), 100),
          url: actual.href,
        };
      }
    } catch (e) {
      return error(esAborto(e) ? "tiempo" : "red");
    }
  };
}
