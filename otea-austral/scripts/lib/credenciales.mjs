// Credenciales del panel interno: frase de acceso (guardada como hash
// PBKDF2-SHA256), secreto TOTP y secreto de firma de la sesión. Mismo
// formato que verifica src/lib/admin/clave.ts.
import { pbkdf2, randomBytes, randomInt } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/** Recomendación OWASP (2023) para PBKDF2-HMAC-SHA256. */
export const ITERACIONES = 600_000;

// Sin caracteres que se confundan (0/o, 1/l/i).
const ALFABETO_FRASE = "abcdefghjkmnpqrstuvwxyz23456789";
const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Frase aleatoria de 5 grupos de 5 caracteres (≈ 124 bits). */
export function generarFrase() {
  const grupos = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ALFABETO_FRASE[randomInt(ALFABETO_FRASE.length)]).join(""),
  );
  return grupos.join("-");
}

/**
 * @param {string} frase
 * @param {number} [iteraciones]
 * @param {Buffer} [sal]
 */
export async function hashearFrase(frase, iteraciones = ITERACIONES, sal = randomBytes(16)) {
  const hash = await pbkdf2Async(frase.normalize("NFKC"), sal, iteraciones, 32, "sha256");
  return `pbkdf2-sha256$${iteraciones}$${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

/** @param {Buffer} bytes */
export function base32(bytes) {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

/** Secreto TOTP de 160 bits en base32 (32 caracteres, RFC 4226 recomienda 160). */
export function generarSecretoTotp() {
  return base32(randomBytes(20));
}

/** 256 bits en base64url para firmar la cookie de sesión. */
export function generarSecretoSesion() {
  return randomBytes(32).toString("base64url");
}

/**
 * URI para agregar la cuenta en una app de autenticación.
 * @param {string} secreto
 * @param {string} cuenta
 */
export function uriTotp(secreto, cuenta = "admin") {
  const etiqueta = encodeURIComponent(`Otea Austral:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent("Otea Austral")}&algorithm=SHA1&digits=6&period=30`;
}
