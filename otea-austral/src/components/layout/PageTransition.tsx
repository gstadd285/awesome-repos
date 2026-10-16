import { ViewTransition, type ReactNode } from "react";

/**
 * Transición entre páginas (View Transitions API vía React `<ViewTransition>`). Vive en `src/app/template.tsx`, que
 * Next.js vuelve a montar en cada navegación: así la página que sale es un límite que se va (`exit`) y la que llega,
 * uno que entra (`enter`), y React llama a `document.startViewTransition`. Dentro de cada `page.tsx` no ocurría
 * nunca: la marca estática de «hay una transición aquí» no subía por el `<main>` que llega del servidor, así que el
 * segmento que se cambiaba no la llevaba y React no veía nada que entrara o saliera (0 llamadas medidas).
 *
 * La animación vive en `globals.css` (clase `otea-pagina`, solo con la puerta de movimiento abierta); la cabecera y el
 * subrayado de la página actual tienen nombre propio y no se funden con el contenido. Sin soporte del navegador, o con
 * movimiento reducido, la navegación es normal. El contenedor es una columna flexible que ocupa el alto restante del
 * `body`, para que el pie siga al fondo en las páginas cortas.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="otea-pagina" exit="otea-pagina" default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
