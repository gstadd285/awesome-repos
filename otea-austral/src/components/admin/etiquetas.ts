import type { AccionAuditoria, EstadoAlerta, Impacto } from "@/lib/domain/schemas";

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
