import type { Confianza } from "@/lib/domain/schemas";
import { CONFIANZA_ETIQUETA } from "./labels";

const BARRAS: Record<Confianza, number> = { baja: 1, media: 2, alta: 3 };

/**
 * Insignia de confianza. Se distingue por texto y por forma (barras llenas),
 * nunca solo por color.
 */
export function ConfidenceBadge({ nivel }: { nivel: Confianza }) {
  const llenas = BARRAS[nivel];
  return (
    <span
      data-confianza={nivel}
      className="inline-flex items-center gap-1.5 rounded-badge bg-fondo px-2 py-1 text-xs font-medium text-texto linea-fina"
    >
      <svg
        viewBox="0 0 15 12"
        aria-hidden="true"
        focusable="false"
        className="h-3 w-[15px]"
        data-barras-llenas={llenas}
      >
        {[0, 1, 2].map((i) => {
          const alto = 4 + i * 4;
          const llena = i < llenas;
          return (
            <rect
              key={i}
              x={i * 5 + 0.5}
              y={12 - alto + 0.5}
              width="3.5"
              height={alto - 1}
              rx="0.75"
              fill={llena ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1"
            />
          );
        })}
      </svg>
      Confianza {CONFIANZA_ETIQUETA[nivel]}
    </span>
  );
}
