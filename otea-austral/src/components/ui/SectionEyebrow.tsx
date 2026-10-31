import type { ReactNode } from "react";

/**
 * Rótulo de sección: un punto de latón (`.rotulo-punto::before`, sin nodo propio) y el nombre. Sin número: una
 * numeración solo tiene sentido cuando es una secuencia real (la historia de la portada, los apartados legales). Con
 * `numero` se usa como etiqueta técnica (por ejemplo «RFC 9116»).
 */
export function SectionEyebrow({
  numero,
  children,
  className = "",
  tono = "claro",
}: {
  numero?: string;
  children: ReactNode;
  className?: string;
  /** `tinta` para los capítulos sobre fondo tinta (texto niebla, 11:1). */
  tono?: "claro" | "tinta";
}) {
  return (
    <p className={`flex items-center gap-2.5 ${numero ? "" : "rotulo-punto "}${tono === "tinta" ? "text-niebla" : "text-apoyo"} ${className}`}>
      {numero ? (
        <>
          <span className="contador">{numero}</span>
          <span aria-hidden="true">—</span>
        </>
      ) : null}
      <span className="micro">{children}</span>
    </p>
  );
}
