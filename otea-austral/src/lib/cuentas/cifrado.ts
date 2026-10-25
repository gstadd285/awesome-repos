import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifrado de los datos personales de las cuentas con `CUENTAS_SECRETO` (256 bits, en Secret Manager).
 *
 * De ese secreto salen, con HKDF-SHA256, claves independientes por propósito: la que protege el correo no sirve para
 * abrir el secreto de la verificación en dos pasos ni para firmar el token anti-CSRF, y rotar el secreto cambia todas.
 *
 *   · Correo: se guarda cifrado con AES-256-GCM (IV aleatorio de 96 bits) y se busca por un índice ciego (HMAC-SHA256 del
 *     correo normalizado): quien viera la base, o una copia, no leería ningún correo ni podría probar si uno existe.
 *     A diferencia de la lista de espera, aquí la aplicación SÍ puede leerlo de vuelta (envía los avisos de seguridad y
 *     muestra el correo en el perfil).
 *   · Secreto TOTP: AES-256-GCM. El «dato asociado» (AAD) lleva el índice (correo) o el id de la cuenta (TOTP): un texto
 *     cifrado copiado a otra fila no se descifra.
 *   · Formato: `v1.` + base64url(iv ‖ texto cifrado ‖ etiqueta). La versión permite cambiar el esquema.
 *   · Códigos de invitación: solo su HMAC-SHA256 (clave `invitaciones`); con 100 bits al azar no hace falta un hash lento,
 *     y sin el secreto una copia de la base no sirve para probar códigos.
 */
export const VERSION_CIFRADO = "v1";
/** Lo que valida la base (migración 0006): `v1.` y base64url. */
export const FORMATO_CORREO_CIFRADO = /^v1\.[A-Za-z0-9_-]{39,397}$/;
export const FORMATO_TOTP_CIFRADO = /^v1\.[A-Za-z0-9_-]{60,120}$/;

const TAM_IV = 12;
const TAM_ETIQUETA = 16;

export type PropositoClave = "correo-cifrado" | "correo-indice" | "totp" | "csrf" | "tiempo" | "invitaciones";

/** Clave de 256 bits para un propósito. Los nombres de propósito son parte del formato: no los cambies. */
export function derivarClaveCuentas(secreto: string, proposito: PropositoClave): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secreto, "utf8"), "otea-austral", `otea:cuentas:${proposito}:v1`, 32));
}

function sellar(clave: Buffer, aad: string, texto: string): string {
  const iv = randomBytes(TAM_IV);
  const cifra = createCipheriv("aes-256-gcm", clave, iv);
  cifra.setAAD(Buffer.from(aad));
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return `${VERSION_CIFRADO}.${Buffer.concat([iv, cifrado, cifra.getAuthTag()]).toString("base64url")}`;
}

function abrir(clave: Buffer, aad: string, sellado: string): string {
  const m = /^v1\.([A-Za-z0-9_-]+)$/.exec(sellado);
  if (!m) throw new Error("Formato cifrado desconocido.");
  const bytes = Buffer.from(m[1], "base64url");
  if (bytes.length < TAM_IV + TAM_ETIQUETA + 1) throw new Error("Dato cifrado demasiado corto.");
  const descifra = createDecipheriv("aes-256-gcm", clave, bytes.subarray(0, TAM_IV));
  descifra.setAAD(Buffer.from(aad));
  descifra.setAuthTag(bytes.subarray(bytes.length - TAM_ETIQUETA));
  try {
    return Buffer.concat([descifra.update(bytes.subarray(TAM_IV, bytes.length - TAM_ETIQUETA)), descifra.final()]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar (clave equivocada o dato alterado).");
  }
}

export type CifradorCuentas = {
  /** Índice ciego del correo normalizado (hex de 64 caracteres). */
  indiceCorreo(correo: string): string;
  cifrarCorreo(correo: string): { indice: string; cifrado: string };
  descifrarCorreo(cifrado: string, indice: string): string;
  cifrarTotp(secretoBase32: string, cuentaId: string): string;
  descifrarTotp(cifrado: string, cuentaId: string): string;
  /** Token anti-CSRF ligado a una sesión (a su hash, nunca al token que viaja en la cookie). */
  tokenCsrf(hashSesion: string): string;
  /** Clave de la marca de tiempo del formulario de alta (trampa contra bots; ver `waitlist/tiempo.ts`). */
  claveTiempo: Buffer;
  /** HMAC-SHA256 de un código de invitación ya normalizado (`invitaciones.ts`): lo único que se guarda del código. */
  hashInvitacion(codigoNormalizado: string): string;
};

export function crearCifradorCuentas(secreto: string): CifradorCuentas {
  const claveCorreo = derivarClaveCuentas(secreto, "correo-cifrado");
  const claveIndice = derivarClaveCuentas(secreto, "correo-indice");
  const claveTotp = derivarClaveCuentas(secreto, "totp");
  const claveCsrf = derivarClaveCuentas(secreto, "csrf");
  const claveInvitaciones = derivarClaveCuentas(secreto, "invitaciones");
  const indiceCorreo = (correo: string) => createHmac("sha256", claveIndice).update(correo).digest("hex");
  const aadCorreo = (indice: string) => `otea:cuentas.correo:${VERSION_CIFRADO}:${indice}`;
  const aadTotp = (cuentaId: string) => `otea:cuentas.totp:${VERSION_CIFRADO}:${cuentaId}`;

  return {
    indiceCorreo,

    cifrarCorreo(correo) {
      const indice = indiceCorreo(correo);
      return { indice, cifrado: sellar(claveCorreo, aadCorreo(indice), correo) };
    },

    descifrarCorreo(cifrado, indice) {
      const correo = abrir(claveCorreo, aadCorreo(indice), cifrado);
      if (indiceCorreo(correo) !== indice) throw new Error("El correo descifrado no coincide con su índice.");
      return correo;
    },

    cifrarTotp: (secretoBase32, cuentaId) => sellar(claveTotp, aadTotp(cuentaId), secretoBase32),
    descifrarTotp: (cifrado, cuentaId) => abrir(claveTotp, aadTotp(cuentaId), cifrado),

    tokenCsrf: (hashSesion) => createHmac("sha256", claveCsrf).update(`csrf.${hashSesion}`).digest("base64url"),

    claveTiempo: derivarClaveCuentas(secreto, "tiempo"),

    hashInvitacion: (codigo) => createHmac("sha256", claveInvitaciones).update(`otea:invitacion:${codigo}`).digest("hex"),
  };
}
