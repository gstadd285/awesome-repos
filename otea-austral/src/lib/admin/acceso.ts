import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Contexto } from "@/lib/domain/rules";
import { env, panelActivo } from "@/lib/env";
import { logSecurityEvent } from "@/lib/security/log";
import { COOKIE_SESION, leerSesion, tokenCsrf, verificarCsrf } from "./sesion";

export type SesionAdmin = {
  /** Alias que firma la auditoría (nunca un correo). */
  actor: string;
  sid: string;
  /** Token anti-CSRF para los formularios de esta sesión. */
  csrf: string;
};

function secretoSesion(): string {
  if (!panelActivo() || !env.ADMIN_SESION_SECRETO) notFound();
  return env.ADMIN_SESION_SECRETO;
}

/** Sesión vigente o `null`. Si el panel no está configurado, responde 404. */
export async function sesionActual(): Promise<SesionAdmin | null> {
  const secreto = secretoSesion();
  const sesion = leerSesion(secreto, (await cookies()).get(COOKIE_SESION)?.value, Date.now());
  if (!sesion) return null;
  return { actor: env.ADMIN_ALIAS, sid: sesion.sid, csrf: tokenCsrf(secreto, sesion.sid) };
}

/**
 * Para cada página privada del panel: sin sesión, al formulario de acceso.
 * La verificación ocurre en el servidor en cada solicitud; ocultar enlaces no
 * es una barrera de seguridad.
 */
export async function exigirSesion(): Promise<SesionAdmin> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/admin");
  return sesion;
}

/**
 * Para cada Server Action del panel: sesión vigente y token CSRF del
 * formulario (además de la comprobación de `Origin` de Next.js y de la cookie
 * `SameSite=Strict`). Devuelve `null` si el token no coincide.
 */
export async function exigirAccionAdmin(formData: FormData): Promise<SesionAdmin | null> {
  const sesion = await exigirSesion();
  if (!verificarCsrf(secretoSesion(), sesion.sid, formData.get("csrf"))) {
    logSecurityEvent({ tipo: "acceso_admin", resultado: "rechazado" });
    return null;
  }
  return sesion;
}

/** Contexto de las reglas de negocio para una acción del panel. */
export function contextoAdmin(sesion: SesionAdmin): Contexto {
  return { actor: sesion.actor, fecha: new Date().toISOString(), generarId: () => randomUUID() };
}
