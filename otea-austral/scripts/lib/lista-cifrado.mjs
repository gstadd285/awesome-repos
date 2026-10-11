// Cifrado de los correos de la lista de espera (control 5 del plan de seguridad). Lo usan la aplicación
// (`src/lib/waitlist/`), los scripts `lista:exportar` y `lista:recifrar` y las pruebas: una sola
// implementación del formato.
//
//   · Del secreto maestro `WAITLIST_SECRETO` salen, con HKDF-SHA256, claves independientes por propósito.
//   · El correo se cifra con AES-256-GCM (IV aleatorio de 96 bits, etiqueta de 128). El «dato asociado» (AAD)
//     lleva el índice de la fila: un texto cifrado copiado a otra fila no se descifra.
//   · El índice ciego es HMAC-SHA256 del correo normalizado: sirve para detectar repetidos y buscar una
//     inscripción sin guardar el correo en claro, y no se puede invertir sin la clave.
//   · Formato: `v1.` + base64url(iv ‖ texto cifrado ‖ etiqueta). La versión permite cambiar el esquema.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

export const VERSION_CIFRADO = "v1";
/** Lo que valida la base (migración 0004): `v1.` y base64url; 42 a 400 caracteres en total. */
export const FORMATO_CIFRADO = /^v1\.[A-Za-z0-9_-]{39,397}$/;

const TAM_IV = 12;
const TAM_ETIQUETA = 16;
const PREFIJO_AAD = `otea:lista_espera.correo:${VERSION_CIFRADO}:`;

/** @typedef {"cifrado" | "indice" | "tiempo"} Proposito */

/**
 * Clave de 256 bits para un propósito: la que firma la marca de tiempo del formulario no sirve para
 * descifrar correos ni para calcular el índice, y rotar el secreto cambia todas a la vez.
 *
 * @param {string} secreto
 * @param {Proposito} proposito
 * @returns {Buffer}
 */
export function derivarClave(secreto, proposito) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secreto, "utf8"), "otea-austral", `otea:lista:${proposito}:v1`, 32));
}

/**
 * @typedef {{
 *   indice: (correo: string) => string,
 *   cifrar: (correo: string) => { indice: string, cifrado: string },
 *   descifrar: (cifrado: string, indice: string) => string,
 * }} CifradorCorreo
 */

/**
 * @param {string} secreto `WAITLIST_SECRETO`
 * @returns {CifradorCorreo}
 */
export function crearCifradorCorreo(secreto) {
  const claveCifrado = derivarClave(secreto, "cifrado");
  const claveIndice = derivarClave(secreto, "indice");
  const indice = (/** @type {string} */ correo) => createHmac("sha256", claveIndice).update(correo).digest("hex");

  return {
    indice,

    cifrar(correo) {
      const idx = indice(correo);
      const iv = randomBytes(TAM_IV);
      const cifra = createCipheriv("aes-256-gcm", claveCifrado, iv);
      cifra.setAAD(Buffer.from(PREFIJO_AAD + idx));
      const texto = Buffer.concat([cifra.update(correo, "utf8"), cifra.final()]);
      const cifrado = Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url");
      return { indice: idx, cifrado: `${VERSION_CIFRADO}.${cifrado}` };
    },

    descifrar(cifrado, idx) {
      const m = /^v1\.([A-Za-z0-9_-]+)$/.exec(cifrado);
      if (!m) throw new Error("Formato de correo cifrado desconocido.");
      const bytes = Buffer.from(m[1], "base64url");
      if (bytes.length < TAM_IV + TAM_ETIQUETA + 1) throw new Error("Correo cifrado demasiado corto.");
      const descifra = createDecipheriv("aes-256-gcm", claveCifrado, bytes.subarray(0, TAM_IV));
      descifra.setAAD(Buffer.from(PREFIJO_AAD + idx));
      descifra.setAuthTag(bytes.subarray(bytes.length - TAM_ETIQUETA));
      let correo;
      try {
        correo = Buffer.concat([descifra.update(bytes.subarray(TAM_IV, bytes.length - TAM_ETIQUETA)), descifra.final()]).toString("utf8");
      } catch {
        throw new Error("No se pudo descifrar el correo (clave equivocada o dato alterado).");
      }
      if (indice(correo) !== idx) throw new Error("El correo descifrado no coincide con su índice.");
      return correo;
    },
  };
}
