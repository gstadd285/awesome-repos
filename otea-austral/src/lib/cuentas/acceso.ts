import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "@/lib/env";
import { ipCliente } from "@/lib/security/ip";
import { logSecurityEvent } from "@/lib/security/log";
import { sha256Hex } from "@/lib/waitlist/service";
import { COOKIE_SESION_CUENTA, OPCIONES_COOKIE_CUENTA } from "./constantes";
import { etiquetaDispositivo } from "./formato";
import { servicioCuentas } from "./instancia";
import type { Contexto, SesionEmitida, SesionVigente } from "./servicio";

/**
 * Sesión de la persona usuaria en cada solicitud. La cookie solo lleva un token al azar: el servicio busca su hash en la
 * base y esa búsqueda decide si sigue vigente (cerrar sesión la revoca de verdad). `cache` evita repetir la consulta
 * entre el encabezado, el diseño y la página de una misma solicitud. Si la base no responde, no hay sesión.
 */
export const sesionCuenta = cache(async (): Promise<SesionVigente | null> => {
  const token = (await cookies()).get(COOKIE_SESION_CUENTA)?.value;
  return servicioCuentas().leerSesion(token);
});

/** Para cada página privada: sin sesión, al formulario de entrada. Ocultar enlaces no es una barrera de seguridad. */
export async function exigirSesionCuenta(): Promise<SesionVigente> {
  const sesion = await sesionCuenta();
  if (!sesion) redirect("/cuenta/entrar");
  return sesion;
}

const iguales = (a: unknown, b: string): boolean => {
  if (typeof a !== "string" || a.length > 200) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Para cada Server Action de la cuenta que cambia algo: sesión vigente y token anti-CSRF del formulario (además de la
 * comprobación de `Origin` de Next.js y de la cookie `SameSite=Lax`). Devuelve `null` si el token no coincide.
 */
export async function exigirAccionCuenta(formData: FormData): Promise<SesionVigente | null> {
  const sesion = await exigirSesionCuenta();
  if (!iguales(formData.get("csrf"), sesion.csrf)) {
    logSecurityEvent({ tipo: "acceso_cuenta", resultado: "rechazado" });
    return null;
  }
  return sesion;
}

/** Lo que el servicio necesita saber de quien hace la solicitud: la IP cifrada (solo para límites) y su dispositivo. */
export async function contextoCuenta(): Promise<Contexto> {
  const cabeceras = await headers();
  return {
    claveCliente: await sha256Hex(ipCliente(cabeceras, env.IP_PROXIES_CONFIABLES)),
    dispositivo: etiquetaDispositivo(cabeceras.get("user-agent")),
  };
}

/** Cookie de la sesión: `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, y vence cuando vence la sesión en la base. */
export async function fijarCookieSesion(sesion: SesionEmitida): Promise<void> {
  const maxAge = Math.max(1, Math.floor((sesion.expira.getTime() - Date.now()) / 1000));
  (await cookies()).set(COOKIE_SESION_CUENTA, sesion.token, { ...OPCIONES_COOKIE_CUENTA, maxAge });
}

export async function borrarCookieSesion(): Promise<void> {
  (await cookies()).set(COOKIE_SESION_CUENTA, "", { ...OPCIONES_COOKIE_CUENTA, maxAge: 0 });
}

export async function cookieSesionActual(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION_CUENTA)?.value;
}
