// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MAX_INDICE, TextoEnMovimiento } from "./TextoEnMovimiento";

const indicesDe = (nodos: NodeListOf<Element>) =>
  [...nodos].map((n) => Number(/kx-i-(\d+)/.exec(n.className)![1]));

describe("TextoEnMovimiento", () => {
  it("conserva el nombre accesible del titular y oculta la copia partida a los lectores de pantalla", () => {
    const { container } = render(
      <TextoEnMovimiento como="h1" texto="Del horizonte al mercado." efecto="letras" disparo="carga" />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeInTheDocument();
    expect(container.querySelector(".sr-only")).toHaveTextContent("Del horizonte al mercado.");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("Del horizonte al mercado.");
  });

  it("letras: una unidad por letra, envuelta por palabra y con índices consecutivos", () => {
    const { container } = render(<TextoEnMovimiento como="h1" texto="Del mar." efecto="letras" disparo="carga" />);
    expect(container.querySelectorAll(".kx-m")).toHaveLength(2);
    const letras = container.querySelectorAll(".kx-l");
    expect([...letras].map((l) => l.textContent).join("")).toBe("Delmar.");
    expect(indicesDe(letras)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("palabras: una unidad por palabra con máscara", () => {
    const { container } = render(
      <TextoEnMovimiento como="h2" texto="Quién gana, quién pierde." efecto="palabras" disparo="scroll" />,
    );
    expect(container.querySelectorAll(".kx-m")).toHaveLength(4);
    expect(indicesDe(container.querySelectorAll(".kx-p"))).toEqual([0, 1, 2, 3]);
  });

  it("lectura: palabras sin máscara", () => {
    const { container } = render(
      <TextoEnMovimiento texto="Te avisamos antes de la apertura." efecto="lectura" disparo="scroll" />,
    );
    expect(container.querySelectorAll(".kx-m")).toHaveLength(0);
    expect(indicesDe(container.querySelectorAll(".kx-w"))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("aplica las clases de efecto, disparo y las del llamador, y el id", () => {
    const { container } = render(
      <TextoEnMovimiento como="h2" id="titulo" className="titular" texto="Hola" efecto="palabras" disparo="scroll" />,
    );
    const h2 = container.querySelector("h2")!;
    expect(h2).toHaveAttribute("id", "titulo");
    expect(h2.className).toBe("kx kx-palabras kx-scroll titular");
  });

  it("normaliza espacios y saltos de línea", () => {
    const { container } = render(
      <TextoEnMovimiento texto={"  uno \n  dos   tres "} efecto="lectura" disparo="carga" />,
    );
    expect([...container.querySelectorAll(".kx-w")].map((w) => w.textContent)).toEqual(["uno", "dos", "tres"]);
  });

  it("satura el índice en el tope en lugar de salirse del CSS", () => {
    const largo = "a".repeat(MAX_INDICE + 20);
    const { container } = render(<TextoEnMovimiento texto={largo} efecto="letras" disparo="carga" />);
    const indices = indicesDe(container.querySelectorAll(".kx-l"));
    expect(Math.max(...indices)).toBe(MAX_INDICE);
    expect(indices).toHaveLength(MAX_INDICE + 20);
  });

  it("no usa atributos style (la CSP los bloquea)", () => {
    const { container } = render(<TextoEnMovimiento texto="Sin estilos en línea" efecto="palabras" disparo="scroll" />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
