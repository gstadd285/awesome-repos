/**
 * Flecha del botón secundario (contorno): trazo de 1,5 px que avanza 3 px con el cursor encima (`boton-flecha`
 * en globals.css, con la puerta de movimiento); hacia abajo si lleva a otra sección de la misma página.
 * Decorativa: el nombre del enlace no cambia.
 */
export function Flecha({ direccion = "derecha" }: { direccion?: "derecha" | "abajo" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={direccion === "abajo" ? "boton-flecha boton-flecha-abajo" : "boton-flecha"}
    >
      <path d={direccion === "abajo" ? "M8 3v9.5M4 8.5l4 4 4-4" : "M3 8h9.5M8.5 4l4 4-4 4"} />
    </svg>
  );
}
