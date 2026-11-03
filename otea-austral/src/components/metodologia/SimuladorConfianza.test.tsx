// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SimuladorConfianza } from "./SimuladorConfianza";

const BANCO = [
  { id: "p", organismo: "Agencia (ejemplo)", tipo: "primaria" as const },
  { id: "n", organismo: "Noticias (ejemplo)", tipo: "prensa" as const },
  { id: "s", organismo: "Centro (ejemplo)", tipo: "secundaria" as const },
  { id: "d", organismo: "Diario (ejemplo)", tipo: "prensa" as const },
];
const FILAS = [
  { sector: "Aerolíneas", declarada: "alta" as const },
  { sector: "Navieras", declarada: "media" as const },
];

describe("simulador de confianza (reglas reales)", () => {
  it("parte del estado del servidor y, al quitar la primaria, baja de alta a baja citando la regla y acota las filas", () => {
    const { container } = render(<SimuladorConfianza banco={BANCO} inicial={["p", "n"]} filas={FILAS} />);
    const vivo = container.querySelector("[aria-live]")!;
    expect(vivo).toHaveTextContent("Confianza alta");
    expect(vivo).toHaveTextContent("regla 1");
    const primaria = screen.getByRole("button", { name: /Agencia/ });
    expect(primaria).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(primaria);
    expect(primaria).toHaveAttribute("aria-pressed", "false");
    expect(vivo).toHaveTextContent("Confianza baja");
    expect(vivo).toHaveTextContent("Solo prensa y de un solo organismo");
    const fila = screen.getByRole("row", { name: /Aerolíneas/ });
    expect(within(fila).getAllByRole("cell").map((c) => c.textContent)).toEqual(["alta", "baja (acotada)"]);
    // Dos prensas de organismos distintos: media (regla 2), y ya podría ser impacto alto.
    fireEvent.click(screen.getByRole("button", { name: /Diario/ }));
    expect(vivo).toHaveTextContent("Confianza media");
    expect(screen.getByText(/Dos organismos distintos: sí/)).toBeInTheDocument();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
