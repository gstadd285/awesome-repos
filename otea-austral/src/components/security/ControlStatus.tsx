import type { EstadoControl } from "@/lib/security/nist-csf";

const ETIQUETA: Record<EstadoControl, string> = {
  implementado: "Implementado",
  parcial: "Parcial",
  objetivo: "Objetivo",
};

/** Estado de un control con texto y forma (círculo lleno, medio o vacío), sin color. */
export function ControlStatus({ estado, tercio }: { estado: EstadoControl; tercio?: 2 | 3 }) {
  return (
    <span
      data-estado={estado}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-badge bg-fondo px-2 py-1 text-xs font-medium text-texto linea-fina"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="h-3 w-3">
        <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {estado === "implementado" ? <circle cx="6" cy="6" r="4.75" fill="currentColor" /> : null}
        {estado === "parcial" ? <path d="M6 1.25a4.75 4.75 0 0 1 0 9.5z" fill="currentColor" /> : null}
      </svg>
      {ETIQUETA[estado]}
      {tercio && estado !== "implementado" ? ` · tercio ${tercio}` : null}
    </span>
  );
}
