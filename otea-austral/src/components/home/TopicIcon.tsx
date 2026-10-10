import type { ReactNode } from "react";
import type { Tema } from "@/lib/domain/temas";

// Íconos de línea (trazo 1,5), monocromos, uno por tema.
const TRAZOS: Record<Tema, ReactNode> = {
  // Energía: llama.
  energia: (
    <path d="M12 3.5c1.6 2.7 5 5 5 9.2a5 5 0 0 1-10 0c0-2 .9-3.6 2.1-4.7.1 1.6.8 2.6 2 3.1-.3-2.8.2-5.1.9-7.6z" />
  ),
  // Chips: circuito integrado.
  chips: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" rx=".5" />
      <path d="M9.5 3.5v3.5M14.5 3.5v3.5M9.5 17v3.5M14.5 17v3.5M3.5 9.5H7M3.5 14.5H7M17 9.5h3.5M17 14.5h3.5" />
    </>
  ),
  // Cobre: lingote.
  cobre: (
    <>
      <path d="M3.5 16.5 7 9h10l3.5 7.5z" />
      <path d="M7 9l2-3.5h6L17 9M3.5 16.5h17" />
    </>
  ),
  // Comercio EE.UU.–China: intercambio.
  comercio_eeuu_china: (
    <>
      <path d="M4 8.5h14.5M15 5l3.5 3.5L15 12" />
      <path d="M20 15.5H5.5M9 12l-3.5 3.5L9 19" />
    </>
  ),
  // Divisas: dos monedas.
  divisas: (
    <>
      <circle cx="9.5" cy="9.5" r="5.5" />
      <path d="M14.8 8.2a5.5 5.5 0 1 1-6.6 6.6" />
    </>
  ),
  // Geopolítica: globo.
  geopolitica: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5S14.4 18.1 12 20.5C9.6 18.1 8.4 15.3 8.4 12S9.6 5.9 12 3.5z" />
    </>
  ),
};

export function TopicIcon({ tema, className = "h-6 w-6" }: { tema: Tema; className?: string }) {
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
      {TRAZOS[tema]}
    </svg>
  );
}
