// Comprobaciones comunes de las conexiones con el rol dueño que usan los scripts de administración.

/**
 * La conexión del dueño debe ir cifrada salvo en local.
 * @param {string} urlAdmin
 * @returns {string | null} el motivo del rechazo, o `null` si está bien
 */
export function motivoConexionInsegura(urlAdmin) {
  const destino = new URL(urlAdmin);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(destino.hostname);
  if (local) return null;
  return ["verify-full", "require", "verify-ca"].includes(destino.searchParams.get("sslmode") ?? "")
    ? null
    : "La conexión debe ir cifrada: agrega sslmode=verify-full a DATABASE_URL_ADMIN.";
}
