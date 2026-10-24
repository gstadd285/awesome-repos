import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { baseDeDatos } from "@/lib/db/instancia";
import type { Contexto } from "@/lib/domain/rules";
import { env, panelActivo } from "@/lib/env";
import { logSecurityEvent } from "@/lib/security/log";
import { crearAlmacenSesiones, type AlmacenSesiones } from "./almacen";
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

/** Sesiones y códigos TOTP gastados, en la base. Sin base el panel no existe (404). */
export function almacenSesiones(): AlmacenSesiones {
  const db = baseDeDatos();
  if (!db) notFound();
  return crearAlmacenSesiones(db);
}

/**
 * Sesión vigente o `null`. Si el panel no está configurado, responde 404.
 *
 * La firma de la cookie se comprueba primero (barato, descarta falsificaciones
 * sin tocar la base) y luego la base decide si la sesión sigue vigente: cerrar
 * sesión la revoca de verdad. Si la base no responde, no hay sesión (falla
 * cerrado). `cache` evita repetir la consulta entre el layout y la página de
 * una misma solicitud.
 */
export const sesionActual = cache(async (): Promise<SesionAdmin | null> => {
  const secreto = secretoSesion();
  const sesion = leerSesion(secreto, (await cookies()).get(COOKIE_SESION)?.value, Date.now());
  if (!sesion) return null;
  try {
    if (!(await almacenSesiones().vigente(sesion.sid))) return null;
  } catch {
    logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "sesion_admin" });
    return null;
  }
  return { actor: env.ADMIN_ALIAS, sid: sesion.sid, csrf: tokenCsrf(secreto, sesion.sid) };
});

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
