import { createHash } from "node:crypto";

/**
 * Deduplicación estable de los ítems de un feed (`docs/alertas-reales.md` §2.2). La clave no depende del título, de
 * la fecha ni del orden del feed: `sha256(source_id ‖ "\n" ‖ (guid normalizado o URL canónica))`.
 */

const MAX_BASE = 2048;

/**
 * URL canónica: host en minúsculas, sin credenciales, sin fragmento, sin parámetros `utm_*` y sin barra final. El
 * resto de la consulta se conserva **tal cual llegó** (reescribirla con `URLSearchParams` cambiaría `%20` por `+` y la
 * clave dejaría de ser estable). `null` si no es una URL http(s).
 */
export function urlCanonica(valor: string): string | null {
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const consulta = url.search
    .slice(1)
    .split("&")
    .filter((parte) => parte !== "" && !/^utm_/i.test(decodificarSeguro(parte.split("=")[0])))
    .join("&");
  const ruta = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host.toLowerCase()}${ruta}${consulta ? `?${consulta}` : ""}`;
}

function decodificarSeguro(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

/**
 * Guid (RSS) o id (Atom, JSON Feed) normalizado: sin espacios de más y en forma NFC. Si es una URL http(s), su forma
 * canónica (así el mismo enlace con y sin `utm_*` es el mismo ítem). `null` si queda vacío.
 */
export function guidNormalizado(guid: string | null | undefined): string | null {
  if (!guid) return null;
  const limpio = guid.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  if (/^https?:\/\//i.test(limpio)) return urlCanonica(limpio) ?? limpio;
  return limpio;
}

/** Clave de deduplicación de un ítem; `null` si no hay ni guid ni URL utilizable. */
export function claveItem(sourceId: string, guid: string | null | undefined, url: string): string | null {
  const base = guidNormalizado(guid) ?? urlCanonica(url);
  if (!base) return null;
  return createHash("sha256")
    .update(`${sourceId}\n${base.slice(0, MAX_BASE)}`)
    .digest("hex");
}
