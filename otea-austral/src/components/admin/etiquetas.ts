import type { AccionAuditoria, Confianza, EstadoAlerta, Impacto } from "@/lib/domain/schemas";
import { TEMA_ETIQUETA } from "@/lib/domain/temas";
import type { Senales, TemaEvento } from "@/lib/ingesta/agrupar";
import type { EstadoEvento, FilaAuditoriaEvento } from "@/lib/ingesta/cola-postgres";
import { etiquetaAgenda } from "@/lib/ingesta/lexico";

export const ESTADO_ETIQUETA: Record<EstadoAlerta, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  publicada: "Publicada",
  corregida: "Corregida",
  retractada: "Retractada",
};

export const IMPACTO_ETIQUETA: Record<Impacto, string> = {
  bajo: "Impacto bajo",
  medio: "Impacto medio",
  alto: "Impacto alto",
};

export const ACCION_ETIQUETA: Record<AccionAuditoria, string> = {
  creada: "Creada",
  editada: "Editada",
  aprobada: "Aprobada",
  publicada: "Publicada",
  corregida: "Corregida",
  retractada: "Retractada",
};

export const ESTADO_EVENTO_ETIQUETA: Record<EstadoEvento, string> = {
  abierto: "Abierto",
  solicitado: "Borrador solicitado",
  con_borrador: "Con borrador",
  descartado: "Descartado",
  convertido: "Convertido en alerta",
};

export const ACCION_EVENTO_ETIQUETA: Record<FilaAuditoriaEvento["accion"], string> = {
  descartado: "Descartado",
  convertido: "Convertido en alerta",
};

export const CONFIANZA_POSIBLE_ETIQUETA: Record<Confianza, string> = { baja: "Baja", media: "Media", alta: "Alta" };

export function temaEventoEtiqueta(tema: TemaEvento): string {
  return tema === "sin_tema" ? "Sin tema claro" : TEMA_ETIQUETA[tema];
}

/** Las señales simples que explican el puntaje de un evento, en palabras. */
export function describirSenales(s: Senales, claveAgenda: string | null): string[] {
  return [
    s.organismos === 1 ? "1 organismo" : `${s.organismos} organismos distintos`,
    ...(s.decision ? ["palabras de decisión"] : []),
    ...(s.prioridad ? [`prioridad ${s.prioridad}`] : []),
    ...(claveAgenda ? [`agenda: ${etiquetaAgenda(claveAgenda)}`] : []),
    ...(s.reciente ? ["ítem de las últimas 6 h"] : []),
  ];
}
