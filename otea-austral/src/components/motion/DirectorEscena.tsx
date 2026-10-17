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
/** Navegación con pastilla de hover y sus variables (px, px y 0/1). */
const NAV = "[data-nav-indicador]";
const VARIABLES_NAV = ["--nx", "--nw", "--nv"] as const;
/** Un salto de ancla más largo que esto (en pantallas) se hace en un fundido, sin cruzar la historia. */
const SALTO_LARGO = 1.5;
/** Luz del héroe: posición del cursor en la ventana (0 a 1), escrita en `.h-hero` mientras el héroe se ve. */
const VARIABLES_LUZ = ["--cx", "--cy"] as const;
/** Bajo este ancho la cinta del héroe puede quedar fuera del primer pliegue (ver `encenderCinta`). */
const ESTRECHA = "(max-width: 1023.98px)";

const acotar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

/** El elemento de esta misma página al que apunta un enlace con ancla (`#id` o `/ruta#id` de la página actual). */
function destinoEnPagina(enlace: HTMLAnchorElement): HTMLElement | null {
  const url = new URL(enlace.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return null;
  if (url.hash.length < 2) return null;
  try {
    return document.getElementById(decodeURIComponent(url.hash.slice(1)));
  } catch {
    return null;
  }
}

/** Cierra el menú del teléfono si está abierto (sin popover en el navegador, no hace nada). */
function cerrarMenu(menu: HTMLElement | null) {
  if (!menu || typeof menu.hidePopover !== "function" || !menu.matches(":popover-open")) return;
  menu.hidePopover();
}

/**
 * Isla única de cliente del sistema de movimiento. Se monta una vez en el layout y no pinta nada.
 *
 * - **Pausa fuera de vista:** un `IntersectionObserver` marca `data-fuera` en los `[data-bucle]` que salen de la
 *   pantalla; el CSS pausa sus animaciones (`[data-bucle][data-fuera]`). Así ningún bucle gasta fuera de vista.
 * - **Puntero:** con un ratón o trackpad, delega `pointermove` en `document` y, una vez por cuadro, escribe en el
 *   elemento bajo el cursor `--mx --my` (posición de 0 a 1), `--tx --ty` (atracción en px, `data-magnetico`) y
 *   `--rx --ry` (inclinación en grados, `data-inclinar`). Las borra al salir.
 *
 * - **Luz del héroe:** mientras el héroe está a la vista (la primera pantalla), escribe en `.h-hero` `--cx --cy`
 *   (posición del cursor en la ventana, de 0 a 1): el sol se desplaza hasta 10 px (paralaje) y el brillo de las
 *   láminas lo sigue. Las borra al salir de la ventana o al cerrarse la puerta. Van en `.h-hero` y no en `.historia`:
 *   las propiedades personalizadas se heredan, y escribirlas en la historia invalidaba en cada cuadro el estilo de
 *   todo su subárbol (plano, tablero y pasos) cuando solo las leen el sol y las láminas.
 * - **Cinta del héroe bajo 1024 px:** se pone de pie una sola vez, por tiempo, al entrar en pantalla. Si al montarse
 *   ya se ve (la tableta, con la cinta en el primer pliegue), no se toca: sigue la entrada por tiempo desde la carga.
 *   Si no, marca `data-cinta="espera"` (oculta, sin animación) y, cuando su borde superior pasa el 90 % de la ventana,
 *   `data-cinta="vista"`: el CSS la arma en ola con el mismo resorte. Ligada al scroll quedaba a medio armar en reposo.
 * - **Pastilla de la navegación:** al pasar el ratón por un enlace de `[data-nav-indicador]` escribe en la navegación
 *   `--nx --nw` (posición y ancho del enlace, leídos solo al cambiar de enlace) y `--nv` (0 o 1). Si estaba apagada,
 *   marca `data-nav-salto` durante un cuadro para que aparezca en su sitio en vez de viajar.
 * - **Saltos de ancla largos:** un clic en un enlace a un ancla de esta página que esté a más de 1,5 pantallas se hace
 *   dentro de `document.startViewTransition` (con `data-salto` en `<html>` mientras dura): un fundido en vez de cruzar
 *   la historia en avance rápido. Antes de mover guarda la entrada en el historial (`pushState`), así «Atrás» vuelve a
 *   donde estaba; después mueve el foco al destino (`tabindex="-1"` si no lo tenía).
 * - **Maquetación diferida** (siempre): mientras la página carga, el CSS deja sin maquetar lo que queda bajo la historia
 *   (`content-visibility`, para que el primer pintado llegue antes). Tras el evento `load`, o al primer clic en un ancla
 *   de esta página, marca `data-maquetado` en `<html>` y todo se maqueta con su alto real: los saltos de ancla
 *   aterrizan donde deben.
 * - **Menú del teléfono** (siempre, también con movimiento reducido: no es movimiento): un clic en un enlace del menú
 *   lo cierra (`hidePopover`), y si el enlace es un ancla de esta página el salto es instantáneo, detrás de la hoja que
 *   se funde, y el foco pasa al destino. Si el foco sale del menú con el teclado, también se cierra.
 *
 * Lo demás solo actúa con la puerta abierta (`html[data-movimiento="completo"]`): observa el atributo y, al cerrarse,
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
    let vigiaCinta: IntersectionObserver | null = null;
    let punteroActivo = false;
    let cuadro = 0;
    let ultimo: PointerEvent | null = null;
    let actual: HTMLElement | null = null;
    let enlaceNav: HTMLElement | null = null;
    const luz = document.querySelector<HTMLElement>(".h-hero");

    const limpiar = (el: HTMLElement) => {
      for (const variable of VARIABLES) el.style.removeProperty(variable);
    };

    const apagarLuz = () => {
      if (luz) for (const variable of VARIABLES_LUZ) luz.style.removeProperty(variable);
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
      // El héroe ocupa la primera pantalla (también en la historia fija, donde se apaga antes del primer paso).
      if (luz && window.scrollY < window.innerHeight) {
        luz.style.setProperty("--cx", (evento.clientX / window.innerWidth).toFixed(3));
        luz.style.setProperty("--cy", (evento.clientY / window.innerHeight).toFixed(3));
      }
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
      // El cursor sale de la ventana: el sol vuelve a su sitio.
      if (!evento.relatedTarget) apagarLuz();
      if (!actual) return;
      const destino = evento.relatedTarget;
      if (destino instanceof Node && actual.contains(destino)) return;
      soltar();
    };

    const alEntrarNav = (evento: PointerEvent) => {
      if (evento.pointerType !== "mouse" && evento.pointerType !== "pen") return;
      const enlace = evento.target instanceof Element ? evento.target.closest<HTMLElement>(`${NAV} a`) : null;
      if (!enlace || enlace === enlaceNav) return;
      const nav = enlace.closest<HTMLElement>(NAV);
      if (!nav) return;
      if (nav.style.getPropertyValue("--nv") !== "1") {
        nav.toggleAttribute("data-nav-salto", true);
        requestAnimationFrame(() => requestAnimationFrame(() => nav.removeAttribute("data-nav-salto")));
      }
      enlaceNav = enlace;
      nav.style.setProperty("--nx", String(enlace.offsetLeft));
      nav.style.setProperty("--nw", String(enlace.offsetWidth));
      nav.style.setProperty("--nv", "1");
    };

    const alSalirNav = (evento: PointerEvent) => {
      const nav = enlaceNav?.closest<HTMLElement>(NAV);
      if (!nav) return;
      const destino = evento.relatedTarget;
      if (destino instanceof Node && nav.contains(destino)) return;
      nav.style.setProperty("--nv", "0");
      enlaceNav = null;
    };

    const apagarNav = () => {
      enlaceNav = null;
      for (const nav of document.querySelectorAll<HTMLElement>(NAV)) {
        for (const variable of VARIABLES_NAV) nav.style.removeProperty(variable);
        nav.removeAttribute("data-nav-salto");
      }
    };

    const encenderPuntero = () => {
      if (punteroActivo) return;
      punteroActivo = true;
      document.addEventListener("pointermove", alMover, { passive: true });
      document.addEventListener("pointerout", alSalir, { passive: true });
      document.addEventListener("pointerover", alEntrarNav, { passive: true });
      document.addEventListener("pointerout", alSalirNav, { passive: true });
    };

    const apagarPuntero = () => {
      if (!punteroActivo) return;
      punteroActivo = false;
      document.removeEventListener("pointermove", alMover);
      document.removeEventListener("pointerout", alSalir);
      document.removeEventListener("pointerover", alEntrarNav);
      document.removeEventListener("pointerout", alSalirNav);
      soltar();
      apagarLuz();
      apagarNav();
    };

    /** Mueve la página al destino: primero la entrada del historial (guarda dónde estaba), luego el salto y el foco. */
    const saltar = (destino: HTMLElement, ancla: string, conFundido: boolean) => {
      const mover = () => {
        history.pushState(null, "", ancla);
        destino.scrollIntoView({ behavior: "instant", block: "start" });
        if (destino.tabIndex < 0 && !destino.hasAttribute("tabindex")) destino.setAttribute("tabindex", "-1");
        destino.focus({ preventScroll: true });
      };
      if (!conFundido || typeof document.startViewTransition !== "function") {
        mover();
        return;
      }
      raiz.toggleAttribute("data-salto", true);
      document
        .startViewTransition(mover)
        .finished.catch(() => undefined)
        .finally(() => raiz.removeAttribute("data-salto"));
    };

    /** Termina la maquetación diferida de la carga (ver el CSS de `data-maquetado`). */
    const maquetar = () => raiz.toggleAttribute("data-maquetado", true);
    let esperaCarga = 0;
    const alCargar = () => {
      esperaCarga = window.setTimeout(maquetar, 0);
    };
    if (!raiz.hasAttribute("data-maquetado")) {
      if (document.readyState === "complete") alCargar();
      else window.addEventListener("load", alCargar, { once: true });
    }

    // En captura: corre antes que el `onClick` de `next/link`, que respeta `defaultPrevented`.
    const alClic = (evento: MouseEvent) => {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const enlace = evento.target instanceof Element ? evento.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!enlace || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) return;
      const destino = destinoEnPagina(enlace);
      // Con altos estimados el salto aterrizaría mal: todo se maqueta antes de medir o de dejar saltar al navegador.
      if (destino) maquetar();
      const abierta = raiz.dataset.movimiento === "completo";
      const menu = enlace.closest<HTMLElement>("#menu-movil");
      if (menu) {
        cerrarMenu(menu);
        // Un ancla de esta página se salta al instante, detrás de la hoja que se funde (con la puerta abierta iría con
        // scroll suave), y el foco va al destino: si no, al cerrarse el popover vuelve al botón «Menú», también con
        // movimiento reducido (mover el foco no es movimiento).
        if (destino) {
          evento.preventDefault();
          saltar(destino, enlace.hash, false);
        }
        return;
      }
      if (!destino || !abierta) return;
      if (Math.abs(destino.getBoundingClientRect().top) <= window.innerHeight * SALTO_LARGO) return;
      evento.preventDefault();
      saltar(destino, enlace.hash, true);
    };

    // Salir del menú con el teclado (Tab más allá del último enlace) lo cierra: no queda abierto tapando la página.
    const alSalirDelMenu = (evento: FocusEvent) => {
      const menu = document.getElementById("menu-movil");
      if (!menu || !(evento.target instanceof Node) || !menu.contains(evento.target)) return;
      const destino = evento.relatedTarget;
      if (!(destino instanceof Element) || menu.contains(destino) || destino.matches('[popovertarget="menu-movil"]')) return;
      cerrarMenu(menu);
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

    const apagarCinta = () => {
      vigiaCinta?.disconnect();
      vigiaCinta = null;
      // Una cinta que esperaba no queda oculta (fuera de la puerta no se oculta, pero tampoco se deja la marca).
      const cinta = document.querySelector<HTMLElement>('.h-cinta[data-cinta="espera"]');
      cinta?.removeAttribute("data-cinta");
    };

    const encenderCinta = () => {
      const cinta = document.querySelector<HTMLElement>(".h-cinta");
      if (vigiaCinta || !cinta || cinta.dataset.cinta || typeof IntersectionObserver === "undefined") return;
      if (!window.matchMedia(ESTRECHA).matches) return;
      const caja = cinta.getBoundingClientRect();
      // Ya a la vista (al menos media cinta dentro de la ventana: las láminas asoman): la entrada por tiempo la arma.
      if (caja.bottom > 0 && caja.top < window.innerHeight - caja.height * 0.5) return;
      cinta.dataset.cinta = "espera";
      vigiaCinta = new IntersectionObserver(
        (entradas) => {
          if (!entradas.some((e) => e.isIntersecting)) return;
          cinta.dataset.cinta = "vista";
          vigiaCinta?.disconnect();
          vigiaCinta = null;
        },
        { rootMargin: "0px 0px -10% 0px" },
      );
      vigiaCinta.observe(cinta);
    };

    const sincronizar = () => {
      const abierta = raiz.dataset.movimiento === "completo";
      if (abierta) encenderBucles();
      else apagarBucles();
      if (abierta) encenderCinta();
      else apagarCinta();
      if (abierta && fino.matches) encenderPuntero();
      else apagarPuntero();
    };

    const vigilante = new MutationObserver(sincronizar);
    vigilante.observe(raiz, { attributes: true, attributeFilter: ["data-movimiento"] });
    fino.addEventListener("change", sincronizar);
    document.addEventListener("click", alClic, true);
    document.addEventListener("focusout", alSalirDelMenu, true);
    sincronizar();

    return () => {
      window.removeEventListener("load", alCargar);
      window.clearTimeout(esperaCarga);
      vigilante.disconnect();
      fino.removeEventListener("change", sincronizar);
      document.removeEventListener("click", alClic, true);
      document.removeEventListener("focusout", alSalirDelMenu, true);
      apagarPuntero();
      apagarBucles();
      apagarCinta();
    };
  }, [ruta]);

  return null;
}
