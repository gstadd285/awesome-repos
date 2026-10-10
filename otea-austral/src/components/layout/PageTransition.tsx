import { ViewTransition, type ReactNode } from "react";

/**
 * Transición suave entre páginas (View Transitions API vía React). La
 * animación vive en `globals.css` (clase `otea-pagina`) y se desactiva con
 * `prefers-reduced-motion`. Sin soporte del navegador, la navegación es normal.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="otea-pagina" exit="otea-pagina" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
