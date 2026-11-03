import { pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/**
 * Verifica la frase contra `pbkdf2-sha256$iteraciones$sal$hash` (formato de
 * `scripts/lib/credenciales.mjs`). Comparación en tiempo constante; un hash
 * con formato inválido nunca coincide.
 */
export async function verificarFrase(frase: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2-sha256") return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > 10_000_000) return false;
  const sal = Buffer.from(partes[2], "base64url");
  const esperado = Buffer.from(partes[3], "base64url");
  if (sal.length < 16 || esperado.length !== 32) return false;
  const calculado = await pbkdf2Async(frase.normalize("NFKC"), sal, iteraciones, 32, "sha256");
  return timingSafeEqual(calculado, esperado);
}
