import type { TipoEvento } from "./almacen";

/** «ana.perez@correo.cl» → «a***@correo.cl»: lo justo para que la persona reconozca su correo sin exponerlo entero. */
export function enmascararCorreo(correo: string): string {
  const arroba = correo.lastIndexOf("@");
  if (arroba < 1) return "***";
  return `${[...correo.slice(0, arroba)][0]}***${correo.slice(arroba)}`;
}

/**
 * Etiqueta aproximada del dispositivo a partir del agente de usuario («Chrome en Windows»). Es lo único que se guarda:
 * el agente completo identifica demasiado a una persona y no hace falta para reconocer una sesión.
 */
export function etiquetaDispositivo(agente: string | null | undefined): string | null {
  if (!agente) return null;
  const ua = agente.slice(0, 400);
  const navegador = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const sistema = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux|X11/.test(ua)
              ? "Linux"
              : null;
  if (navegador && sistema) return `${navegador} en ${sistema}`;
  return navegador ?? sistema;
}

export const DESCRIPCION_EVENTO: Record<TipoEvento, string> = {
  alta: "Creaste tu cuenta",
  acceso: "Iniciaste sesión",
  clave_cambiada: "Cambiaste tu contraseña",
  clave_restablecida: "Restableciste tu contraseña",
  dos_pasos_activados: "Activaste la verificación en dos pasos",
  dos_pasos_desactivados: "Desactivaste la verificación en dos pasos",
  codigos_regenerados: "Generaste códigos de recuperación nuevos",
  codigo_recuperacion: "Entraste con un código de recuperación",
  sesiones_cerradas: "Cerraste las demás sesiones",
  alta_repetida: "Alguien intentó crear una cuenta con tu correo",
};
