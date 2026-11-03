type Variante = "primary" | "outline" | "ghost";
type Tamano = "md" | "sm";

// Forma y respuesta común. Las transiciones (`suave`, en globals.css) usan los tokens de movimiento y solo existen con la
// puerta abierta; el pulsado (`active:scale`) responde en todos los modos. El latón trae sus propias transiciones
// (resorte, brillo y destello) en globals.css. Solo los `<button>` impiden seleccionar su texto (pulsar varias
// veces no pinta selección); los enlaces con forma de botón se pueden seleccionar y copiar.
const BASE =
  "inline-flex [&:is(button)]:select-none items-center justify-center gap-2 rounded-pill font-medium active:scale-[0.97] suave";

const TAMANOS: Record<Tamano, string> = {
  // 14 px con 12 px de relleno vertical: 44 px de alto, un objetivo táctil cómodo.
  md: "px-6 py-3 text-sm",
  sm: "px-4 py-2 text-sm",
};

const VARIANTES: Record<Variante, string> = {
  // Único acento: latón como material, con texto tinta (≥ 4,9:1 en todo el degradado). Ver `boton-laton`.
  primary: "boton-laton",
  // Píldora con borde fino; el halo del foco va en la misma sombra (utilidades `filete-*` de globals.css).
  outline: "text-texto filete-fuerte hover:bg-papel-alto hover:filete-tinta",
  ghost: "bg-papel-alto text-texto linea-fina hover:bg-papel",
};

/** Clases de botón en píldora, para `<a>` o `<button>`. */
export function buttonClasses(variante: Variante = "primary", extra = "", tamano: Tamano = "md"): string {
  return `${BASE} ${TAMANOS[tamano]} ${VARIANTES[variante]} ${extra}`.trim();
}
