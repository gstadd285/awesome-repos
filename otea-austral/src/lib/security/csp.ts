export const CSP_REPORT_PATH = "/api/csp-report";
/** Nombre del destino declarado en la cabecera `Reporting-Endpoints`. */
export const CSP_REPORT_GROUP = "csp-endpoint";

/**
 * Política de seguridad de contenido estricta, con nonce por solicitud.
 * Sin `unsafe-inline` para scripts; en desarrollo se permite `unsafe-eval`
 * (lo usa React para depurar) y estilos en línea (superposición de errores).
 */
export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  const directivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    // Las violaciones se reportan a /api/csp-report (NIST CSF DE.CM-09).
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [CSP_REPORT_GROUP],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directivas)
    .map(([nombre, valores]) => [nombre, ...valores].join(" "))
    .join("; ");
}

/** Nonce aleatorio de 128 bits en base64. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
