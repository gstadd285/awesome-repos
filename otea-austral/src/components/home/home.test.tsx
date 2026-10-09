// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import { Board } from "./Board";
import { Story } from "./Story";
import { TopicPicker } from "./TopicPicker";

describe("Story", () => {
  it("presenta el eslogan como único h1 y los cuatro pasos en orden de lectura", () => {
    render(<Story />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Del horizonte al mercado.");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Verificamos antes de avisar.",
      "Quién gana, quién pierde y bajo qué condición.",
      "Tu panel antes de la apertura.",
    ]);
  });

  it("permite saltarse la historia y llegar a la lista de espera", () => {
    render(<Story />);
    expect(screen.getByRole("link", { name: /Descubre más/ })).toHaveAttribute("href", "#temas");
    expect(screen.getByRole("link", { name: "Recibir alertas" })).toHaveAttribute("href", "#lista-de-espera");
  });

  it("las piezas 3D son decorativas para lectores de pantalla", () => {
    const { container } = render(<Story />);
    for (const pieza of [".cinta", ".plano", ".tablero"]) {
      expect(container.querySelector(pieza)).toHaveAttribute("aria-hidden", "true");
    }
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
