// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { vistaEjemplo } from "@/data/ejemplo";
import type { AlertView } from "@/lib/domain/view";
import { AlertCard } from "./AlertCard";

const ormuz = vistaEjemplo("ejemplo-ormuz");
const cobre = vistaEjemplo("ejemplo-cobre");

function retractada(): AlertView {
  return {
    ...ormuz,
    estado: "retractada",
    correcciones: [
      {
        id: "r1",
        alert_id: ormuz.id,
        fecha: "2026-10-09T09:00:00-03:00",
        texto_publico: "El organismo emisor desmintió el hecho.",
        tipo: "retractacion",
      },
    ],
  };
}

describe("AlertCard", () => {
  it("muestra el evento como título y la marca de datos de ejemplo", () => {
    render(<AlertCard alerta={ormuz} />);
    expect(screen.getByRole("heading", { level: 3, name: ormuz.evento })).toBeInTheDocument();
    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
  });

  it("lista cada fila con dirección en texto, no solo color", () => {
    render(<AlertCard alerta={ormuz} />);
    const filas = within(screen.getByRole("list", { name: "Quién gana y quién pierde" })).getAllByRole(
      "listitem",
    );
    expect(filas).toHaveLength(ormuz.filas.length);
    expect(within(filas[0]).getByText("Gana")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Condicionado")).toBeInTheDocument();
    expect(within(filas[2]).getByText("Pierde")).toBeInTheDocument();
  });

  it("muestra la fila 'Confianza · fuentes · verificación'", () => {
    render(<AlertCard alerta={ormuz} />);
    expect(screen.getByText("Confianza alta")).toBeInTheDocument();
    expect(screen.getByText("2 fuentes")).toBeInTheDocument();
    expect(screen.getByText("Fuente oficial")).toBeInTheDocument();
  });

  it("la insignia de confianza usa texto y forma, no solo color", () => {
    const { container } = render(<AlertCard alerta={cobre} />);
    const insignia = container.querySelector('[data-confianza="baja"]');
    expect(insignia).toHaveTextContent("Confianza baja");
    expect(insignia?.querySelector("svg")).toHaveAttribute("data-barras-llenas", "1");
  });

  it("acota la confianza de cada fila a la de la alerta", () => {
    render(<AlertCard alerta={cobre} />);
    const primera = within(screen.getByRole("list", { name: "Quién gana y quién pierde" })).getAllByRole(
      "listitem",
    )[0];
    expect(primera).toHaveTextContent("Confianza baja");
    expect(primera).not.toHaveTextContent("Confianza alta");
  });

  it("enlaza las fuentes en una pestaña nueva sin filtrar el origen", async () => {
    const user = userEvent.setup();
    render(<AlertCard alerta={ormuz} />);
    await user.click(screen.getByText("Fuentes (2)"));
    const enlaces = screen.getAllByRole("link", { name: /se abre en una pestaña nueva/ });
    expect(enlaces).toHaveLength(2);
    for (const enlace of enlaces) {
      expect(enlace).toHaveAttribute("target", "_blank");
      expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
      expect(enlace.getAttribute("href")).toMatch(/^https:\/\//);
    }
    expect(screen.getByText(/Agencia energética internacional \(ejemplo\)/)).toBeInTheDocument();
  });

  it("no genera enlaces para URLs que no son https, aunque lleguen a la vista", () => {
    const peligrosa: AlertView = {
      ...ormuz,
      fuentes: [{ ...ormuz.fuentes[0], url: "javascript:alert(1)", titulo: "Documento" }],
    };
    const { container } = render(<AlertCard alerta={peligrosa} />);
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText("Documento")).toBeInTheDocument();
  });

  it("escapa el texto: no interpreta HTML de los datos", () => {
    const { container } = render(
      <AlertCard alerta={{ ...ormuz, evento: '<img src=x onerror="alert(1)">' }} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it("estado corregida: muestra 'Corregida el' con enlace al texto de la corrección", () => {
    render(<AlertCard alerta={cobre} />);
    const enlace = screen.getByRole("link", { name: /Corregida el/ });
    const destino = enlace.getAttribute("href")!.slice(1);
    const seccion = document.getElementById(destino);
    expect(seccion).not.toBeNull();
    expect(seccion).toHaveTextContent(cobre.correcciones[0].texto_publico);
  });

  it("estado retractada: aviso arriba y contenido tachado, sin borrarlo", () => {
    const { container } = render(<AlertCard alerta={retractada()} />);
    const aviso = screen.getByRole("note");
    expect(aviso).toHaveTextContent("Alerta retractada el");
    expect(aviso).toHaveTextContent("El organismo emisor desmintió el hecho.");
    // El aviso va antes del título.
    const titulo = screen.getByRole("heading", { level: 3 });
    expect(aviso.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(titulo.querySelector("s")).toHaveTextContent(ormuz.evento);
    expect(container.querySelector(".line-through")).toHaveTextContent(ormuz.filas[0].sector);
  });

  it("es navegable con teclado: el desplegable y sus enlaces reciben foco", async () => {
    const user = userEvent.setup();
    render(<AlertCard alerta={ormuz} />);
    const resumen = screen.getByText("Fuentes (2)");
    await user.tab();
    expect(resumen).toHaveFocus();
    await user.click(resumen);
    await user.tab();
    expect(screen.getAllByRole("link", { name: /pestaña nueva/ })[0]).toHaveFocus();
  });

  it("respeta el nivel de título indicado", () => {
    render(<AlertCard alerta={cobre} nivelTitulo={2} />);
    expect(screen.getByRole("heading", { level: 2, name: cobre.evento })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Correcciones" })).toBeInTheDocument();
  });
});
