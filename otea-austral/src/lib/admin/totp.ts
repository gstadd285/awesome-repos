import { createHmac, timingSafeEqual } from "node:crypto";

/** Códigos de un solo uso (TOTP, RFC 6238): HMAC-SHA1, 6 dígitos, 30 segundos. */
export const PERIODO_S = 30;
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodificarBase32(texto: string): Buffer {
  const limpio = texto.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice === -1) throw new Error("Base32 inválido");
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function pasoTotp(ahoraMs: number): number {
  return Math.floor(ahoraMs / 1000 / PERIODO_S);
}

export function codigoTotp(secreto: Buffer, paso: number, digitos = 6): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac("sha1", secreto).update(contador).digest();
  const d = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[d] & 0x7f) << 24) | ((hmac[d + 1] & 0xff) << 16) | ((hmac[d + 2] & 0xff) << 8) | (hmac[d + 3] & 0xff);
  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

/**
 * Devuelve el paso de tiempo del código si es válido (acepta un paso de
 * desfase en cada sentido por diferencias de reloj) o `null`. Recorre toda
 * la ventana y compara en tiempo constante.
 */
export function verificarTotp(secretoBase32: string, codigo: string, ahoraMs: number, ventana = 1): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const secreto = decodificarBase32(secretoBase32);
  const actual = pasoTotp(ahoraMs);
  let aceptado: number | null = null;
  for (let desfase = -ventana; desfase <= ventana; desfase++) {
    const paso = actual + desfase;
    const coincide = timingSafeEqual(Buffer.from(codigoTotp(secreto, paso)), Buffer.from(codigo));
    if (coincide && aceptado === null) aceptado = paso;
  }
  return aceptado;
}
