"use client";

import { useEffect, useState, useSyncExternalStore, ViewTransition, type ReactNode } from "react";

/**
 * La primera plantilla ya hidrató: las siguientes se montan en el cliente, al navegar. Solo la escribe un efecto y
 * solo se lee al montar (en el inicializador de `useState`), así que cada plantilla decide una vez.
 */
let hidratada = false;

const raiz = () => document.documentElement;
const puertaAbierta = () => raiz().dataset.movimiento === "completo";
const enServidor = () => false;

function vigilarPuerta(aviso: () => void) {
  const vigilante = new MutationObserver(aviso);
  vigilante.observe(raiz(), { attributes: true, attributeFilter: ["data-movimiento"] });
  return () => vigilante.disconnect();
}

/**
 * Transición entre páginas (View Transitions API vía React `<ViewTransition>`). Vive en `src/app/template.tsx`, que
 * Next.js vuelve a montar en cada navegación: así la página que sale es un límite que se va (`exit`) y la que llega,
 * uno que entra (`enter`), y React llama a `document.startViewTransition`. Dentro de cada `page.tsx` no ocurría
 * nunca: la marca estática de «hay una transición aquí» no subía por el `<main>` que llega del servidor, así que el
 * segmento que se cambiaba no la llevaba y React no veía nada que entrara o saliera (0 llamadas medidas).
 *
 * **Con la puerta cerrada no se inicia ninguna transición.** React llama a `startViewTransition` siempre que entra un
 * `<ViewTransition>`, aunque su clase sea `none`; y en la portada, con movimiento reducido, Chromium no llegaba a
 * capturar la página vieja y abortaba a los ~4,4 s (el clic «no hacía nada» todo ese tiempo). Por eso:
 * - la plantilla que se monta al navegar con la puerta cerrada no lleva el límite (solo el contenedor);
 * - la que llegó del servidor lo lleva siempre (si no, la hidratación rehace la página), pero su salida es `none`
 *   mientras la puerta esté cerrada: así ninguna de las dos le pide nada a React.
 * Cambiar la puerta con el conmutador no rehace la página abierta: solo cambia la clase de su salida.
 *
 * La animación vive en `globals.css` (clase `otea-pagina`, solo con la puerta de movimiento abierta); la cabecera, el
 * logo, las acciones y el subrayado de la página actual tienen nombre propio y no se funden con el contenido. El
 * contenedor es una columna flexible que ocupa el alto restante del `body`, para que el pie siga al fondo en las
 * páginas cortas.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const [conLimite] = useState(() => !hidratada || puertaAbierta());
  const abierta = useSyncExternalStore(vigilarPuerta, puertaAbierta, enServidor);

  useEffect(() => {
    hidratada = true;
  }, []);

  const contenido = <div className="flex flex-1 flex-col">{children}</div>;
  if (!conLimite) return contenido;
  const clase = abierta ? "otea-pagina" : "none";
  return (
    <ViewTransition enter={clase} exit={clase} default="none">
      {contenido}
    </ViewTransition>
  );
}
