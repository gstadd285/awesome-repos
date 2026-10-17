import type { ReactNode } from "react";
import type { CodigoFuncion } from "@/lib/security/nist-csf";

// Íconos de línea (trazo 1,5), monocromos, para las seis funciones del CSF.
const TRAZOS: Record<CodigoFuncion, ReactNode> = {
  // Gobernar: brújula.
  GV: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </>
  ),
  // Identificar: lupa.
  ID: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  // Proteger: escudo.
  PR: (
    <>
      <path d="M12 3.5 5.5 6v5.2c0 4.1 2.7 7.5 6.5 9.3 3.8-1.8 6.5-5.2 6.5-9.3V6z" />
      <path d="m9.2 12.2 2 2 3.8-4" />
    </>
  ),
  // Detectar: ojo.
  DE: (
    <>
      <path d="M2.8 12S6.2 6 12 6s9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  // Responder: campana.
  RS: (
    <>
      <path d="M6.5 15.5V11a5.5 5.5 0 0 1 11 0v4.5l1.5 2h-14z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  // Recuperar: flecha circular.
  RC: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
      <path d="M4.5 4.5V8H8" />
    </>
  ),
};

export function FunctionIcon({ codigo, className = "h-6 w-6" }: { codigo: CodigoFuncion; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRAZOS[codigo]}
    </svg>
  );
}
