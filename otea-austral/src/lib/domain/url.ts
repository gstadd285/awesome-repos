import { z } from "zod";

/**
 * Devuelve la URL normalizada solo si es `https:` absoluta, con host y sin
 * credenciales embebidas. Cualquier otro esquema (`http:`, `javascript:`,
 * `data:`, `file:`…) o una cadena no parseable devuelve `null`.
 */
export function parseHttpsUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed !== value || trimmed.length === 0 || trimmed.length > 2048) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;
  return url;
}

/**
 * `true` si `url` es https y su host es el de `base` o un subdominio suyo (sin contar `www.` de la base):
 * con base `https://www.bcentral.cl/`, valen `www.bcentral.cl`, `bcentral.cl` y `si3.bcentral.cl`, pero no
 * `bcentral.cl.example.org`. Así se ata la dirección de un feed (y, más adelante, cada enlace que llegue en él)
 * al dominio de su fuente en el registro.
 */
export function dentroDelDominio(url: string, base: string): boolean {
  const destino = parseHttpsUrl(url);
  const raiz = parseHttpsUrl(base);
  if (!destino || !raiz) return false;
  const dominio = raiz.hostname.replace(/^www\./, "");
  return destino.hostname === dominio || destino.hostname.endsWith(`.${dominio}`);
}

/** Enlace seguro para usar en `href`; `undefined` si no pasa la validación. */
export function safeHref(value: string): string | undefined {
  return parseHttpsUrl(value)?.href;
}

export const httpsUrl = z
  .string()
  .refine((value) => parseHttpsUrl(value) !== null, {
    message: "La URL debe ser https absoluta y sin credenciales",
  });
