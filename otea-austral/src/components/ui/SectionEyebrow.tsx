import type { ReactNode } from "react";

/**
 * Rótulo de sección: un punto de latón y el nombre. Sin número: una numeración solo tiene sentido
 * cuando es una secuencia real (la historia de la portada, los apartados legales). Con `numero` se
 * usa como etiqueta técnica (por ejemplo «RFC 9116»).
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
    <p className={`flex items-center gap-2.5 text-apoyo ${className}`}>
      {numero ? (
        <>
          <span className="contador">{numero}</span>
          <span aria-hidden="true">—</span>
        </>
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-acento" />
      )}
      <span className="micro">{children}</span>
    </p>
  );
}
