const INK = "#0F1B2D";
const IVORY = "#F3EEE3";
const BRASS = "#B08D57";

type EmblemProps = {
  /** `dark`: para fondo oscuro (anillo marfil). `light`: para fondo claro. */
  variant?: "dark" | "light";
  className?: string;
  /** Si se entrega, el emblema se anuncia como imagen; si no, es decorativo. */
  title?: string;
};

/**
 * Emblema anillo-lente. Geometría fija de la marca: no modificar.
 * En fondo oscuro se invierten anillo y línea (marfil) e interior (tinta).
 */
export function Emblem({ variant = "dark", className, title }: EmblemProps) {
  const ring = variant === "dark" ? IVORY : INK;
  const inner = variant === "dark" ? INK : IVORY;
  return (
    <svg
      viewBox="-90 -64 180 128"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle r="60" fill={ring} />
      <circle cx="4" cy="-4" r="50" fill={inner} />
      <line x1="-84" y1="10" x2="84" y2="10" stroke={ring} strokeWidth="3" />
      <circle cx="20" cy="-20" r="7" fill={BRASS} />
    </svg>
  );
}
