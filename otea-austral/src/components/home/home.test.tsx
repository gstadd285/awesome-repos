// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import { vistaSinPrimaria } from "@/data/ejemplo";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { AlertExamples } from "./AlertExamples";
import { AlertaViva } from "./AlertaViva";
import { Blueprint } from "./Blueprint";
import { Board } from "./Board";
import { Horizonte } from "./Horizonte";
import { Story } from "./Story";
import { Temas } from "./Temas";

describe("Story", () => {
  it("presenta el eslogan como único h1 y los cuatro pasos en orden de lectura", () => {
    render(<Story />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Del horizonte al mercado.");
    // El texto en movimiento se emite una vez para lectores de pantalla (`sr-only`) y otra decorativa.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => (h.querySelector(".sr-only") ?? h).textContent),
    ).toEqual([
      "Verificamos antes de avisar.",
      "Quién gana, quién pierde y bajo qué condición.",
      "Tu panel antes de la apertura.",
    ]);
  });

  it("dice qué es en el héroe y deja saltarse la historia o ir a la lista de espera", () => {
    render(<Story />);
    expect(screen.getByRole("link", { name: /Ver una alerta de ejemplo/ })).toHaveAttribute("href", "#ejemplos");
    expect(screen.getByRole("link", { name: "Recibir alertas" })).toHaveAttribute("href", "#lista-de-espera");
    expect(screen.getByText(/Te avisamos de los eventos globales que importan/, { selector: ".hero-texto" })).toBeInTheDocument();
  });

  it("el H1 es uno solo, con su nombre entero, y sus dos líneas partidas por el horizonte son decorativas", () => {
    const { container } = render(<Story />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName("Del horizonte al mercado.");
    expect(h1.querySelector(".sr-only")).toHaveTextContent("Del horizonte al mercado.");
    for (const caja of h1.querySelectorAll(".h1-caja")) expect(caja).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".h1-linea-1")).toHaveTextContent("Del horizonte");
    expect(container.querySelector(".h1-linea-2")).toHaveTextContent("al mercado.");
    // Ya no se parte en letras: el interletraje de Inter se conserva.
    expect(h1.querySelector(".kx-l")).toBeNull();
  });

  it("no deja atributos style en el HTML (la CSP los bloquea)", () => {
    const { container } = render(<Story />);
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("las piezas 3D son decorativas para lectores de pantalla", () => {
    const { container } = render(<Story />);
    for (const pieza of [".cinta", ".plano", ".tablero", ".horizonte", ".alerta-viva", ".hero-desliza"]) {
      expect(container.querySelector(pieza)).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("el riel 01 · 02 · 03 lleva a tres anclas de la historia fija, y el alba y el velo son decorativos", () => {
    const { container } = render(<Story />);
    const riel = screen.getByRole("navigation", { name: "Pasos de la historia" });
    const enlaces = within(riel).getAllByRole("link");
    expect(enlaces.map((a) => a.textContent)).toEqual(["01Verificación", "02Impacto", "03Tu panel"]);
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual(["#paso-verificar", "#paso-impacto", "#paso-panel"]);
    for (const id of ["paso-verificar", "paso-impacto", "paso-panel"]) expect(container.querySelector(`#${id}`)).not.toBeNull();
    for (const pieza of [".h-alba", ".h-velo"]) expect(container.querySelector(pieza)).toHaveAttribute("aria-hidden", "true");
  });

  it("la cinta tiene 24 láminas con clases fijas y cuatro rótulos", () => {
    const { container } = render(<Story />);
    const laminas = [...container.querySelectorAll(".lamina")];
    expect(laminas).toHaveLength(24);
    laminas.forEach((l, i) => expect(l).toHaveClass(`lamina-${i}`));
    expect([...container.querySelectorAll(".cinta-rotulo")].map((r) => r.textContent)).toEqual(["ORMUZ", "COBRE", "CHIPS", "TASAS"]);
  });
});

describe("Horizonte", () => {
  it("es decorativo, sin atributos style, y sus ocho pulsos (un bucle) se pausan fuera de vista", () => {
    const { container } = render(<Horizonte />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.querySelector(".h-pulsos")).toHaveAttribute("data-bucle");
    expect(container.querySelectorAll(".pulso")).toHaveLength(8);
    // El sol es un disco, no el emblema: ni anillo ni lente.
    expect(container.querySelector(".sol")?.children).toHaveLength(0);
  });
});

describe("AlertaViva", () => {
  it("es decorativa, se marca como ejemplo y sale de los datos y las reglas reales", () => {
    const { container } = render(<AlertaViva />);
    const alerta = container.firstElementChild!;
    expect(alerta).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[style]")).toBeNull();
    expect(alerta).toHaveTextContent("Datos de ejemplo");
    expect(alerta).toHaveTextContent("Tensión en el estrecho de Ormuz");
    // Confianza calculada desde las fuentes (hay una primaria): alta, tres segmentos llenos.
    expect(container.querySelector(".av-nivel")).toHaveTextContent("Alta");
    expect(container.querySelectorAll(".av-lleno")).toHaveLength(3);
    expect(container.querySelector(".av-fuente")).toHaveTextContent("(ejemplo)");
    expect([...container.querySelectorAll(".av-chip")].map((c) => c.textContent)).toEqual(["Gana", "Condicionado", "Pierde"]);
    expect(container.querySelector(".av-organismos")).toHaveTextContent("2 organismos");
  });
});

describe("Board", () => {
  it("toma las tarjetas de las alertas de ejemplo y se marca como ejemplo", () => {
    const { container } = render(<Board />);
    expect(container).toHaveTextContent("Datos de ejemplo");
    expect(container.querySelectorAll(".tablero-tarjeta")).toHaveLength(9);
    expect(container.querySelectorAll(".tablero-tarjeta-gana").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".tablero-tarjeta-pierde").length).toBeGreaterThan(0);
    // «Aerolíneas» entre las tres primeras de «Pierde».
    const pierde = [...container.querySelectorAll(".tablero-tarjeta-pierde .tablero-tarjeta-sector")].map((p) => p.textContent);
    expect(pierde.slice(0, 3)).toContain("Aerolíneas");
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("el tablero que respira sale de los datos: contadores, «Corregida», una sola «Nueva», tres corrientes y el aviso", () => {
    const { container } = render(<Board />);
    // Cuántas filas de cada dirección tienen las alertas de ejemplo (gana, condicionado, pierde).
    expect([...container.querySelectorAll(".tablero-contador")].map((c) => c.textContent)).toEqual(["3", "3", "4"]);
    // «Corregida» es el estado real de la alerta del cobre, y solo marca sus tarjetas.
    const corregidas = [...container.querySelectorAll(".tablero-corregida")].map((c) =>
      c.closest(".tablero-tarjeta")!.querySelector(".tablero-tarjeta-evento")!.textContent,
    );
    expect(corregidas.length).toBeGreaterThan(0);
    for (const evento of corregidas) expect(evento).toMatch(/cobre/);
    expect(container.querySelectorAll(".tablero-nueva")).toHaveLength(1);
    expect(container.querySelectorAll(".tablero-corrientes .tablero-corriente")).toHaveLength(3);
    const aviso = container.querySelector(".tablero-aviso")!;
    expect(aviso).toHaveTextContent("Resumen pre-apertura");
    expect(aviso).toHaveTextContent("Datos de ejemplo");
  });
});

describe("Blueprint", () => {
  it("es decorativo y sale de los datos y las reglas reales: evento, medidor y tres comprobaciones", () => {
    const { container } = render(<Blueprint />);
    const plano = container.firstElementChild!;
    expect(plano).toHaveClass("plano");
    expect(plano).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[style]")).toBeNull();
    expect(plano).toHaveTextContent("Datos de ejemplo");
    expect(container.querySelector(".plano-evento-titulo")).toHaveTextContent("Tensión en el estrecho de Ormuz");
    expect([...container.querySelectorAll(".plano-ficha-titulo")].map((p) => p.textContent)).toEqual([
      "Fuente primaria",
      "Dos organismos",
      "Aprobación humana",
    ]);
    expect(container.querySelector(".plano-ficha-1 .plano-ficha-detalle")).toHaveTextContent("(ejemplo)");
    expect(container.querySelector(".plano-ficha-2 .plano-ficha-detalle")).toHaveTextContent("2 organismos distintos");
    // Confianza calculada (hay una primaria): alta, los tres tramos llenos.
    expect(container.querySelectorAll(".plano-lleno")).toHaveLength(3);
    // Sin la gota de metal de antes; la lente es un anillo con mango, no el emblema (ni disco ni horizonte).
    expect(container.querySelector(".gota")).toBeNull();
    expect(container.querySelector(".plano-lente")!.children).toHaveLength(1);
    expect(container.querySelector(".plano-lente svg, .plano-lente circle")).toBeNull();
  });
});

describe("TopicPicker", () => {
  it("alterna temas con aria-pressed y anuncia la selección", async () => {
    const user = userEvent.setup();
    render(<Temas />);
    const botones = within(screen.getByRole("list", { name: "Temas disponibles" })).getAllByRole("button");
    expect(botones).toHaveLength(TEMAS.length);

    const energia = screen.getByRole("button", { name: new RegExp(TEMA_ETIQUETA.energia) });
    expect(energia).toHaveAttribute("aria-pressed", "false");
    await user.click(energia);
    expect(energia).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Recibirías alertas de: Energía/)).toBeInTheDocument();
  });

  it("aclara que es una vista previa que no guarda preferencias", () => {
    render(<Temas />);
    expect(screen.getByText(/aún no se guardan/)).toBeInTheDocument();
  });

  it("«Tu mañana» filtra los avisos de ejemplo por tema: el contador y la barra siguen a los visibles", async () => {
    const user = userEvent.setup();
    const { container } = render(<Temas />);
    const manana = screen.getByRole("complementary", { name: "Tu mañana, vista previa" });
    expect(manana).toHaveTextContent("Datos de ejemplo");
    // Seis avisos, uno por alerta de ejemplo (las tres nuevas cubren Energía, Chips y Divisas); no se desmontan.
    const avisos = manana.querySelectorAll(".tm-aviso");
    expect(avisos).toHaveLength(6);
    const visibles = () => [...avisos].filter((a) => !a.hasAttribute("data-oculto"));
    const cifra = () => Number(manana.querySelector(".tm-cifra")!.textContent);
    // Por defecto (Cobre y Divisas, también sin JavaScript): dos avisos.
    expect(visibles()).toHaveLength(2);
    expect(cifra()).toBe(2);
    for (const oculto of [...avisos].filter((a) => a.hasAttribute("data-oculto"))) {
      expect(oculto).toHaveAttribute("aria-hidden", "true");
      expect(oculto).toHaveAttribute("inert");
    }
    // La barra suma los sectores de los avisos visibles, por dirección.
    const sectores = (d: string) => visibles().flatMap((a) => [...a.querySelectorAll(`[data-direccion="${d}"]`)]).length;
    const leyenda = [...manana.querySelectorAll(".tm-leyenda li")].map((l) => l.textContent);
    expect(leyenda).toEqual([`${sectores("gana")} gana`, `${sectores("condicionado")} condicionado`, `${sectores("pierde")} pierde`]);

    await user.click(screen.getByRole("button", { name: new RegExp(TEMA_ETIQUETA.energia) }));
    expect(visibles()).toHaveLength(3);
    expect(cifra()).toBe(3);
    expect(visibles()[0]).toHaveTextContent("Energía");
    // Los avisos no son botones: un solo botón por tema.
    expect(within(manana).queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector("[style]")).toBeNull();
  });
});

describe("AlertExamples · vitrina", () => {
  it("es un grupo con un selector Ormuz · Chips · Cobre de radios nativos y la prueba como interruptor", () => {
    render(<AlertExamples />);
    const vitrina = screen.getByRole("group", { name: "Vitrina de alertas de ejemplo" });
    const escenarios = within(vitrina).getByRole("group", { name: "Escenario" });
    const radios = within(escenarios).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(["Ormuz", "Chips", "Cobre"]);
    expect(radios.every((r) => r.getAttribute("name") === "escenario")).toBe(true);
    expect(radios[0]).toBeChecked();
    expect(within(vitrina).getByRole("switch", { name: "Prueba: quita la fuente primaria" })).not.toBeChecked();
  });

  it("muestra la AlertCard real de cada escenario con sus fuentes y cuatro anotaciones de texto", () => {
    const { container } = render(<AlertExamples />);
    expect(container.querySelector("#alerta-ejemplo-ormuz details summary")).toHaveTextContent("Fuentes");
    expect(container.querySelector("#alerta-ejemplo-chips")).not.toBeNull();
    expect(container.querySelector("#alerta-ejemplo-cobre")).toHaveTextContent("Corregida el");
    const notas = screen.getAllByRole("list", { name: "Cómo leer esta alerta" });
    expect(notas).toHaveLength(3);
    for (const lista of notas) {
      expect([...lista.querySelectorAll(".nota-titulo")].map((t) => t.textContent?.replace(/^0\d/, ""))).toEqual([
        "Condición",
        "Confianza calculada",
        "Fuentes",
        "Correcciones",
      ]);
    }
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("la prueba «quita la fuente primaria» pinta en paralelo lo que cambia, calculado con las reglas reales", () => {
    const { container } = render(<AlertExamples />);
    const prueba = vistaSinPrimaria("ejemplo-ormuz");
    expect(prueba.confianza).toBe("baja");
    const ormuz = container.querySelector("#alerta-ejemplo-ormuz")!;
    expect([...ormuz.querySelectorAll(".solo-a")].map((e) => e.textContent)).toContain("Confianza alta");
    expect([...ormuz.querySelectorAll(".solo-b")].map((e) => e.textContent)).toContain("Confianza baja");
    expect(ormuz.querySelector("p.solo-b")).toHaveTextContent("No podría publicarse como impacto alto");
    // La fuente primaria queda en la lista, marcada como quitada en la prueba.
    expect(ormuz.querySelectorAll("[data-quitada]")).toHaveLength(1);
    // La nota de la confianza dice el paso de alta a baja; una frase en una región viva resume el cambio.
    const notaOrmuz = container.querySelector(".vitrina-panel-ormuz .nota-2")!;
    expect(notaOrmuz.querySelector(".solo-b")).toHaveTextContent("Alta → baja");
    const vivo = container.querySelector("[aria-live='polite']")!;
    expect(vivo.querySelector(".solo-b")).toHaveTextContent("baja de alta a baja");
    // Chips y Cobre no cambian con la prueba.
    expect(container.querySelectorAll(".vitrina-panel-chips .solo-b, .vitrina-panel-cobre .solo-b")).toHaveLength(0);
  });

  it("los textos de la vitrina no usan lenguaje de recomendación", () => {
    const { container } = render(<AlertExamples />);
    expect(frasesProhibidas(container.querySelector(".vitrina")!.textContent ?? "")).toEqual([]);
  });
});
