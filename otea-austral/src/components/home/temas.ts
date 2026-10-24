import type { Tema } from "@/lib/domain/temas";

/** Qué cubre cada tema, en una línea. */
export const TEMA_DESCRIPCION: Record<Tema, string> = {
  energia: "Petróleo, gas y las rutas por donde se mueven.",
  chips: "Semiconductores, fábricas y controles de exportación.",
  cobre: "Oferta, demanda y el principal producto de exportación de Chile.",
  comercio_eeuu_china: "Aranceles, sanciones y cadenas de suministro.",
  divisas: "Tasas de interés, dólar y peso chileno.",
  geopolitica: "Conflictos y decisiones de Estado que cambian el riesgo.",
};

/** Lo mismo en pocas palabras, para los interruptores compactos de «Tu mañana». */
export const TEMA_BREVE: Record<Tema, string> = {
  energia: "Petróleo, gas y sus rutas",
  chips: "Semiconductores y controles",
  cobre: "Oferta, demanda y Chile",
  comercio_eeuu_china: "Aranceles y sanciones",
  divisas: "Tasas, dólar y peso",
  geopolitica: "Conflictos y decisiones",
};

type Direccion = "gana" | "condicionado" | "pierde";

/**
 * Un aviso de ejemplo de la vista previa «Tu mañana», como datos planos (el servidor lo deriva de las alertas de
 * ejemplo; el componente de cliente no carga Zod ni los esquemas).
 */
export type AvisoPrevia = {
  id: string;
  tema: Tema;
  evento: string;
  /** Instante ISO del dato (la hora real de la alerta de ejemplo). */
  instante: string;
  hora: string;
  dia: string;
  filas: { sector: string; direccion: Direccion }[];
};
