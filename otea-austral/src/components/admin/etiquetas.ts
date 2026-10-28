import type { AccionAuditoria, Confianza, EstadoAlerta, Impacto } from "@/lib/domain/schemas";
import { TEMA_ETIQUETA } from "@/lib/domain/temas";
import type { Senales, TemaEvento } from "@/lib/ingesta/agrupar";
import type { Bandera, MotivoDescarte, ResultadoIntento } from "@/lib/borradores/esquema";
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
  solicitado: "Borrador con IA pedido",
  borrador_descartado: "Borrador con IA descartado",
};

/** Qué significa cada bandera de un borrador con IA, para la dueña. */
export const BANDERA_ETIQUETA: Record<Bandera, string> = {
  lectura_parcial: "Un documento se leyó en parte (12.000 caracteres)",
  lectura_manual: "Algún documento no se pudo leer solo: léelo tú",
  sin_condicion: "Alguna condición no está en condicional",
  fuentes_sin_lectura: "Hay fuentes que la IA no vio (sin lectura con IA)",
  reintento: "Necesitó el reintento",
  posible_inyeccion: "El texto traía marcas de inyección de instrucciones",
};

export const MOTIVO_DESCARTE_ETIQUETA: Record<MotivoDescarte, string> = {
  irrelevante: "Irrelevante",
  duplicado: "Duplicado",
  impreciso: "Impreciso",
  copia: "Copia la fuente",
  otro: "Otro",
};

export const RESULTADO_INTENTO_ETIQUETA: Record<ResultadoIntento, string> = {
  borrador: "Dejó un borrador",
  lectura_manual: "Lectura manual (no se llamó al modelo)",
  rechazo: "El modelo se negó",
  revision: "No pasó la revisión (no se guardó)",
  error: "Falló el servicio",
};

/** Los motivos de la revisión, en palabras (los demás códigos se muestran tal cual). */
export const MOTIVO_INTENTO_ETIQUETA: Record<string, string> = {
  json: "JSON roto",
  esquema: "campos fuera del esquema",
  largo: "demasiado largo",
  enlace: "traía enlaces o correos",
  formato: "traía HTML o Markdown",
  lenguaje: "lenguaje de recomendación",
  cifra: "una cifra que no está en las fuentes",
  copia: "copiaba la fuente",
  reglas: "no pasa las reglas de la alerta",
  max_tokens: "se cortó por largo",
  posible_inyeccion: "marcas de inyección",
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
