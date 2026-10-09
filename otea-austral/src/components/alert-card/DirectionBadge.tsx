import type { Direccion } from "@/lib/domain/schemas";
import { DIRECCION_ETIQUETA } from "./labels";

// Colores de estado: solo existen dentro de AlertCard.
const ESTILO: Record<Direccion, string> = {
  gana: "text-gana bg-gana/10",
  condicionado: "text-condicionado bg-condicionado/10",
  pierde: "text-pierde bg-pierde/10",
};

/** Dirección con ícono y texto; el color refuerza, no informa por sí solo. */
export function DirectionBadge({ direccion }: { direccion: Direccion }) {
  return (
    <span
      data-direccion={direccion}
      className={`inline-flex items-center gap-1.5 rounded-badge px-2 py-1 text-xs font-semibold ${ESTILO[direccion]}`}
    >
      <DirectionIcon direccion={direccion} />
      {DIRECCION_ETIQUETA[direccion]}
    </span>
  );
}

function DirectionIcon({ direccion }: { direccion: Direccion }) {
  const comunes = {
    viewBox: "0 0 12 12",
    className: "h-3 w-3",
    "aria-hidden": true,
    focusable: "false",
  } as const;
  if (direccion === "gana") {
    return (
      <svg {...comunes}>
        <path d="M6 1.5 11 10H1z" fill="currentColor" />
      </svg>
    );
  }
  if (direccion === "pierde") {
    return (
      <svg {...comunes}>
        <path d="M6 10.5 1 2h10z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...comunes}>
      <path d="M6 1 11 6 6 11 1 6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
