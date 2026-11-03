import type { ReactNode } from "react";
import { PageTransition } from "@/components/layout/PageTransition";

/**
 * Plantilla raíz: Next.js la vuelve a montar en cada navegación entre páginas (a diferencia del layout, que persiste).
 * Por eso aquí, y no dentro de cada página, la transición de página entra y sale de verdad.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
