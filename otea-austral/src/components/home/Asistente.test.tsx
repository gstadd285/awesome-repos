// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PREGUNTAS_SUGERIDAS, entradaPorId } from "@/lib/asistente/conocimiento";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { NAV_CABECERA, NAV_PRINCIPAL } from "@/components/layout/navigation";
import { Asistente } from "./Asistente";

describe("Asistente (sección de la portada)", () => {
  it("es la sección #preguntas, con su titular y el chat dentro", () => {
    render(<Asistente modo="base" />);
    const seccion = document.getElementById("preguntas");
    expect(seccion).not.toBeNull();
    expect(seccion).toHaveAttribute("aria-labelledby", "preguntas-titulo");
    const titulo = document.getElementById("preguntas-titulo");
    expect(titulo?.querySelector(".sr-only")).toHaveTextContent("Resuelve tus dudas.");
    expect(within(seccion as HTMLElement).getByRole("log", { name: "Conversación con el asistente" })).toBeInTheDocument();
  });

  it("ofrece como atajos las preguntas sugeridas de la base", () => {
    render(<Asistente modo="base" />);
    const registro = screen.getByRole("log");
    for (const { texto } of PREGUNTAS_SUGERIDAS) {
      expect(within(registro).getByRole("button", { name: texto })).toBeInTheDocument();
    }
  });

  it.each(["base", "ia"] as const)("en modo %s promete lo mismo: nada de consejos, pronósticos ni guardar preguntas", (modo) => {
    render(<Asistente modo={modo} />);
    const compromisos = screen.getByRole("list", { name: "Cómo funciona el asistente" });
    expect(compromisos).toHaveTextContent(/No da consejos de inversión ni pronósticos de precios/);
    expect(compromisos).toHaveTextContent(/No guardamos tus preguntas/);
    expect(frasesProhibidas(compromisos.textContent ?? "")).toEqual([]);
  });

  it("dice la verdad sobre la IA según el modo", () => {
    const { unmount } = render(<Asistente modo="base" />);
    const base = screen.getByRole("list", { name: "Cómo funciona el asistente" }).textContent;
    expect(base).toMatch(/No usa IA/);
    unmount();
    render(<Asistente modo="ia" />);
    const ia = screen.getByRole("list", { name: "Cómo funciona el asistente" }).textContent;
    expect(ia).toMatch(/Una IA redacta la respuesta/);
    expect(ia).not.toMatch(/No usa IA/);
  });

  it("sin JavaScript se leen las respuestas más pedidas (bloque noscript, solo en el HTML del servidor)", () => {
    const html = renderToString(<Asistente modo="base" />);
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
    expect(noscript).toContain("El asistente necesita JavaScript.");
    for (const { entrada } of PREGUNTAS_SUGERIDAS) {
      const e = entradaPorId(entrada)!;
      // El HTML escapa las comillas y los signos; se compara contra el texto de la pregunta tal cual está en la base.
      const documento = new DOMParser().parseFromString(`<body>${noscript}</body>`, "text/html");
      expect(documento.body.textContent).toContain(e.pregunta);
      expect(documento.body.textContent).toContain(e.respuesta.slice(0, 40));
    }
  });

  it("no deja atributos style y los textos cumplen las reglas de lenguaje", () => {
    const { container } = render(<Asistente modo="ia" />);
    expect(container.querySelector("[style]")).toBeNull();
    expect(frasesProhibidas(container.textContent ?? "")).toEqual([]);
  });
});

describe("navegación", () => {
  it("el pie y el menú enlazan la sección de preguntas, la cabecera no se llena", () => {
    expect(NAV_PRINCIPAL).toContainEqual({ href: "/#preguntas", texto: "Preguntas" });
    expect(NAV_CABECERA.map((e) => e.href)).not.toContain("/#preguntas");
    expect(NAV_CABECERA).toHaveLength(4);
  });
});
