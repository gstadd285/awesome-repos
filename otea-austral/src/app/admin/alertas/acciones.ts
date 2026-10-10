"use server";

import { notFound, redirect } from "next/navigation";
import { contextoAdmin, exigirAccionAdmin, type SesionAdmin } from "@/lib/admin/acceso";
import {
  etiquetarMotivo,
  leerContenido,
  leerEnlace,
  leerNuevaAlerta,
  leerTexto,
  leerVersion,
} from "@/lib/alertas/formulario";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import type { Cambio, RepositorioAlertas } from "@/lib/alertas/repositorio";

export type EstadoAccion = { estado: "inicial" } | { estado: "error"; motivos: string[] };

/** Mensajes de éxito que muestra el detalle (claves fijas, nunca texto del usuario). */
export type Hecho =
  | "creada"
  | "revision"
  | "aprobada"
  | "publicada"
  | "editada"
  | "retractada"
  | "fuente-agregada"
  | "fuente-retirada";

const FORMULARIO_VENCIDO: EstadoAccion = {
  estado: "error",
  motivos: ["El formulario venció o no es válido. Recarga la página y vuelve a intentarlo."],
};

function repositorio(): RepositorioAlertas {
  const repo = repositorioAlertas();
  if (!repo) notFound();
  return repo;
}

/**
 * Esqueleto de toda acción del panel: sesión + CSRF, cambio en el
 * repositorio y, si sale bien, vuelta al detalle con un aviso.
 */
async function ejecutar(
  datos: FormData,
  hecho: Hecho,
  cambio: (repo: RepositorioAlertas, sesion: SesionAdmin) => Promise<Cambio>,
): Promise<EstadoAccion> {
  const sesion = await exigirAccionAdmin(datos);
  if (!sesion) return FORMULARIO_VENCIDO;
  const r = await cambio(repositorio(), sesion);
  if (!r.ok) return { estado: "error", motivos: r.motivos.map(etiquetarMotivo) };
  redirect(`/admin/alertas/${r.valor.id}?hecho=${hecho}`);
}

export async function crearAlertaAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "creada", async (repo, sesion) => {
    const nueva = leerNuevaAlerta(datos);
    return nueva.ok ? repo.crear(nueva.valor, contextoAdmin(sesion)) : nueva;
  });
}

export async function enviarARevisionAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "revision", (repo, sesion) =>
    repo.enviarARevision(leerTexto(datos, "id"), leerVersion(datos), contextoAdmin(sesion)),
  );
}

export async function aprobarAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "aprobada", (repo, sesion) =>
    repo.aprobar(leerTexto(datos, "id"), leerVersion(datos), contextoAdmin(sesion), leerTexto(datos, "nota")),
  );
}

export async function publicarAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "publicada", (repo, sesion) =>
    repo.publicar(leerTexto(datos, "id"), leerVersion(datos), contextoAdmin(sesion)),
  );
}

export async function editarAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "editada", async (repo, sesion) => {
    const contenido = leerContenido(datos);
    if (!contenido.ok) return contenido;
    return repo.editar(
      leerTexto(datos, "id"),
      leerVersion(datos),
      contenido.valor,
      contextoAdmin(sesion),
      leerTexto(datos, "texto_correccion") || undefined,
    );
  });
}

export async function retractarAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "retractada", (repo, sesion) =>
    repo.retractar(leerTexto(datos, "id"), leerVersion(datos), contextoAdmin(sesion), leerTexto(datos, "texto_publico")),
  );
}

export async function agregarFuenteAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "fuente-agregada", (repo, sesion) =>
    repo.agregarFuente(
      leerTexto(datos, "id"),
      leerVersion(datos),
      leerEnlace(datos),
      contextoAdmin(sesion),
      leerTexto(datos, "texto_correccion") || undefined,
    ),
  );
}

export async function retirarFuenteAccion(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  return ejecutar(datos, "fuente-retirada", (repo, sesion) =>
    repo.retirarFuente(
      leerTexto(datos, "id"),
      leerVersion(datos),
      leerTexto(datos, "enlace_id"),
      contextoAdmin(sesion),
      leerTexto(datos, "texto_correccion") || undefined,
    ),
  );
}
