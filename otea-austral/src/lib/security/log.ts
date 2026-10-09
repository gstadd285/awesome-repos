/**
 * Registro de eventos de seguridad (NIST CSF PR.PS-04, DE.CM-09).
 * Emite una línea JSON por evento con campos permitidos y texto saneado:
 * nunca correos, IP, tokens ni parámetros de URL. Sin datos personales.
 */

export type SecurityEvent =
  | {
      tipo: "csp_violation";
      directiva: string;
      bloqueado: string;
      documento: string;
      disposicion: string;
      fuente?: string;
      linea?: number;
      columna?: number;
    }
  | { tipo: "limite_excedido"; recurso: string };

const MAX_LARGO = 300;

const PATRONES: [RegExp, string][] = [
  // Parámetros y fragmentos de URL: pueden llevar datos personales o tokens.
  [/(https?:\/\/[^\s?#"']*)[?#][^\s"']*/gi, "$1"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, "[ip]"],
  // Secuencias largas tipo token, clave o hash.
  [/\b[A-Za-z0-9_\-+/=]{32,}\b/g, "[token]"],
];

/** Elimina datos sensibles y acota el largo de un texto antes de registrarlo. */
export function sanitizeLogText(texto: string): string {
  let limpio = texto.replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const [patron, reemplazo] of PATRONES) {
    limpio = limpio.replace(patron, reemplazo);
  }
  return limpio.length > MAX_LARGO ? `${limpio.slice(0, MAX_LARGO)}…` : limpio;
}

export function formatSecurityEvent(evento: SecurityEvent, ahora = new Date()): string {
  const campos: Record<string, string | number> = { nivel: "seguridad", fecha: ahora.toISOString() };
  for (const [clave, valor] of Object.entries(evento)) {
    if (typeof valor === "string") campos[clave] = sanitizeLogText(valor);
    else if (typeof valor === "number" && Number.isFinite(valor)) campos[clave] = valor;
  }
  return JSON.stringify(campos);
}

export function logSecurityEvent(evento: SecurityEvent): void {
  console.warn(formatSecurityEvent(evento));
}
