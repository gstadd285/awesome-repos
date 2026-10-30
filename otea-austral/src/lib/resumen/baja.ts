import { hashToken } from "@/lib/cuentas/tokens";

/**
 * Baja de un clic del resumen diario (`POST /api/resumen/baja`). El token llega en la dirección (así lo envían los programas
 * de correo con la cabecera `List-Unsubscribe-Post`, RFC 8058) y de él solo se busca su hash. Darse de baja apaga el resumen
 * de la cuenta, borra todos sus tokens y deja `resumen_desactivado` en su actividad. Un GET nunca cambia nada.
 */

/** 32 bytes en base64url, como los de `generarToken`. */
export const FORMATO_TOKEN_BAJA = /^[A-Za-z0-9_-]{43}$/;

export interface AlmacenBaja {
  /** Gasta el token si existe y no venció; `true` si sirvió (aunque el resumen ya estuviera apagado). */
  darDeBaja(tokenHash: string, ahora: Date): Promise<boolean>;
}

export type ResultadoBaja = "baja" | "enlace_invalido";

export function tokenDeBaja(valor: unknown): string | null {
  return typeof valor === "string" && FORMATO_TOKEN_BAJA.test(valor) ? valor : null;
}

export async function darDeBaja(valor: unknown, almacen: AlmacenBaja, ahora = new Date()): Promise<ResultadoBaja> {
  const token = tokenDeBaja(valor);
  if (!token) return "enlace_invalido";
  return (await almacen.darDeBaja(hashToken(token), ahora)) ? "baja" : "enlace_invalido";
}
