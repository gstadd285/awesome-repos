import type { ReactNode } from "react";

/**
 * Rótulo de sección al estilo técnico: número de sección y nombre, con una
 * línea fina que se extiende a la derecha. `001 — Temas`.
 */
export function SectionEyebrow({
  numero,
  children,
  className = "",
}: {
  numero?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-3 text-apoyo ${className}`}>
      {numero ? <span className="contador">{numero}</span> : null}
      {numero ? <span aria-hidden="true">—</span> : null}
      <span className="micro">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-linea" />
    </p>
  );
}
