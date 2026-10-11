/**
 * Motor de movimiento: decide si la página se anima y cubre lo que el CSS solo no alcanza.
 *
 * Corre en la cabecera, antes del primer pintado (ver `ScriptMovimiento`), y hace tres cosas:
 *
 * 1. **Puerta de movimiento.** Escribe `data-movimiento="completo" | "reducido"` en `<html>`; todo el
 *    movimiento del CSS cuelga de `html[data-movimiento="completo"]`. Por defecto manda el sistema
 *    (`prefers-reduced-motion`), pero la persona puede elegir lo contrario con el conmutador
 *    (`[data-mov-conmutar]`) y la elección se recuerda. Sin JavaScript no hay puerta: la página queda
 *    quieta y completa.
 * 2. **Respaldo sin líneas de tiempo.** Donde el navegador no soporta `animation-timeline` (Firefox, Safari
 *    anterior al 26), anota `data-timeline="no"` y observa los bloques de texto y las piezas 3D: al entrar
 *    en pantalla les añade `kx-visto` o `escena-vista` y el CSS ejecuta la animación una vez, con el tiempo.
 * 3. **Conmutador.** Alterna el modo, lo guarda y mantiene el botón en su sitio al cambiar el diseño. Un
 *    vigilante del DOM mantiene al día `aria-pressed` de los conmutadores que llegan después (otra página).
 *
 * Se serializa con `toString()` dentro de un `<script>`: debe ser autocontenida (sin importaciones ni
 * referencias a nada fuera de su cuerpo). `motor.test.ts` lo comprueba ejecutándola aislada.
 */
export type OpcionesMotor = {
  /** Clave de `localStorage` donde se recuerda la elección. */
  clave: string;
  /**
   * La copia de demostración parte con el movimiento activado aunque el sistema pida reducirlo
   * (quien la abre quiere ver las animaciones); el sitio real obedece al sistema.
   */
  ignorarSistema: boolean;
};

type VentanaOtea = Window & { __oteaMovimiento?: { aplicar: () => void } };

export function motorMovimiento(opciones: OpcionesMotor): void {
  const doc = document;
  const raiz = doc.documentElement;
  const SELECTOR = ".kx-scroll, .escena";

  let sistemaReduce = false;
  let soportaTimeline = false;
  let consulta: MediaQueryList | null = null;
  try {
    consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    sistemaReduce = consulta.matches;
  } catch {
    sistemaReduce = false;
  }
  try {
    soportaTimeline = Boolean(window.CSS && typeof CSS.supports === "function" && CSS.supports("animation-timeline", "view()"));
  } catch {
    soportaTimeline = false;
  }

  // Elección guardada: se lee una vez y se conserva en memoria por si el almacenamiento falla.
  let elegido: string | null = null;
  try {
    elegido = localStorage.getItem(opciones.clave);
  } catch {
    elegido = null;
  }
  if (elegido !== "completo" && elegido !== "reducido") elegido = null;

  const porDefecto = (): string => (opciones.ignorarSistema || !sistemaReduce ? "completo" : "reducido");
  let modo = porDefecto();

  // ── Respaldo: la animación se dispara al entrar en pantalla ────────────────────────────────────
  let quiereRespaldo = false;
  let observador: IntersectionObserver | null = null;
  let vigilante: MutationObserver | null = null;

  const marcar = (el: Element, quieto: boolean): void => {
    el.classList.add(el.classList.contains("escena") ? "escena-vista" : "kx-visto");
    if (quieto) el.classList.add("mov-quieto");
  };

  const observarEn = (zona: Element): void => {
    if (!observador) return;
    if (zona.matches(SELECTOR)) observador.observe(zona);
    zona.querySelectorAll(SELECTOR).forEach((el) => observador?.observe(el));
  };

  const sincronizarConmutadores = (zona: Element | Document): void => {
    zona
      .querySelectorAll("[data-mov-conmutar][aria-pressed]")
      .forEach((b) => b.setAttribute("aria-pressed", String(modo === "completo")));
  };

  // Vigila lo que llega después (otra página dentro de la aplicación): los conmutadores nuevos nacen con
  // `aria-pressed="false"` y se ponen al día; y, con el respaldo en marcha, los bloques nuevos se observan.
  const vigilar = (): void => {
    if (vigilante || !doc.body) return;
    sincronizarConmutadores(doc);
    vigilante = new MutationObserver((cambios) => {
      cambios.forEach((c) =>
        c.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          sincronizarConmutadores(n as Element);
          observarEn(n as Element);
        }),
      );
    });
    vigilante.observe(doc.body, { childList: true, subtree: true });
  };

  const arrancarRespaldo = (): void => {
    if (!quiereRespaldo || observador || !doc.body || typeof IntersectionObserver === "undefined") return;
    // Lo que ya está a la vista al empezar se da por visto y quieto: así no parpadea (visible, tenue, animado).
    const alto = window.innerHeight;
    doc.querySelectorAll(SELECTOR).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < alto * 0.9 && r.bottom > 0) marcar(el, true);
    });
    observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (!e.isIntersecting) return;
          marcar(e.target, false);
          observador?.unobserve(e.target);
        });
      },
      // Se dispara cuando el borde superior pasa del 88 % de la altura: da tiempo a terminar antes de leer.
      { rootMargin: "0px 0px -12% 0px" },
    );
    observarEn(doc.body);
    raiz.setAttribute("data-motor", "listo");
  };

  const detenerRespaldo = (): void => {
    quiereRespaldo = false;
    observador?.disconnect();
    observador = null;
    raiz.removeAttribute("data-motor");
  };

  // El DOM puede no estar listo (el script corre en la cabecera): lo que lo necesita espera a que lo esté.
  const alEstarListo = (): void => {
    vigilar();
    arrancarRespaldo();
  };

  // ── Estado en <html> ────────────────────────────────────────────────────────────────────────────
  const aplicar = (): void => {
    modo = elegido ?? porDefecto();
    raiz.setAttribute("data-movimiento", modo);
    raiz.setAttribute("data-sistema", sistemaReduce ? "reduce" : "normal");
    // El conmutador solo se muestra donde tiene sentido: el sistema pide reducir, la copia o ya hay una elección.
    if (sistemaReduce || opciones.ignorarSistema || elegido !== null) raiz.setAttribute("data-mov-ui", "1");
    else raiz.removeAttribute("data-mov-ui");
    if (soportaTimeline) raiz.removeAttribute("data-timeline");
    else raiz.setAttribute("data-timeline", "no");
    sincronizarConmutadores(doc);
    if (modo === "completo" && !soportaTimeline) quiereRespaldo = true;
    else detenerRespaldo();
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", alEstarListo, { once: true });
    else alEstarListo();
  };

  const alternar = (boton: Element): void => {
    const antes = boton.getBoundingClientRect().top;
    const nuevo = modo === "completo" ? "reducido" : "completo";
    elegido = nuevo === porDefecto() ? null : nuevo;
    try {
      if (elegido === null) localStorage.removeItem(opciones.clave);
      else localStorage.setItem(opciones.clave, elegido);
    } catch {
      // Sin almacenamiento la elección vale solo para esta visita.
    }
    aplicar();
    // El diseño cambia de altura: el botón se queda donde estaba en pantalla (si sigue visible).
    if (boton.getClientRects().length > 0) {
      window.scrollBy({ top: boton.getBoundingClientRect().top - antes, behavior: "instant" });
    }
  };

  doc.addEventListener("click", (ev) => {
    const boton = ev.target instanceof Element ? ev.target.closest("[data-mov-conmutar]") : null;
    if (!boton) return;
    ev.preventDefault();
    alternar(boton);
  });

  if (consulta && typeof consulta.addEventListener === "function") {
    const mq = consulta;
    mq.addEventListener("change", () => {
      sistemaReduce = mq.matches;
      aplicar();
    });
  }

  (window as VentanaOtea).__oteaMovimiento = { aplicar };
  aplicar();
}

/** Código del `<script>` de cabecera: la función serializada y llamada con sus opciones fijas. */
export function codigoMotor(opciones: OpcionesMotor): string {
  return `(${motorMovimiento.toString()})(${JSON.stringify(opciones)})`;
}

/** Opciones del sitio real: obedece al sistema y recuerda la elección. */
export const OPCIONES_SITIO: OpcionesMotor = { clave: "otea-movimiento", ignorarSistema: false };
