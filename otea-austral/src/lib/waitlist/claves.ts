import { derivarClave as derivar } from "../../../scripts/lib/lista-cifrado.mjs";

/** Para qué se usa cada clave derivada del secreto maestro de la lista de espera. */
export type Proposito = "cifrado" | "indice" | "tiempo";

/**
 * Del secreto maestro (`WAITLIST_SECRETO`, 256 bits) salen claves independientes con HKDF-SHA256, una por
 * propósito (ver `scripts/lib/lista-cifrado.mjs`): la que firma la marca de tiempo del formulario no sirve para
 * descifrar correos ni para calcular el índice ciego, y rotar el secreto cambia todas a la vez.
 */
export function derivarClave(secreto: string, proposito: Proposito): Buffer {
  return derivar(secreto, proposito);
}
