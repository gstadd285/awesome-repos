type Variante = "primary" | "outline" | "ghost";
type Tamano = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-[background-color,box-shadow,scale] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97]";

const TAMANOS: Record<Tamano, string> = {
  // 14 px con 12 px de relleno vertical: 44 px de alto, un objetivo táctil cómodo.
  md: "px-6 py-3 text-sm",
  sm: "px-4 py-2 text-sm",
};

const VARIANTES: Record<Variante, string> = {
  // Único acento: latón con texto tinta (5,6:1).
  primary: "bg-acento text-ink shadow-[0_10px_24px_-12px_rgb(122_94_51/0.8)] hover:brightness-105",
  // Píldora con borde fino.
  outline: "text-texto shadow-[inset_0_0_0_1px_var(--color-linea-fuerte)] hover:bg-papel-alto",
  ghost: "bg-papel-alto text-texto linea-fina hover:bg-papel",
};

/** Clases de botón en píldora, para `<a>` o `<button>`. */
export function buttonClasses(variante: Variante = "primary", extra = "", tamano: Tamano = "md"): string {
  return `${BASE} ${TAMANOS[tamano]} ${VARIANTES[variante]} ${extra}`.trim();
}
