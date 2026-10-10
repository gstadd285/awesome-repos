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

/** Enlace seguro para usar en `href`; `undefined` si no pasa la validación. */
export function safeHref(value: string): string | undefined {
  return parseHttpsUrl(value)?.href;
}

export const httpsUrl = z
  .string()
  .refine((value) => parseHttpsUrl(value) !== null, {
    message: "La URL debe ser https absoluta y sin credenciales",
  });
