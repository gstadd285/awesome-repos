"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { EstadoAccion } from "@/app/admin/alertas/acciones";
import { exigirAccionAdmin } from "@/lib/admin/acceso";
import { servicioInvitaciones } from "@/lib/cuentas/instancia";
import { formatearFechaHora } from "@/lib/format";

/**
 * Acciones de las invitaciones del acceso anticipado (`docs/alertas-reales.md` §6). Las dos pasan primero por
 * `exigirAccionAdmin` (sesión del panel + token CSRF), validan el formulario y dejan su fila en `invitacion_auditoria`
 * (solo agregar). El código emitido vuelve **una sola vez**, en la respuesta de la acción: la base guarda solo su HMAC.
 */
export type EstadoInvitacion =
  | { estado: "inicial" }
  | { estado: "error"; motivos: string[] }
  | { estado: "emitida"; codigo: string; alias: string; vence: string };

const VENCIDO = ["El formulario venció o no es válido. Recarga la página y vuelve a intentarlo."];

/** Sin la base o sin `CUENTAS_SECRETO` no hay invitaciones (un código no serviría en otra instancia): 404. */
function servicio() {
  const s = servicioInvitaciones();
  if (!s) notFound();
  return s;
}

export async function emitirInvitacionAccion(_previo: EstadoInvitacion, datos: FormData): Promise<EstadoInvitacion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return { estado: "error", motivos: VENCIDO };
  const r = await servicio().emitir({ alias: datos.get("alias"), dias: datos.get("dias") }, sesion.actor);
  if (!r.ok) return { estado: "error", motivos: r.motivos };
  revalidatePath("/admin/invitaciones");
  return { estado: "emitida", codigo: r.codigo, alias: r.alias, vence: formatearFechaHora(r.vence) };
}

export async function revocarInvitacionAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return { estado: "error", motivos: VENCIDO };
  const r = await servicio().revocar(datos.get("id"), sesion.actor);
  if (!r.ok) return { estado: "error", motivos: r.motivos };
  redirect("/admin/invitaciones?hecho=revocada");
}
