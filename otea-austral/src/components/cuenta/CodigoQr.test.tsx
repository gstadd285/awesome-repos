// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { crearQr, rutaSvgQr } from "@/lib/cuentas/qr";
import { CodigoQr } from "./CodigoQr";

describe("CodigoQr", () => {
  const { ruta, lado } = rutaSvgQr(crearQr("otpauth://totp/Otea%20Austral:persona%40correo.cl?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Otea%20Austral"));

  it("es una imagen con nombre accesible y no es decorativa", () => {
    render(<CodigoQr ruta={ruta} lado={lado} etiqueta="Código QR para agregar Otea Austral" />);
    const svg = screen.getByRole("img", { name: "Código QR para agregar Otea Austral" });
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${lado} ${lado}`);
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("pinta módulos negros sobre fondo blanco con atributos del SVG: la paleta de Tailwind del sitio no tiene `black` ni `white`", () => {
    const { container } = render(<CodigoQr ruta={ruta} lado={lado} etiqueta="QR" />);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("#FFFFFF");
    expect(container.querySelector("path")?.getAttribute("fill")).toBe("#000000");
    // Sin clases de color: sin esos atributos, todo se pintaría del color por omisión y el código saldría como un cuadrado negro.
    expect(container.innerHTML).not.toMatch(/class="[^"]*\b(fill|bg|text)-(white|black)\b/);
  });

  it("no usa atributos `style` (la CSP los bloquea)", () => {
    const { container } = render(<CodigoQr ruta={ruta} lado={lado} etiqueta="QR" />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
