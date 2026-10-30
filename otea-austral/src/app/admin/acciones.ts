"use server";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { almacenSesiones, exigirAccionAdmin } from "@/lib/admin/acceso";
import { verificarFrase } from "@/lib/admin/clave";
import { COOKIE_SESION, crearSesion, DURACION_SESION_MS, OPCIONES_COOKIE } from "@/lib/admin/sesion";
import { verificarTotp } from "@/lib/admin/totp";
import { env, panelActivo } from "@/lib/env";
import { ipCliente } from "@/lib/security/ip";
import { logSecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import { sha256Hex } from "@/lib/waitlist/service";

export type EstadoAcceso = { estado: "inicial" | "rechazado" | "limite" | "no_disponible" };

type Control = { porIp: FixedWindowLimiter; global: FixedWindowLimiter };
const memoria = globalThis as typeof globalThis & { __oteaAcceso?: Control };

/**
 * Límites por instancia: 5 intentos por IP y 100 en total cada 15 minutos
 * (con `maxScale` instancias, el tope real es ese número de veces mayor). Que
 * un código TOTP no se reutilice no depende de la memoria: lo garantiza la
 * base (`admin_codigos_usados`).
 */
function control(): Control {
  memoria.__oteaAcceso ??= {
    porIp: createFixedWindowLimiter({ limite: 5, ventanaMs: 15 * 60_000 }),
    global: createFixedWindowLimiter({ limite: 100, ventanaMs: 15 * 60_000 }),
  };
  return memoria.__oteaAcceso;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fallaDeBase = (codigo: string) =>
  logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo });

/**
 * Acceso al panel con dos factores: frase (hash PBKDF2-SHA256 de 600 000
 * iteraciones) y código TOTP. La respuesta no dice cuál falló.
 */
export async function iniciarSesion(_previo: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  if (!panelActivo() || !env.ADMIN_CLAVE_HASH || !env.ADMIN_TOTP_SECRETO || !env.ADMIN_SESION_SECRETO) notFound();
  const c = control();
  const ip = ipCliente(await headers(), env.IP_PROXIES_CONFIABLES);
  if (!c.porIp.tryConsume(await sha256Hex(ip)) || !c.global.tryConsume()) {
    logSecurityEvent({ tipo: "acceso_admin", resultado: "limite" });
    return { estado: "limite" };
  }

  const frase = datos.get("frase");
  const codigo = String(datos.get("codigo") ?? "").replace(/\s+/g, "").slice(0, 12);
  const paso = verificarTotp(env.ADMIN_TOTP_SECRETO, codigo, Date.now());
  const almacen = almacenSesiones();

  // El código se gasta en la base (una sola vez, valga para todas las instancias) aunque la frase falle.
  let utilizable = false;
  if (paso !== null && typeof frase === "string" && frase.length <= 256) {
    try {
      utilizable = await almacen.gastarCodigo(paso);
    } catch {
      fallaDeBase("acceso_admin");
      return { estado: "no_disponible" };
    }
  }
  let correcto = false;
  if (utilizable && typeof frase === "string") {
    correcto = await verificarFrase(frase, env.ADMIN_CLAVE_HASH);
  } else {
    // Sin un código válido y nuevo no se gasta CPU en PBKDF2, pero se espera un tiempo parecido.
    await esperar(300 + Math.random() * 200);
  }
  if (!correcto) {
    logSecurityEvent({ tipo: "acceso_admin", resultado: "rechazado" });
    return { estado: "rechazado" };
  }

  const { valor, sesion } = crearSesion(env.ADMIN_SESION_SECRETO, Date.now());
  try {
    await almacen.crear(sesion.sid, new Date(sesion.exp));
  } catch {
    fallaDeBase("sesion_admin");
    return { estado: "no_disponible" };
  }
  (await cookies()).set(COOKIE_SESION, valor, { ...OPCIONES_COOKIE, maxAge: DURACION_SESION_MS / 1000 });
  logSecurityEvent({ tipo: "acceso_admin", resultado: "correcto" });
  redirect("/admin/alertas");
}

export async function cerrarSesion(datos: FormData): Promise<void> {
  const sesion = await exigirAccionAdmin(datos);
  if (sesion) {
    // Revocar en la base es lo que invalida la cookie; borrarla del navegador no basta.
    await almacenSesiones()
      .revocar(sesion.sid)
      .catch(() => fallaDeBase("cierre_admin"));
    (await cookies()).set(COOKIE_SESION, "", { ...OPCIONES_COOKIE, maxAge: 0 });
    logSecurityEvent({ tipo: "acceso_admin", resultado: "cierre" });
  }
  redirect("/admin");
}
