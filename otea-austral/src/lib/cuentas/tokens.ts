import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Tokens de un solo uso (enlaces de los correos) y de sesión: 32 bytes aleatorios en base64url. De cada uno la base solo
 * guarda su hash SHA-256: con 256 bits de entropía no hace falta un hash lento, y una copia de la base no sirve para
 * entrar ni para abrir un enlace.
 */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Códigos de recuperación de la verificación en dos pasos: para entrar si se pierde el teléfono. Diez caracteres de un
 * alfabeto sin los que se confunden (0/o, 1/l/i), en dos grupos de cinco (≈ 49 bits). Cada uno vale una sola vez.
 */
const ALFABETO_RECUPERACION = "abcdefghjkmnpqrstuvwxyz23456789";

export function generarCodigoRecuperacion(): string {
  const grupo = () =>
    Array.from({ length: 5 }, () => ALFABETO_RECUPERACION[randomInt(ALFABETO_RECUPERACION.length)]).join("");
  return `${grupo()}-${grupo()}`;
}

/** Sin guion ni espacios y en minúsculas: así se compara lo que la persona escribe con lo que se guardó. */
export function normalizarCodigoRecuperacion(texto: string): string {
  return texto.replace(/[\s-]/g, "").toLowerCase();
}

export function hashCodigoRecuperacion(codigo: string): string {
  return createHash("sha256").update(`otea:recuperacion:${normalizarCodigoRecuperacion(codigo)}`, "utf8").digest("hex");
}
