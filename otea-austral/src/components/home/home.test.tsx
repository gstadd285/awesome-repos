// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import { AlertaViva } from "./AlertaViva";
import { Board } from "./Board";
import { Horizonte } from "./Horizonte";
import { Story } from "./Story";
import { TopicPicker } from "./TopicPicker";

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
    expect(container.querySelectorAll(".tablero-tarjeta-gana").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".tablero-tarjeta-pierde").length).toBeGreaterThan(0);
    expect(container).toHaveTextContent("Aerolíneas");
  });
});

describe("TopicPicker", () => {
  it("alterna temas con aria-pressed y anuncia la selección", async () => {
    const user = userEvent.setup();
    render(<TopicPicker />);
    const botones = within(screen.getByRole("list", { name: "Temas disponibles" })).getAllByRole("button");
    expect(botones).toHaveLength(TEMAS.length);

    const energia = screen.getByRole("button", { name: new RegExp(TEMA_ETIQUETA.energia) });
    expect(energia).toHaveAttribute("aria-pressed", "false");
    await user.click(energia);
    expect(energia).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Recibirías alertas de: Energía/)).toBeInTheDocument();
  });

  it("aclara que es una vista previa que no guarda preferencias", () => {
    render(<TopicPicker />);
    expect(screen.getByText(/aún no se guardan/)).toBeInTheDocument();
  });
});
