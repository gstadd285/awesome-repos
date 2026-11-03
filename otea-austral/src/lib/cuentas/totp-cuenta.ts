import { randomBytes } from "node:crypto";

/**
 * Verificación en dos pasos de las cuentas: códigos de un solo uso de una app de autenticación (TOTP, RFC 6238: HMAC-SHA1,
 * 6 dígitos, 30 segundos), los mismos que usa el panel interno (`@/lib/admin/totp`). Aquí solo está lo propio de las
 * cuentas: crear el secreto y armar el enlace para agregarlo a la app.
 */
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

/** Secreto de 160 bits en base32 (32 caracteres), el tamaño que recomienda el RFC 4226. */
export function generarSecretoTotp(): string {
  return base32(randomBytes(20));
}

export const FORMATO_SECRETO_TOTP = /^[A-Z2-7]{32}$/;

/**
 * Enlace `otpauth://` que lee la app de autenticación (lo lleva el código QR y el botón «abrir en mi app»). Los valores
 * por omisión (SHA-1, 6 dígitos, 30 s) no se repiten: así el código QR es más chico y todas las apps lo leen.
 */
export function uriTotp(secreto: string, correo: string): string {
  const emisor = "Otea Austral";
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(correo)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}`;
}

export { secretoEnGrupos } from "./formato-secreto";
