type Variante = "primary" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-sm font-medium transition-[background-color,filter] duration-200";

const VARIANTES: Record<Variante, string> = {
  // Único acento cromático: latón con texto tinta (5,6:1).
  primary: "bg-brass text-ink hover:brightness-110",
  ghost: "bg-glass-fill text-ivory hairline hover:bg-glass-fill-strong",
};

/** Clases de botón en píldora, para `<a>` o `<button>`. */
export function buttonClasses(variante: Variante = "primary", extra = ""): string {
  return `${BASE} ${VARIANTES[variante]} ${extra}`.trim();
}
