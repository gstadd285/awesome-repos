import type { Confianza, Direccion, NivelVerificacion, TipoFuente } from "@/lib/domain/schemas";

export const DIRECCION_ETIQUETA: Record<Direccion, string> = {
  gana: "Gana",
  condicionado: "Condicionado",
  pierde: "Pierde",
};

export const CONFIANZA_ETIQUETA: Record<Confianza, string> = {
  baja: "baja",
  media: "media",
  alta: "alta",
};

export const VERIFICACION_ETIQUETA: Record<NivelVerificacion, string> = {
  sin_verificar: "Sin verificar",
  una_fuente: "Una fuente",
  dos_fuentes: "Dos fuentes independientes",
  fuente_oficial: "Fuente oficial",
};

export const TIPO_FUENTE_ETIQUETA: Record<TipoFuente, string> = {
  primaria: "Fuente primaria",
  secundaria: "Fuente secundaria",
  prensa: "Prensa",
};
