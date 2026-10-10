import { hkdfSync } from "node:crypto";

/** Para qué se usa cada clave derivada del secreto maestro de la lista de espera. */
export type Proposito = "cifrado" | "indice" | "tiempo";

/**
 * Del secreto maestro (`WAITLIST_SECRETO`, 256 bits) salen claves independientes con HKDF-SHA256, una por
 * propósito: la que firma la marca de tiempo del formulario no sirve para descifrar correos ni para calcular
 * el índice ciego, y rotar el secreto cambia todas a la vez. El texto `info` lleva una versión (`v1`) para
 * poder cambiar la derivación sin confundir claves.
 */
export function derivarClave(secreto: string, proposito: Proposito): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secreto, "utf8"), "otea-austral", `otea:lista:${proposito}:v1`, 32));
}
