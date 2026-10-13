"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Elementos que responden al puntero (el CSS que los consume vive en globals.css, dentro de la puerta). */
const PUNTERO = "[data-magnetico],[data-foco],[data-inclinar]";
const VARIABLES = ["--mx", "--my", "--tx", "--ty", "--rx", "--ry"] as const;
/** Atracción máxima del botón magnético, en px (la etiqueta se mueve un 45 % más, en el CSS). */
const ATRACCION = 4;
/** Inclinación máxima de las piezas con `data-inclinar`, en grados. */
const INCLINACION = 4;

const acotar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

/**
 * Isla única de cliente del sistema de movimiento. Se monta una vez en el layout y no pinta nada.
 *
 * - **Pausa fuera de vista:** un `IntersectionObserver` marca `data-fuera` en los `[data-bucle]` que salen de la
 *   pantalla; el CSS pausa sus animaciones (`[data-bucle][data-fuera]`). Así ningún bucle gasta fuera de vista.
 * - **Puntero:** con un ratón o trackpad, delega `pointermove` en `document` y, una vez por cuadro, escribe en el
 *   elemento bajo el cursor `--mx --my` (posición de 0 a 1), `--tx --ty` (atracción en px, `data-magnetico`) y
 *   `--rx --ry` (inclinación en grados, `data-inclinar`). Las borra al salir.
 *
 * Solo actúa con la puerta abierta (`html[data-movimiento="completo"]`): observa el atributo y, al cerrarse,
 * retira oyentes, marcas y variables. Escribe solo por CSSOM (`style.setProperty`, admitido por la CSP; nunca un
 * atributo `style`), no usa la Web Animations API (contaría en `getAnimations()`), no guarda estado de React y no
 * importa nada del servidor. Vuelve a buscar los bucles en cada navegación (`usePathname`).
 */
export function DirectorEscena() {
  const ruta = usePathname();

  useEffect(() => {
    const raiz = document.documentElement;
    const fino = window.matchMedia("(hover: hover) and (pointer: fine)");

    let bucles: IntersectionObserver | null = null;
    let punteroActivo = false;
    let cuadro = 0;
    let ultimo: PointerEvent | null = null;
    let actual: HTMLElement | null = null;

    const limpiar = (el: HTMLElement) => {
      for (const variable of VARIABLES) el.style.removeProperty(variable);
    };

    const soltar = () => {
      if (cuadro) cancelAnimationFrame(cuadro);
      cuadro = 0;
      ultimo = null;
      if (actual) limpiar(actual);
      actual = null;
    };

    const pintar = () => {
      cuadro = 0;
      const evento = ultimo;
      if (!evento) return;
      const objetivo = evento.target instanceof Element ? evento.target.closest<HTMLElement>(PUNTERO) : null;
      if (objetivo !== actual) {
        if (actual) limpiar(actual);
        actual = objetivo;
      }
      if (!objetivo) return;
      const caja = objetivo.getBoundingClientRect();
      if (!caja.width || !caja.height) return;
      const fx = acotar((evento.clientX - caja.left) / caja.width, 0, 1);
      const fy = acotar((evento.clientY - caja.top) / caja.height, 0, 1);
      objetivo.style.setProperty("--mx", fx.toFixed(3));
      objetivo.style.setProperty("--my", fy.toFixed(3));
      if (objetivo.hasAttribute("data-magnetico")) {
        // Se acerca al cursor en proporción a su tamaño: 4 px en el borde del lado largo, menos en el corto.
        const k = (ATRACCION * 2) / Math.max(caja.width, caja.height);
        const tx = acotar((fx - 0.5) * caja.width * k, -ATRACCION, ATRACCION);
        const ty = acotar((fy - 0.5) * caja.height * k, -ATRACCION, ATRACCION);
        objetivo.style.setProperty("--tx", tx.toFixed(2));
        objetivo.style.setProperty("--ty", ty.toFixed(2));
      }
      if (objetivo.hasAttribute("data-inclinar")) {
        objetivo.style.setProperty("--ry", ((fx - 0.5) * 2 * INCLINACION).toFixed(2));
        objetivo.style.setProperty("--rx", ((0.5 - fy) * 2 * INCLINACION).toFixed(2));
      }
    };

    const alMover = (evento: PointerEvent) => {
      if (evento.pointerType !== "mouse" && evento.pointerType !== "pen") return;
      ultimo = evento;
      if (!cuadro) cuadro = requestAnimationFrame(pintar);
    };

    const alSalir = (evento: PointerEvent) => {
      if (!actual) return;
      const destino = evento.relatedTarget;
      if (destino instanceof Node && actual.contains(destino)) return;
      soltar();
    };

    const encenderPuntero = () => {
      if (punteroActivo) return;
      punteroActivo = true;
      document.addEventListener("pointermove", alMover, { passive: true });
      document.addEventListener("pointerout", alSalir, { passive: true });
    };

    const apagarPuntero = () => {
      if (!punteroActivo) return;
      punteroActivo = false;
      document.removeEventListener("pointermove", alMover);
      document.removeEventListener("pointerout", alSalir);
      soltar();
    };

    const encenderBucles = () => {
      if (bucles || typeof IntersectionObserver === "undefined") return;
      bucles = new IntersectionObserver(
        (entradas) => {
          for (const entrada of entradas) entrada.target.toggleAttribute("data-fuera", !entrada.isIntersecting);
        },
        { rootMargin: "64px 0px" },
      );
      for (const el of document.querySelectorAll("[data-bucle]")) bucles.observe(el);
    };

    const apagarBucles = () => {
      bucles?.disconnect();
      bucles = null;
      for (const el of document.querySelectorAll("[data-bucle][data-fuera]")) el.removeAttribute("data-fuera");
    };

    const sincronizar = () => {
      const abierta = raiz.dataset.movimiento === "completo";
      if (abierta) encenderBucles();
      else apagarBucles();
      if (abierta && fino.matches) encenderPuntero();
      else apagarPuntero();
    };

    const vigilante = new MutationObserver(sincronizar);
    vigilante.observe(raiz, { attributes: true, attributeFilter: ["data-movimiento"] });
    fino.addEventListener("change", sincronizar);
    sincronizar();

    return () => {
      vigilante.disconnect();
      fino.removeEventListener("change", sincronizar);
      apagarPuntero();
      apagarBucles();
    };
  }, [ruta]);

  return null;
}
