"use server";

import { notFound, redirect } from "next/navigation";
import type { EstadoAccion } from "@/app/admin/alertas/acciones";
import { contextoAdmin, exigirAccionAdmin } from "@/lib/admin/acceso";
import { etiquetarMotivo, leerNuevaAlerta, leerTexto } from "@/lib/alertas/formulario";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import { colaEventos } from "@/lib/ingesta/cola";
import { MAX_FUENTES_POR_ALERTA } from "@/lib/ingesta/cola-postgres";

/**
 * Acciones de la cola de eventos candidatos (`docs/alertas-reales.md` §5). Todas pasan primero por `exigirAccionAdmin`
 * (sesión + token CSRF), validan el formulario y dejan su fila en la auditoría de solo agregar (`evento_auditoria` y, al
 * crear, la de la alerta). Ninguna publica nada ni llama a un modelo: aceptar un borrador con IA crea la alerta en
 * borrador por `rules.ts` (con lo que la dueña editó), y pedir uno solo marca el evento para la próxima corrida de
 * `otea-tareas`.
 */

const FORMULARIO_VENCIDO: EstadoAccion = {
  estado: "error",
  motivos: ["El formulario venció o no es válido. Recarga la página y vuelve a intentarlo."],
};

function servicios() {
  const cola = colaEventos();
  const alertas = repositorioAlertas();
  if (!cola || !alertas) notFound();
  return { cola, alertas };
}

/** Ids de los ítems marcados (solo texto, sin repetir y con un tope: el repositorio vuelve a comprobarlos). */
function leerItems(datos: FormData): string[] {
  const ids = datos
    .getAll("item")
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, 36));
  return [...new Set(ids)].slice(0, MAX_FUENTES_POR_ALERTA + 1);
}

export async function descartarEventoAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const { cola } = servicios();
  const r = await cola.descartar(leerTexto(datos, "evento_id"), contextoAdmin(sesion), leerTexto(datos, "nota"));
  if (!r.ok) return { estado: "error", motivos: r.motivos };
  redirect("/admin/eventos?hecho=descartado");
}

/**
 * Acepta el borrador con IA de un evento: con lo que la dueña dejó en el formulario (editado o no) crea, en una
 * transacción, la alerta en borrador (`rules.ts`, actor = alias del panel, nota «Desde borrador …»), sus fuentes y el
 * borrador `aceptado`, y el evento queda convertido. Después sigue el flujo de siempre: revisión, aprobación y publicación.
 */
export async function aceptarBorradorAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const { cola, alertas } = servicios();
  const nueva = leerNuevaAlerta(datos);
  if (!nueva.ok) return { estado: "error", motivos: nueva.motivos };
  const borradorId = leerTexto(datos, "borrador_id").slice(0, 36);
  const r = await cola.crearAlerta(alertas, leerTexto(datos, "evento_id"), nueva.valor, leerItems(datos), contextoAdmin(sesion), {
    borradorId,
  });
  if (!r.ok) return { estado: "error", motivos: r.motivos.map(etiquetarMotivo) };
  redirect(`/admin/alertas/${r.valor.id}?hecho=desde-borrador`);
}

/** Descarta el borrador con IA de un evento, con un motivo obligatorio (para calibrar); el evento sigue en la cola. */
export async function descartarBorradorAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const { cola } = servicios();
  const r = await cola.descartarBorrador(
    leerTexto(datos, "borrador_id").slice(0, 36),
    leerTexto(datos, "motivo").slice(0, 20),
    leerTexto(datos, "nota"),
    contextoAdmin(sesion),
  );
  if (!r.ok) return { estado: "error", motivos: r.motivos };
  redirect(`/admin/eventos/${r.valor.eventoId}?hecho=borrador-descartado`);
}

/**
 * Pide un borrador con IA para un evento abierto (p. ej. bajo el umbral). Lo redacta la próxima corrida de `otea-tareas`
 * si allí la IA está activa; el sitio público no tiene la clave. Cuenta para el tope mensual.
 */
export async function pedirBorradorAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const { cola } = servicios();
  const r = await cola.pedirBorrador(leerTexto(datos, "evento_id").slice(0, 36), contextoAdmin(sesion), new Date());
  if (!r.ok) return { estado: "error", motivos: r.motivos };
  redirect(`/admin/eventos/${r.valor.id}?hecho=borrador-pedido`);
}

/** Alerta manual desde un evento: nace en borrador, **no es de ejemplo** y lleva enlazadas las fuentes elegidas. */
export async function crearAlertaDesdeEventoAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const { cola, alertas } = servicios();
  const nueva = leerNuevaAlerta(datos);
  if (!nueva.ok) return { estado: "error", motivos: nueva.motivos };
  // La casilla «Datos de ejemplo» no existe en este formulario y, si alguien la envía, no cuenta: `crearAlerta` fija
  // `es_ejemplo: false`.
  const r = await cola.crearAlerta(alertas, leerTexto(datos, "evento_id"), nueva.valor, leerItems(datos), contextoAdmin(sesion));
  if (!r.ok) return { estado: "error", motivos: r.motivos.map(etiquetarMotivo) };
  redirect(`/admin/alertas/${r.valor.id}?hecho=desde-evento`);
}
