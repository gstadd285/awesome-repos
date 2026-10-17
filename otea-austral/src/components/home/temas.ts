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
