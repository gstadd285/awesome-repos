// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorGlobal from "./global-error";
import ErrorPagina from "./error";

const secreto = "password authentication failed for user otea_web at db.internal:5432";
const error = Object.assign(new Error(secreto), { digest: "1234567890" });

describe("páginas de error", () => {
  it("la de página no muestra el mensaje del error, sí la referencia, y permite reintentar", async () => {
    const retry = vi.fn();
    const { container } = render(<ErrorPagina error={error} retry={retry} />);
    expect(container.textContent).not.toContain("otea_web");
    expect(container.textContent).not.toContain("db.internal");
    expect(screen.getByText("Referencia: 1234567890")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("la global tampoco filtra el mensaje y funciona sin referencia", () => {
    const { container } = render(<ErrorGlobal error={new Error(secreto)} retry={() => {}} />);
    expect(container.textContent).not.toContain("otea_web");
    expect(container.textContent).not.toContain("Referencia");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("No pudimos cargar el sitio.");
  });
});
