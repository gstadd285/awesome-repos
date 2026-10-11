import { crearCifradorCorreo as crear, type CifradorCorreo } from "../../../scripts/lib/lista-cifrado.mjs";

export type { CifradorCorreo };

/**
 * Cifrado de los correos de la lista de espera (AES-256-GCM, con índice ciego HMAC-SHA256 para detectar
 * repetidos sin guardar el correo en claro). La implementación, el formato y su razón de ser están en
 * `scripts/lib/lista-cifrado.mjs`, compartida con los scripts de exportación y rotación.
 */
export function crearCifradorCorreo(secreto: string): CifradorCorreo {
  return crear(secreto);
}
