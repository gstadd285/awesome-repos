/**
 * Temas que vigila Otea. Módulo sin dependencias para poder usarlo también
 * en componentes de cliente (sin arrastrar Zod al navegador).
 */
export const TEMAS = [
  "energia",
  "chips",
  "cobre",
  "comercio_eeuu_china",
  "divisas",
  "geopolitica",
] as const;

export type Tema = (typeof TEMAS)[number];

export const TEMA_ETIQUETA: Record<Tema, string> = {
  energia: "Energía",
  chips: "Chips",
  cobre: "Cobre",
  comercio_eeuu_china: "Comercio EE.UU.–China",
  divisas: "Divisas",
  geopolitica: "Geopolítica",
};
