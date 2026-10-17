// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONTROLES, FUNCIONES } from "@/lib/security/nist-csf";
import { ControlStatus } from "./ControlStatus";
import { SecurityProfile } from "./SecurityProfile";

const GITHUB = "https://github.com/o/r/security/advisories/new";

describe("SecurityProfile", () => {
  it("presenta el marco y aclara que no es una certificación", () => {
    render(<SecurityProfile contacto={GITHUB} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cómo protegemos Otea Austral" })).toBeInTheDocument();
    expect(screen.getByText(/no es una\s+certificación/)).toBeInTheDocument();
  });

  it("muestra una sección por función con todos sus controles", () => {
    render(<SecurityProfile contacto={GITHUB} />);
    for (const f of FUNCIONES) {
      expect(screen.getByRole("heading", { level: 2, name: new RegExp(`^${f.nombre}`) })).toBeInTheDocument();
    }
    for (const c of CONTROLES) {
      expect(screen.getByRole("heading", { level: 3, name: c.titulo })).toBeInTheDocument();
    }
  });

  it("enlaza cada función con su sección", () => {
    render(<SecurityProfile contacto={GITHUB} />);
    const nav = screen.getByRole("navigation", { name: "Funciones del marco" });
    for (const f of FUNCIONES) {
      const enlace = within(nav).getByRole("link", { name: new RegExp(f.nombre) });
      const destino = enlace.getAttribute("href")!.slice(1);
      expect(document.getElementById(destino)).not.toBeNull();
    }
  });

  it("canal externo: abre en pestaña nueva sin ceder el control", () => {
    render(<SecurityProfile contacto={GITHUB} />);
    const enlace = screen.getByRole("link", { name: /Reportar de forma privada/ });
    expect(enlace).toHaveAttribute("href", GITHUB);
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Canal: formulario privado de GitHub")).toBeInTheDocument();
  });

  it("canal por correo: enlace mailto en la misma pestaña", () => {
    render(<SecurityProfile contacto="mailto:seguridad@oteaustral.com" />);
    const enlace = screen.getByRole("link", { name: "Reportar de forma privada" });
    expect(enlace).toHaveAttribute("href", "mailto:seguridad@oteaustral.com");
    expect(enlace).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "Ver security.txt" })).toHaveAttribute(
      "href",
      "/.well-known/security.txt",
    );
  });
});

describe("ControlStatus", () => {
  it.each([
    ["implementado", "Implementado"],
    ["parcial", "Parcial"],
    ["objetivo", "Objetivo"],
  ] as const)("%s se distingue por texto y forma", (estado, texto) => {
    const { container } = render(<ControlStatus estado={estado} />);
    expect(container.firstChild).toHaveTextContent(texto);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("indica el tercio de un objetivo", () => {
    render(<ControlStatus estado="objetivo" tercio={3} />);
    expect(screen.getByText("Objetivo · tercio 3")).toBeInTheDocument();
  });
});
