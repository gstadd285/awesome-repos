// Usuario de la aplicación: miembro de `otea_app` (ver la migración 0001),
// sin más permisos que los de ese rol.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export const NOMBRE_ROL = /^[a-z][a-z0-9_]{2,40}$/;
const CLAVE_VALIDA = /^[A-Za-z0-9_-]{16,128}$/;

/** Clave aleatoria de 192 bits con minúsculas, mayúsculas, dígitos y símbolos. */
export function generarClave() {
  for (;;) {
    const clave = randomBytes(24).toString("base64url");
    if (/[a-z]/.test(clave) && /[A-Z]/.test(clave) && /\d/.test(clave) && /[-_]/.test(clave)) return clave;
  }
}

/** @param {string} clave */
export function validarClave(clave) {
  if (!CLAVE_VALIDA.test(clave)) {
    throw new Error("La clave debe tener entre 16 y 128 caracteres: letras, dígitos, guion o guion bajo.");
  }
  return clave;
}

/**
 * Verificador SCRAM-SHA-256 (RFC 5802 y 7677) con el formato que guarda
 * Postgres. Así la clave no viaja ni queda en registros en texto plano.
 * Las claves válidas son ASCII, por lo que SASLprep no las cambia.
 *
 * @param {string} clave
 * @param {Buffer} [sal]
 * @param {number} [iteraciones]
 */
export function verificadorScram(clave, sal = randomBytes(16), iteraciones = 4096) {
  validarClave(clave);
  const salada = pbkdf2Sync(clave, sal, iteraciones, 32, "sha256");
  const claveCliente = createHmac("sha256", salada).update("Client Key").digest();
  const almacenada = createHash("sha256").update(claveCliente).digest();
  const claveServidor = createHmac("sha256", salada).update("Server Key").digest();
  return `SCRAM-SHA-256$${iteraciones}:${sal.toString("base64")}$${almacenada.toString("base64")}:${claveServidor.toString("base64")}`;
}

/**
 * Sentencias para crear el usuario (o renovar su clave) con límites de
 * tiempo y de conexiones. El nombre se valida antes de usarse como
 * identificador; el secreto va como literal escapado.
 *
 * @param {string} nombre
 * @param {string} secreto clave o verificador SCRAM
 * @param {boolean} existe
 */
export function sentenciasRol(nombre, secreto, existe) {
  if (!NOMBRE_ROL.test(nombre)) {
    throw new Error("Nombre de rol inválido: minúsculas, dígitos y guion bajo (3 a 41 caracteres).");
  }
  const literal = `'${secreto.replaceAll("'", "''")}'`;
  return [
    existe
      ? `alter role ${nombre} with login password ${literal}`
      : `create role ${nombre} with login password ${literal}`,
    `grant otea_app to ${nombre}`,
    `alter role ${nombre} connection limit 20`,
    `alter role ${nombre} set statement_timeout = '5s'`,
    `alter role ${nombre} set idle_in_transaction_session_timeout = '15s'`,
  ];
}

/**
 * URL de conexión de la aplicación a partir de la del dueño: mismo host y
 * base, otro usuario. En Neon usa el host con agrupador de conexiones
 * (`-pooler`) y exige verificar el certificado.
 *
 * @param {string} urlAdmin
 * @param {string} nombre
 * @param {string} clave
 */
export function urlAplicacion(urlAdmin, nombre, clave) {
  const url = new URL(urlAdmin);
  url.username = nombre;
  url.password = clave;
  if (url.hostname.endsWith(".neon.tech") && !url.hostname.split(".")[0].endsWith("-pooler")) {
    const [punto, ...resto] = url.hostname.split(".");
    url.hostname = [`${punto}-pooler`, ...resto].join(".");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
