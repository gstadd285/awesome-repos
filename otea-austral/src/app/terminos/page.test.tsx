// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { VIGENCIA_ENLACE_MS } from "@/lib/waitlist/service";
import { VERSION_CONSENTIMIENTO } from "@/lib/waitlist/schema";
import TerminosPage, { metadata } from "./page";

describe("página de condiciones de uso", () => {
  it("se llama «Condiciones de uso» en el título, la ruta de navegación y el titular", () => {
    render(<TerminosPage />);
    expect(metadata.title).toBe("Condiciones de uso");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.querySelector(".sr-only")).toHaveTextContent("Condiciones de uso.");
    expect(screen.getByRole("navigation", { name: /ruta/i })).toHaveTextContent("Condiciones de uso");
  });

  it("sigue siendo un texto provisional, y lo dice a la vista", () => {
    render(<TerminosPage />);
    expect(screen.getByRole("note")).toHaveTextContent("Texto provisional · pendiente de revisión legal");
  });

  it("tiene sus doce apartados numerados, en orden y sin repetir", () => {
    render(<TerminosPage />);
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      "Qué es Otea Austral",
      "No es asesoría financiera",
      "Exactitud y correcciones",
      "Datos de ejemplo",
      "Contenido de terceros",
      "Asistente de preguntas",
      "Lista de espera y verificación en dos pasos",
      "Uso aceptable",
      "Marca y textos",
      "Disponibilidad y responsabilidad",
      "Ley aplicable y contacto",
      "Cambios",
    ]);
    const numeros = [...document.querySelectorAll("section .contador")].map((n) => n.textContent).filter((t) => /^\d\d$/.test(t ?? ""));
    expect(numeros).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")));
  });

  it("deja claro que no es asesoría financiera", () => {
    render(<TerminosPage />);
    expect(screen.getByRole("region", { name: "No es asesoría financiera" })).toHaveTextContent(
      "Información y análisis. No constituye asesoría financiera.",
    );
  });

  it("explica el asistente: sin IA hoy, la IA marcada y revisada si se activa, sin consejos, sin datos personales", () => {
    render(<TerminosPage />);
    const asistente = screen.getByRole("region", { name: "Asistente de preguntas" });
    expect(asistente).toHaveTextContent("Hoy lo hace sin inteligencia artificial");
    expect(asistente).toHaveTextContent("«Respuesta con IA»");
    expect(asistente).toHaveTextContent("cada frase se revisa antes de mostrarse");
    expect(asistente).toHaveTextContent("No da consejos de inversión ni pronósticos de precios");
    expect(asistente).toHaveTextContent("No escribas datos personales");
    expect(within(asistente).getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/privacidad");
  });

  it("describe la verificación en dos pasos tal como funciona la lista de espera (enlace de 72 horas)", () => {
    render(<TerminosPage />);
    const lista = screen.getByRole("region", { name: "Lista de espera y verificación en dos pasos" });
    expect(lista).toHaveTextContent("se verifica en dos pasos");
    expect(lista).toHaveTextContent("vence a las 72 horas");
    expect(VIGENCIA_ENLACE_MS).toBe(72 * 60 * 60_000);
    expect(lista).toHaveTextContent("Sin esa confirmación no quedas inscrito");
  });

  it("muestra la versión que queda registrada con el consentimiento", () => {
    render(<TerminosPage />);
    const cambios = screen.getByRole("region", { name: "Cambios" });
    expect(cambios).toHaveTextContent(VERSION_CONSENTIMIENTO);
  });

  it("los apartados nuevos no usan lenguaje de recomendación ni prometen rentabilidad", () => {
    render(<TerminosPage />);
    for (const nombre of ["Asistente de preguntas", "Lista de espera y verificación en dos pasos", "Uso aceptable", "Marca y textos", "Disponibilidad y responsabilidad", "Ley aplicable y contacto", "Cambios"]) {
      const texto = screen.getByRole("region", { name: nombre }).textContent ?? "";
      expect(frasesProhibidas(texto), nombre).toEqual([]);
    }
  });

  it("no promete lo que aún no existe: la ley aplicable y el contacto se publicarán", () => {
    render(<TerminosPage />);
    expect(screen.getByRole("region", { name: "Ley aplicable y contacto" })).toHaveTextContent("se publicarán aquí");
  });

  it("no deja atributos style (la CSP los bloquea)", () => {
    const { container } = render(<TerminosPage />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
