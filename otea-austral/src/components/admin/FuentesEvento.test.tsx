// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FuenteDeEvento } from "@/lib/ingesta/cola-postgres";
import { AvisoSinAccesoPrivado } from "./AvisoSinAccesoPrivado";
import { FuentesEvento } from "./FuentesEvento";

// DATOS DE PRUEBA: organismos «(ejemplo)» y enlaces de example.org.
const BASE: FuenteDeEvento = {
  id: "00000000-0000-4000-8000-000000000001",
  sourceId: "prueba",
  organismo: "Banco de prueba (ejemplo)",
  nombreFuente: "Comunicados (ejemplo)",
  tipo: "primaria",
  titulo: "Decisión de tasa de prueba (ejemplo)",
  url: "https://example.org/comunicados/decision",
  identificador: "folio-1",
  publicado: "2026-10-20T17:30:00.000Z",
  visto: "2026-10-20T18:17:00.000Z",
};

describe("FuentesEvento", () => {
  it("enlaza cada documento oficial en una pestaña nueva, sin opener ni referer, y avisa que se abre aparte", () => {
    render(<FuentesEvento fuentes={[BASE]} />);
    const enlace = screen.getByRole("link", { name: "Decisión de tasa de prueba (ejemplo) (se abre en una pestaña nueva)" });
    expect(enlace).toHaveAttribute("href", "https://example.org/comunicados/decision");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/Banco de prueba \(ejemplo\) · Fuente primaria/)).toBeInTheDocument();
    expect(screen.getByText(/folio-1/)).toBeInTheDocument();
  });

  it("un enlace que no es https se muestra como texto, nunca como enlace (safeHref)", () => {
    render(
      <FuentesEvento
        fuentes={[
          { ...BASE, id: "a", url: "javascript:alert(1)", titulo: "Peligroso (ejemplo)" },
          { ...BASE, id: "b", url: "http://example.org/inseguro", titulo: "Sin https (ejemplo)", publicado: null },
        ]}
      />,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Peligroso (ejemplo)")).toBeInTheDocument();
    expect(screen.getByText(/Sin fecha en el feed/)).toBeInTheDocument();
  });
});

describe("AvisoSinAccesoPrivado", () => {
  it("dice con claridad que no se publiquen alertas reales hasta el acceso privado", () => {
    render(<AvisoSinAccesoPrivado />);
    const aviso = screen.getByRole("note", { name: "Sin acceso privado" });
    expect(aviso).toHaveTextContent("Sin acceso privado, no publiques alertas reales.");
    expect(aviso).toHaveTextContent(/F4/);
  });
});
