import type { ReactNode } from "react";

/** Etiqueta de sección en mayúsculas, centrada, con líneas que se desvanecen. */
export function SectionEyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-4 ${className}`}>
      <span aria-hidden="true" className="fade-line-left h-px w-10 sm:w-24" />
      <span className="eyebrow">{children}</span>
      <span aria-hidden="true" className="fade-line-right h-px w-10 sm:w-24" />
    </p>
  );
}
