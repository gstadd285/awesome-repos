"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  borrarCookieSesion,
  contextoCuenta,
  cookieSesionActual,
  exigirAccionCuenta,
  fijarCookieSesion,
  sesionCuenta,
} from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";
import { qrParaEnlace } from "@/lib/cuentas/qr";
import type { Errores, SesionVigente } from "@/lib/cuentas/servicio";

/**
 * Server Actions de las cuentas. Cada una: valida en el borde (el servicio usa Zod), llama al servicio y traduce el
 * resultado a un texto para la persona. Las que cambian algo exigen sesión y el token anti-CSRF del formulario
 * (`exigirAccionCuenta`); las únicas que se ejecutan sin sesión son las que, por definición, la crean o la piden:
 * crear, activar, entrar, el segundo paso, olvidé y restablecer (la prueba de arquitectura lo vigila).
 *
 * Nada de lo que devuelven estas acciones lleva contraseñas ni códigos escritos: si un envío no prospera, solo se devuelve
 * lo que no es secreto (el correo, las casillas) para que React no vacíe el formulario.
 */
export type EstadoFormulario = {
  estado: "inicial" | "enviado" | "error";
  /** Aviso general, ya redactado para la persona. */
  mensaje?: string;
  errores?: Errores;
  valores?: Record<string, string | boolean | string[]>;
  /** Códigos de recuperación recién generados: se muestran una sola vez. */
  codigos?: string[];
  /** Secreto de la verificación en dos pasos que se está agregando a la app, con su código QR. */
  dosPasos?: { secreto: string; uri: string; qr: { ruta: string; lado: number } | null };
};

const TEXTO = {
  limite: "Demasiados intentos. Espera unos minutos antes de volver a probar.",
  // Al entrar, el bloqueo de una cuenta (por intentos ajenos, quizá) se levanta restableciendo la contraseña con el correo.
  limiteEntrar: "Demasiados intentos. Espera unos minutos antes de volver a probar o, si no recuerdas tu contraseña, restablécela con «¿Olvidaste tu contraseña?».",
  reintentar: "No pudimos completar la acción en este momento. Inténtalo de nuevo en unos minutos.",
  cerrada: "Las cuentas abren junto con el lanzamiento. Por ahora no guardamos datos: puedes unirte a la lista de espera.",
  saturada: "Hoy enviamos muchos correos y ya no podemos enviar más. Vuelve a intentarlo mañana.",
  espera: "Espera unos segundos y vuelve a enviar el formulario. Si sigue sin funcionar, recarga la página.",
  enlace: "El enlace venció, ya se usó o está incompleto. Pide uno nuevo.",
  // Solo lo ve quien abrió el enlace de su correo (ya probó que es suya la dirección): decirlo no revela nada nuevo.
  invitacion: "Tu invitación ya no vale: venció, se revocó o ya se usó para crear otra cuenta. Pide una nueva a quien te invitó.",
  csrf: "La página venció. Recárgala e inténtalo de nuevo.",
  rechazado: "El correo o la contraseña no son correctos.",
} as const;

const error = (mensaje: string, extra: Partial<EstadoFormulario> = {}): EstadoFormulario => ({ estado: "error", mensaje, ...extra });
const enviado = (mensaje: string, extra: Partial<EstadoFormulario> = {}): EstadoFormulario => ({ estado: "enviado", mensaje, ...extra });

/** Valor de texto de un campo, o `undefined` si no vino (los archivos no existen en estos formularios). */
const campo = (f: FormData, nombre: string): string | undefined => {
  const v = f.get(nombre);
  return typeof v === "string" ? v : undefined;
};

/** Lo que no se puede resolver con el resultado del servicio. */
function aviso(estado: "limite" | "reintentar" | "cerrada" | "saturada" | "espera" | "enlace" | "invitacion"): EstadoFormulario {
  return error(TEXTO[estado]);
}

/**
 * Adonde se va después de entrar. Solo rutas de la propia cuenta, de una lista cerrada: nunca una dirección que venga de
 * la solicitud (redirección abierta).
 */
const DESTINOS = new Set(["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]);
function destino(valor: string | undefined): string {
  return valor && DESTINOS.has(valor) ? valor : "/cuenta";
}

// ── Crear la cuenta ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function crearCuentaAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { claveCliente } = await contextoCuenta();
  const servicio = servicioCuentas();
  const r = await servicio.solicitarAlta(
    {
      correo: f.get("correo"),
      condiciones: f.get("condiciones"),
      privacidad: f.get("privacidad"),
      sitio_web: f.get("sitio_web"),
      tiempo: f.get("tiempo"),
      invitacion: f.get("invitacion"),
    },
    claveCliente,
  );
  if (r.estado === "ok") {
    // Con invitación, la misma respuesta sirva o no el código, y exista o no el correo (`docs/alertas-reales.md` §6).
    return enviado(
      r.prueba
        ? "Paso 1 de 2 listo. Modo de prueba: no enviamos correos; el enlace queda en el registro del servidor."
        : servicio.modo === "invitacion"
          ? "Paso 1 de 2 listo. Si el código de invitación y el correo son válidos, te llegará un mensaje con un enlace para elegir tu contraseña (vence en 72 horas). Si no llega, revisa el código con quien te invitó. Sin ese paso no se crea la cuenta."
          : "Paso 1 de 2 listo. Revisa tu correo: si es válido, te llegará un mensaje con un enlace para elegir tu contraseña (vence en 72 horas). Sin ese paso no se crea la cuenta.",
    );
  }
  // El código de invitación nunca vuelve al navegador (como las contraseñas): el formulario lo conserva por su cuenta.
  const correo = campo(f, "correo");
  const valores = { correo: (correo ?? "").slice(0, 254), condiciones: f.get("condiciones") === "on", privacidad: f.get("privacidad") === "on" };
  if (r.estado === "invalida") return error("Revisa los datos marcados.", { errores: r.errores, valores });
  return { ...aviso(r.estado), valores };
}

export async function activarCuentaAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoCuenta();
  const servicio = servicioCuentas();
  const r = await servicio.activar({ token: f.get("token"), clave: f.get("clave"), repetir: f.get("repetir") }, ctx);
  if (r.estado === "ok") {
    // Como al entrar: la sesión que hubiera en este navegador se cierra, para no dejar sesiones sueltas.
    await servicio.cerrarSesion(await cookieSesionActual());
    await fijarCookieSesion(r.sesion);
    redirect("/cuenta?aviso=bienvenida");
  }
  if (r.estado === "invalida") return error("Revisa los datos marcados.", { errores: r.errores });
  return aviso(r.estado);
}

// ── Entrar y salir ───────────────────────────────────────────────────────────────────────────────────────────────────

export async function entrarAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoCuenta();
  const servicio = servicioCuentas();
  const r = await servicio.entrar({ correo: f.get("correo"), clave: f.get("clave") }, ctx);
  const siguiente = destino(campo(f, "siguiente"));
  if (r.estado === "ok" || r.estado === "dos_pasos") {
    // Entrar de nuevo cierra la sesión que hubiera en este navegador, para no dejar sesiones sueltas.
    await servicio.cerrarSesion(await cookieSesionActual());
    await fijarCookieSesion(r.sesion);
    redirect(r.estado === "ok" ? siguiente : `/cuenta/verificar${siguiente === "/cuenta" ? "" : `?siguiente=${encodeURIComponent(siguiente)}`}`);
  }
  const correo = campo(f, "correo");
  const valores = { correo: (correo ?? "").slice(0, 254) };
  if (r.estado === "rechazado") return error(TEXTO.rechazado, { valores });
  if (r.estado === "limite") return error(TEXTO.limiteEntrar, { valores });
  return { ...aviso(r.estado), valores };
}

export async function verificarSegundoPasoAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoCuenta();
  const servicio = servicioCuentas();
  const token = await cookieSesionActual();
  const r = await servicio.segundoPaso({ token, codigo: f.get("codigo") }, ctx);
  if (r.estado === "ok") {
    await fijarCookieSesion(r.sesion);
    // Con un código de recuperación se va a la seguridad de la cuenta: ahí ve cuántos le quedan y puede pedir nuevos.
    redirect(r.codigosRestantes === null ? destino(campo(f, "siguiente")) : "/cuenta/seguridad?aviso=recuperacion");
  }
  if (r.estado === "sin_sesion") redirect("/cuenta/entrar?aviso=venció");
  if (r.estado === "invalido") return error("Revisa el código.", { errores: r.errores });
  if (r.estado === "rechazado") return error("El código no es correcto o ya se usó. Si no puedes usar tu app, prueba con un código de recuperación.");
  return aviso(r.estado);
}

/** «Salir»: revoca la sesión en la base (borrar la cookie del navegador no basta) y la borra del navegador. */
export async function salirAccion(f: FormData): Promise<void> {
  const sesion = await sesionCuenta();
  if (sesion && (await exigirAccionCuenta(f))) {
    await servicioCuentas().cerrarSesion(await cookieSesionActual());
    await borrarCookieSesion();
    redirect("/cuenta/entrar?aviso=salida");
  }
  redirect(sesion ? "/cuenta" : "/cuenta/entrar");
}

// ── Olvidé mi contraseña ─────────────────────────────────────────────────────────────────────────────────────────────

export async function olvideAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { claveCliente } = await contextoCuenta();
  const r = await servicioCuentas().solicitarRestablecer({ correo: f.get("correo"), sitio_web: f.get("sitio_web"), tiempo: f.get("tiempo") }, claveCliente);
  if (r.estado === "ok") {
    return enviado(
      r.prueba
        ? "Modo de prueba: no enviamos correos; el enlace queda en el registro del servidor."
        : "Listo. Si hay una cuenta con ese correo, te enviamos un mensaje con un enlace para elegir una contraseña nueva (vence en 1 hora y sirve una sola vez). Revisa también la carpeta de spam.",
    );
  }
  const valores = { correo: (campo(f, "correo") ?? "").slice(0, 254) };
  if (r.estado === "invalida") return error("Revisa los datos marcados.", { errores: r.errores, valores });
  return { ...aviso(r.estado), valores };
}

export async function restablecerAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoCuenta();
  const r = await servicioCuentas().restablecer({ token: f.get("token"), clave: f.get("clave"), repetir: f.get("repetir") }, ctx);
  if (r.estado === "ok") redirect("/cuenta/entrar?aviso=restablecida");
  if (r.estado === "invalida") return error("Revisa los datos marcados.", { errores: r.errores });
  return aviso(r.estado);
}

// ── Lo que se hace con la sesión iniciada ────────────────────────────────────────────────────────────────────────────

/** Sesión vigente y token anti-CSRF del formulario, o un estado de error listo para devolver. */
async function conSesion(f: FormData): Promise<{ sesion: SesionVigente } | { falla: EstadoFormulario }> {
  const sesion = await exigirAccionCuenta(f);
  return sesion ? { sesion } : { falla: error(TEXTO.csrf) };
}

/** Respuesta común de las acciones que piden la contraseña (y el código): errores por campo o un aviso. */
function noConfirmada(r: { estado: "invalida"; errores: Errores } | { estado: "limite" } | { estado: "reintentar" }): EstadoFormulario {
  return r.estado === "invalida" ? error("Revisa los datos marcados.", { errores: r.errores }) : aviso(r.estado);
}

export async function guardarPerfilAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const temas = f.getAll("temas").filter((t): t is string => typeof t === "string");
  const nombre = campo(f, "nombre") ?? "";
  const resumen = f.get("resumen") === "on";
  const r = await servicioCuentas().guardarPerfil(s.sesion.cuentaId, { nombre, temas, resumenPrevio: resumen });
  // Si no prospera, vuelve lo escrito; si prospera, vuelve lo guardado (ya normalizado), para que se vea qué quedó.
  if (r.estado === "invalida") return error("Revisa los datos marcados.", { errores: r.errores, valores: { nombre: nombre.slice(0, 200), temas, resumen } });
  revalidatePath("/cuenta");
  return enviado("Cambios guardados.", { valores: { nombre: r.guardado.nombre ?? "", temas: r.guardado.temas, resumen: r.guardado.resumenPrevio } });
}

/**
 * «Elige qué seguir» de la portada, con sesión: guarda solo los temas (validados contra `TEMAS` con Zod en el servicio). Los
 * usan /alertas («tus temas», con la opción de ver todas) y el resumen diario.
 */
export async function seguirTemasAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const temas = f.getAll("temas").filter((t): t is string => typeof t === "string").slice(0, 20);
  const r = await servicioCuentas().guardarTemas(s.sesion.cuentaId, temas);
  if (r.estado === "invalida") return error("Hay un tema que no existe. Recarga la página.", { errores: r.errores });
  revalidatePath("/cuenta");
  return enviado(r.temas.length > 0 ? "Tus temas quedaron guardados en tu cuenta." : "Guardado: sin temas elegidos, ves todos.", {
    valores: { temas: r.temas },
  });
}

export async function cambiarClaveAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const r = await servicioCuentas().cambiarClave(s.sesion, { actual: f.get("actual"), nueva: f.get("nueva"), repetir: f.get("repetir"), codigo: f.get("codigo") });
  if (r.estado !== "ok") return noConfirmada(r);
  revalidatePath("/cuenta/seguridad");
  return enviado("Contraseña cambiada. Cerramos tus demás sesiones y te enviamos un aviso por correo.");
}

export async function iniciarDosPasosAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const r = await servicioCuentas().iniciarDosPasos(s.sesion, { actual: f.get("actual") });
  if (r.estado === "ya_activa") {
    revalidatePath("/cuenta/seguridad");
    return enviado("La verificación en dos pasos ya está activada.");
  }
  if (r.estado !== "ok") return noConfirmada(r);
  return enviado("Agrega este secreto a tu app de autenticación y escribe el código de seis dígitos que muestre.", {
    dosPasos: { secreto: r.secreto, uri: r.uri, qr: qrParaEnlace(r.uri) },
  });
}

export async function confirmarDosPasosAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const r = await servicioCuentas().confirmarDosPasos(s.sesion, { codigo: f.get("codigo") });
  if (r.estado === "sin_pendiente") {
    revalidatePath("/cuenta/seguridad");
    return error("No hay una configuración en curso. Empieza de nuevo.");
  }
  if (r.estado !== "ok") return noConfirmada(r);
  revalidatePath("/cuenta/seguridad");
  return enviado("Verificación en dos pasos activada.", { codigos: r.codigos });
}

export async function desactivarDosPasosAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const r = await servicioCuentas().desactivarDosPasos(s.sesion, { actual: f.get("actual"), codigo: f.get("codigo") });
  if (r.estado !== "ok") return noConfirmada(r);
  revalidatePath("/cuenta/seguridad");
  return enviado("Verificación en dos pasos desactivada.");
}

export async function regenerarCodigosAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const r = await servicioCuentas().regenerarCodigos(s.sesion, { actual: f.get("actual"), codigo: f.get("codigo") });
  if (r.estado !== "ok") return noConfirmada(r);
  revalidatePath("/cuenta/seguridad");
  return enviado("Códigos nuevos listos. Los anteriores ya no sirven.", { codigos: r.codigos });
}

export async function cerrarOtrasSesionesAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const n = await servicioCuentas().cerrarOtrasSesiones(s.sesion);
  revalidatePath("/cuenta/seguridad");
  return enviado(n === 0 ? "No había otras sesiones abiertas." : n === 1 ? "Cerramos 1 sesión." : `Cerramos ${n} sesiones.`);
}

export async function cerrarSesionPorIdAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  const cerrada = await servicioCuentas().cerrarSesionPorId(s.sesion.cuentaId, f.get("id"));
  revalidatePath("/cuenta/seguridad");
  return cerrada ? enviado("Sesión cerrada.") : error("Esa sesión ya no estaba abierta.");
}

export async function eliminarCuentaAccion(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const s = await conSesion(f);
  if ("falla" in s) return s.falla;
  if (f.get("confirmar") !== "on") {
    return error("Revisa los datos marcados.", {
      errores: { condiciones: "Marca la casilla para confirmar que quieres eliminar tu cuenta." },
      valores: { confirmar: false },
    });
  }
  const r = await servicioCuentas().eliminar(s.sesion, { actual: f.get("actual"), codigo: f.get("codigo") });
  // Si la contraseña no era la correcta, la casilla sigue marcada: la persona ya dijo lo que quiere; solo falta la contraseña.
  if (r.estado !== "ok") return { ...noConfirmada(r), valores: { confirmar: true } };
  await borrarCookieSesion();
  redirect("/cuenta/eliminada");
}
