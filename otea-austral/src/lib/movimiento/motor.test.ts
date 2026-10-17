// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codigoMotor, motorMovimiento, OPCIONES_SITIO, type OpcionesMotor } from "./motor";

const raiz = document.documentElement;
const OPCIONES: OpcionesMotor = { clave: "otea-movimiento-prueba", ignorarSistema: false };

/** Observador de intersección de mentira: guarda lo que se observa y deja disparar la entrada a mano. */
class ObservadorFalso {
  static instancias: ObservadorFalso[] = [];
  observados = new Set<Element>();
  constructor(
    private alEntrar: (entradas: { target: Element; isIntersecting: boolean }[]) => void,
    public opciones?: IntersectionObserverInit,
  ) {
    ObservadorFalso.instancias.push(this);
  }
  observe(el: Element) {
    this.observados.add(el);
  }
  unobserve(el: Element) {
    this.observados.delete(el);
  }
  disconnect() {
    this.observados.clear();
  }
  entra(el: Element) {
    this.alEntrar([{ target: el, isIntersecting: true }]);
  }
}

let sistemaReduce = false;
let soportaTimeline = true;
let oyentesSistema: (() => void)[] = [];
const registrados: [string, EventListenerOrEventListenerObject][] = [];

/** Arma un elemento sin pasar por innerHTML (la regla de seguridad del proyecto lo prohíbe, también en pruebas). */
function el(etiqueta: string, atributos: Record<string, string> = {}, ...hijos: (Node | string)[]): HTMLElement {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  e.append(...hijos);
  return e;
}

function preparar({ reduce = false, timeline = true }: { reduce?: boolean; timeline?: boolean } = {}) {
  sistemaReduce = reduce;
  soportaTimeline = timeline;
}

function ponerEnVista(el: Element, top: number) {
  el.getBoundingClientRect = () => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON: () => ({}) });
}

beforeEach(() => {
  sistemaReduce = false;
  soportaTimeline = true;
  oyentesSistema = [];
  ObservadorFalso.instancias = [];
  vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      media: consulta,
      get matches() {
        return sistemaReduce;
      },
      addEventListener: (_: string, f: () => void) => oyentesSistema.push(f),
      removeEventListener: () => {},
    }),
  });
  Object.defineProperty(window, "CSS", {
    configurable: true,
    writable: true,
    value: { supports: () => soportaTimeline },
  });
  // El motor registra un oyente de clic en `document` cada vez que arranca: se retiran entre pruebas.
  const original = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((tipo, fn, opciones) => {
    registrados.push([tipo, fn]);
    original(tipo, fn, opciones);
  });
  localStorage.clear();
  document.body.replaceChildren();
  for (const a of ["data-movimiento", "data-sistema", "data-mov-ui", "data-timeline", "data-motor"]) raiz.removeAttribute(a);
});

afterEach(() => {
  for (const [tipo, fn] of registrados) document.removeEventListener(tipo, fn);
  registrados.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("puerta de movimiento", () => {
  it("sin preferencia del sistema, el movimiento queda activado", () => {
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    expect(raiz.getAttribute("data-sistema")).toBe("normal");
    expect(raiz.hasAttribute("data-mov-ui")).toBe(false);
  });

  it("con «reducir movimiento» en el sistema, queda reducido y se ofrece el conmutador", () => {
    preparar({ reduce: true });
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("reducido");
    expect(raiz.getAttribute("data-sistema")).toBe("reduce");
    expect(raiz.getAttribute("data-mov-ui")).toBe("1");
  });

  it("la elección guardada manda sobre el sistema", () => {
    preparar({ reduce: true });
    localStorage.setItem(OPCIONES.clave, "completo");
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    expect(raiz.getAttribute("data-mov-ui")).toBe("1");
  });

  it("ignora un valor guardado que no sea de los dos modos", () => {
    localStorage.setItem(OPCIONES.clave, "cualquier-cosa");
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
  });

  it("la copia de demostración parte activada aunque el sistema pida reducir, y deja desactivarlo", () => {
    preparar({ reduce: true });
    motorMovimiento({ ...OPCIONES, ignorarSistema: true });
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    expect(raiz.getAttribute("data-mov-ui")).toBe("1");
  });

  it("reacciona cuando el sistema cambia la preferencia con la página abierta", () => {
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    sistemaReduce = true;
    oyentesSistema.forEach((f) => f());
    expect(raiz.getAttribute("data-movimiento")).toBe("reducido");
  });

  it("sigue funcionando sin almacenamiento (la elección vale para la visita)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    preparar({ reduce: true });
    document.body.replaceChildren(el("button", { "data-mov-conmutar": "", "aria-pressed": "false" }, "Animaciones"));
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("reducido");
    document.querySelector<HTMLButtonElement>("[data-mov-conmutar]")!.click();
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
  });
});

describe("conmutador", () => {
  it("alterna el modo, lo recuerda y actualiza aria-pressed; volver al del sistema borra la elección", () => {
    preparar({ reduce: true });
    document.body.replaceChildren(
      el("button", { "data-mov-conmutar": "", "aria-pressed": "false" }, "Animaciones"),
      el("button", { "data-mov-conmutar": "" }, "Aviso"),
    );
    motorMovimiento(OPCIONES);
    const [conmutador, aviso] = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mov-conmutar]"));
    expect(conmutador.getAttribute("aria-pressed")).toBe("false");

    aviso.click();
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    expect(localStorage.getItem(OPCIONES.clave)).toBe("completo");
    expect(conmutador.getAttribute("aria-pressed")).toBe("true");
    // El botón del aviso no es un interruptor de dos estados: no lleva aria-pressed.
    expect(aviso.hasAttribute("aria-pressed")).toBe(false);

    conmutador.click();
    expect(raiz.getAttribute("data-movimiento")).toBe("reducido");
    expect(localStorage.getItem(OPCIONES.clave)).toBeNull();
    expect(conmutador.getAttribute("aria-pressed")).toBe("false");
  });

  it("un conmutador que llega después (otra página) se pone al día con el modo actual", async () => {
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    const nuevo = el("footer", {}, el("button", { "data-mov-conmutar": "", "aria-pressed": "false" }, "Animaciones"));
    document.body.append(nuevo);
    await new Promise((r) => setTimeout(r, 0));
    expect(nuevo.firstElementChild!.getAttribute("aria-pressed")).toBe("true");
  });

  it("un clic dentro del botón (en un hijo) también cuenta", () => {
    preparar({ reduce: true });
    document.body.replaceChildren(
      el("button", { "data-mov-conmutar": "", "aria-pressed": "false" }, el("span", { id: "hijo" }, "Animaciones")),
    );
    motorMovimiento(OPCIONES);
    document.getElementById("hijo")!.click();
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
  });
});

describe("respaldo sin líneas de tiempo", () => {
  function pagina() {
    const visible = el("p", { class: "kx kx-lectura kx-scroll" });
    const abajo = el("p", { class: "kx kx-palabras kx-scroll" });
    const plano = el("div", { class: "plano h-plano escena" });
    document.body.replaceChildren(visible, abajo, plano);
    ponerEnVista(visible, 100);
    ponerEnVista(abajo, 5000);
    ponerEnVista(plano, 6000);
    return { visible, abajo, plano };
  }

  it("con soporte no hace nada: ni marca el documento ni observa", () => {
    pagina();
    motorMovimiento(OPCIONES);
    expect(raiz.hasAttribute("data-timeline")).toBe(false);
    expect(raiz.hasAttribute("data-motor")).toBe(false);
    expect(ObservadorFalso.instancias).toHaveLength(0);
  });

  it("sin soporte, da por vistos y quietos los bloques que ya están a la vista y observa el resto", () => {
    preparar({ timeline: false });
    const { visible, abajo, plano } = pagina();
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-timeline")).toBe("no");
    expect(raiz.getAttribute("data-motor")).toBe("listo");
    expect(visible.classList.contains("kx-visto") && visible.classList.contains("mov-quieto")).toBe(true);
    expect(abajo.classList.contains("kx-visto")).toBe(false);
    expect(plano.classList.contains("escena-vista")).toBe(false);
    const [observador] = ObservadorFalso.instancias;
    expect(observador.observados.has(abajo) && observador.observados.has(plano)).toBe(true);
    expect(observador.opciones?.rootMargin).toBe("0px 0px -12% 0px");
  });

  it("al entrar en pantalla, el bloque se marca (con animación) y deja de observarse", () => {
    preparar({ timeline: false });
    const { abajo, plano } = pagina();
    motorMovimiento(OPCIONES);
    const [observador] = ObservadorFalso.instancias;
    observador.entra(abajo);
    observador.entra(plano);
    expect(abajo.classList.contains("kx-visto")).toBe(true);
    expect(abajo.classList.contains("mov-quieto")).toBe(false);
    expect(plano.classList.contains("escena-vista")).toBe(true);
    expect(observador.observados.has(abajo)).toBe(false);
  });

  it("observa también lo que llega después (otra página dentro de la aplicación)", async () => {
    preparar({ timeline: false });
    pagina();
    motorMovimiento(OPCIONES);
    const nuevo = el("section", {}, el("p", { class: "kx kx-lectura kx-scroll" }));
    document.body.append(nuevo);
    await new Promise((r) => setTimeout(r, 0));
    const [observador] = ObservadorFalso.instancias;
    expect(observador.observados.has(nuevo.firstElementChild!)).toBe(true);
  });

  it("al reducir el movimiento se detiene y retira el motor, así el contenido vuelve a verse completo", () => {
    preparar({ timeline: false });
    pagina();
    document.body.append(el("button", { "data-mov-conmutar": "", "aria-pressed": "true" }, "Animaciones"));
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-motor")).toBe("listo");
    document.querySelector<HTMLButtonElement>("[data-mov-conmutar]")!.click();
    expect(raiz.getAttribute("data-movimiento")).toBe("reducido");
    expect(raiz.hasAttribute("data-motor")).toBe(false);
  });

  it("sin IntersectionObserver no oculta nada: no hay motor y el contenido queda completo", () => {
    preparar({ timeline: false });
    vi.stubGlobal("IntersectionObserver", undefined);
    pagina();
    motorMovimiento(OPCIONES);
    expect(raiz.getAttribute("data-movimiento")).toBe("completo");
    expect(raiz.hasAttribute("data-motor")).toBe(false);
  });
});

describe("código del script de cabecera", () => {
  it("es autocontenido: serializado y ejecutado en un contexto aparte (solo con el DOM mínimo) hace lo mismo", () => {
    const atributos = new Map<string, string>();
    const vacia = { forEach: () => {} };
    const documento = {
      documentElement: {
        setAttribute: (k: string, v: string) => void atributos.set(k, v),
        removeAttribute: (k: string) => void atributos.delete(k),
      },
      querySelectorAll: () => vacia,
      addEventListener: () => {},
      readyState: "complete",
      body: {},
    };
    const ventana: Record<string, unknown> = {
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
      CSS: { supports: () => true },
      innerHeight: 800,
    };
    const almacen = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    // Solo los globales del navegador que el código usa de verdad: si toca algo más (un auxiliar del compilador,
    // una importación), el contexto lanza ReferenceError y la prueba falla.
    runInNewContext(codigoMotor(OPCIONES_SITIO), {
      document: documento,
      window: ventana,
      localStorage: almacen,
      CSS: ventana.CSS,
      Element: class {},
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
    });
    expect(atributos.get("data-movimiento")).toBe("reducido");
    expect(atributos.get("data-sistema")).toBe("reduce");
    expect(atributos.get("data-mov-ui")).toBe("1");
    expect(ventana.__oteaMovimiento).toBeDefined();
  });

  it("no puede cerrar la etiqueta <script> ni arrastra datos de la solicitud", () => {
    const codigo = codigoMotor(OPCIONES_SITIO);
    expect(codigo).not.toMatch(/<\/script/i);
    expect(codigo).not.toMatch(/process\.env|import\(|require\(|eval\(|new Function/);
    expect(codigo.length).toBeLessThan(6000);
    expect(codigo.endsWith(`(${JSON.stringify(OPCIONES_SITIO)})`)).toBe(true);
  });
});
