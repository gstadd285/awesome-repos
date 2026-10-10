type Variante = "primary" | "outline" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 micro transition-[background-color,box-shadow,scale] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97]";

const VARIANTES: Record<Variante, string> = {
  // Único acento: latón con texto tinta (5,6:1).
  primary: "bg-acento text-ink shadow-[0_10px_24px_-12px_rgb(122_94_51/0.8)] hover:brightness-105",
  // Píldora con borde fino, como "HOW IT WORKS" en la referencia.
  outline: "text-texto shadow-[inset_0_0_0_1px_var(--color-linea-fuerte)] hover:bg-papel-alto",
  ghost: "bg-papel-alto text-texto linea-fina hover:bg-papel",
};

/** Clases de botón en píldora, para `<a>` o `<button>`. */
export function buttonClasses(variante: Variante = "primary", extra = ""): string {
  return `${BASE} ${VARIANTES[variante]} ${extra}`.trim();
}
