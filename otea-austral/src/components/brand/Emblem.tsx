const INK = "#0F1B2D";
const IVORY = "#F3EEE3";
const BRASS = "#B08D57";
/** Tinta al 8 % sobre `papel-alto`, ya resuelta (el sello de los textos legales) y su sombra de relieve. */
const RELIEVE = "#E9E8E6";
const RELIEVE_SOMBRA = "#DCDBD8";
const PAPEL_ALTO = "#FCFAF6";

/** Colores de cada variante: anillo y línea, interior y sol. La geometría es la misma en todas. */
const COLORES = {
  dark: [IVORY, INK, BRASS],
  light: [INK, IVORY, BRASS],
  relieve: [RELIEVE, PAPEL_ALTO, RELIEVE],
  "relieve-sombra": [RELIEVE_SOMBRA, RELIEVE_SOMBRA, RELIEVE_SOMBRA],
} as const;

type EmblemProps = {
  /**
   * `dark`: para fondo oscuro (anillo marfil). `light`: para fondo claro. `relieve` y `relieve-sombra`: monocromos, en
   * tinta al 8 % sobre porcelana y su sombra (el sello de los textos legales); solo cambian los colores.
   */
  variant?: keyof typeof COLORES;
  className?: string;
  /** Si se entrega, el emblema se anuncia como imagen; si no, es decorativo. */
  title?: string;
  /** Posición y tamaño dentro de otro SVG (el sello): solo colocan el emblema, no tocan su geometría. */
  x?: number;
  y?: number;
  width?: number;
};

/**
 * Emblema anillo-lente. Geometría fija de la marca: no modificar.
 * En fondo oscuro se invierten anillo y línea (marfil) e interior (tinta).
 */
export function Emblem({ variant = "dark", className, title, x, y, width }: EmblemProps) {
  const [ring, inner, sun] = COLORES[variant];
  return (
    <svg
      viewBox="-90 -64 180 128"
      xmlns="http://www.w3.org/2000/svg"
      x={x}
      y={y}
      width={width}
      height={width === undefined ? undefined : (width * 128) / 180}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle r="60" fill={ring} />
      <circle cx="4" cy="-4" r="50" fill={inner} />
      <line x1="-84" y1="10" x2="84" y2="10" stroke={ring} strokeWidth="3" />
      <circle cx="20" cy="-20" r="7" fill={sun} />
    </svg>
  );
}
