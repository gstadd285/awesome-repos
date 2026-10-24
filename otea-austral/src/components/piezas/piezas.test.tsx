// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentPage, Apartado } from "@/components/layout/ContentPage";
import { FUNCIONES } from "@/lib/security/nist-csf";
import { fuentesPorAmbito } from "@/lib/sources/registry";
import { VERSION_CONSENTIMIENTO } from "@/lib/waitlist/schema";
import { Cifra } from "./Cifra";
import { Constelacion } from "./Constelacion";
import { DialCSF } from "./DialCSF";
import { Radar } from "./Radar";
import { Sello, fechaDeVersion } from "./Sello";

// La cabecera y el pie leen la sesión de la cuenta (un componente asíncrono de servidor): aquí no hay servidor.
vi.mock("@/components/layout/EnlaceCuenta", () => ({ EnlaceCuenta: () => null }));

describe("cifras de rodillo", () => {
  it("el número se lee una sola vez: texto real y un rodillo decorativo que termina en cada dígito", () => {
    const { container } = render(<Cifra valor={17} />);
    expect(container.querySelector(".cifra-texto")).toHaveTextContent("17");
    const rodillo = container.querySelector(".cifra-rodillo")!;
    expect(rodillo).toHaveAttribute("aria-hidden", "true");
    const columnas = [...rodillo.querySelectorAll(".cifra-col")].map((c) => c.textContent!.split("\n"));
    expect(columnas.map((c) => c.length)).toEqual([20, 20]);
    expect(columnas.map((c) => c.at(-1))).toEqual(["1", "7"]);
    expect(container.textContent).toContain("17");
  });
});

describe("piezas de las interiores", () => {
  it("son SVG decorativos, sin atributos style", () => {
    const grupos = fuentesPorAmbito().map((g) => ({ titulo: g.titulo, fuentes: g.fuentes.map((f) => ({ id: f.id, tipo: f.tipo })) }));
    for (const pieza of [<Radar key="r" rotulo="Sin alertas publicadas" />, <Constelacion key="c" grupos={grupos} />, <Sello key="s" documento="Privacidad" version={VERSION_CONSENTIMIENTO} />]) {
      const { container, unmount } = render(pieza);
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(container.querySelector("[style]")).toBeNull();
      unmount();
    }
  });

  it("la constelación dibuja un punto por fuente activa del registro y cuenta cada tipo", () => {
    const grupos = fuentesPorAmbito();
    const total = grupos.reduce((t, g) => t + g.fuentes.length, 0);
    const { container } = render(
      <Constelacion grupos={grupos.map((g) => ({ titulo: g.titulo, fuentes: g.fuentes.map((f) => ({ id: f.id, tipo: f.tipo })) }))} />,
    );
    expect(container.querySelectorAll("circle.estrella")).toHaveLength(total);
    expect(container.textContent).toContain(`PRIMARIA · ${total}`);
  });

  it("la constelación es una red y no un gráfico: cada fuente se une solo a su ámbito, a la misma distancia", () => {
    const grupos = fuentesPorAmbito();
    const { container } = render(
      <Constelacion grupos={grupos.map((g) => ({ titulo: g.titulo, fuentes: g.fuentes.map((f) => ({ id: f.id, tipo: f.tipo })) }))} />,
    );
    const vinculos = [...container.querySelectorAll("path.vinculo")].map((v) => v.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number));
    expect(vinculos).toHaveLength(grupos.reduce((t, g) => t + g.fuentes.length, 0));
    // Un solo segmento por vínculo (del nudo del ámbito a la fuente), nunca una línea que una fuentes entre sí.
    for (const v of vinculos) expect(v).toHaveLength(4);
    const nudos = new Set(vinculos.map(([x, y]) => `${x},${y}`));
    expect(nudos.size).toBe(grupos.length);
    const distancias = new Set(vinculos.map(([x0, y0, x1, y1]) => Math.round(Math.hypot(x1 - x0, y1 - y0))));
    expect(distancias.size).toBe(1);
  });

  it("el sello muestra la versión real del texto y la fecha que ella declara; sin versión, solo «provisional»", () => {
    expect(fechaDeVersion("2026-10-borrador-3")).toBe("octubre de 2026");
    expect(fechaDeVersion("borrador")).toBeUndefined();
    render(<Sello documento="Condiciones de uso" version={VERSION_CONSENTIMIENTO} />);
    expect(screen.getByText(new RegExp(`Versión ${VERSION_CONSENTIMIENTO}`))).toBeInTheDocument();
    const { container } = render(<Sello documento="Aviso legal" />);
    expect(container.querySelector("figcaption")).toHaveTextContent("Texto provisional");
  });

  it("el dial del CSF enlaza cada una de las seis funciones con su bloque", () => {
    render(<DialCSF />);
    const nav = screen.getByRole("navigation", { name: "Funciones del marco" });
    for (const f of FUNCIONES) {
      const enlace = within(nav).getByRole("link", { name: `${f.nombre} ${f.codigo}` });
      expect(enlace).toHaveAttribute("href", `#funcion-${f.codigo.toLowerCase()}`);
      // El nombre sale del texto visible (axe: `label-content-name-mismatch` con un `aria-label` aparte).
      expect(enlace).not.toHaveAttribute("aria-label");
    }
  });
});

describe("ContentPage", () => {
  it("arma el índice con los apartados (número, título y ancla) y pone la pieza y las cifras junto al titular", () => {
    const { container } = render(
      <ContentPage ruta="/x" rotulo="X" titulo="Título." pieza={<Radar rotulo="Prueba" />} cifras={[{ valor: 3, rotulo: "niveles" }]} indice>
        <Apartado numero="01" titulo="Uno">
          <p>a</p>
        </Apartado>
        <Apartado numero="02" titulo="Dos">
          <p>b</p>
        </Apartado>
      </ContentPage>,
    );
    const indice = screen.getByRole("navigation", { name: "En esta página" });
    expect([...indice.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.textContent])).toEqual([
      ["#apartado-01", "01Uno"],
      ["#apartado-02", "02Dos"],
    ]);
    for (const a of indice.querySelectorAll("a")) expect(document.getElementById(a.getAttribute("href")!.slice(1))).not.toBeNull();
    expect(container.querySelector(".int-pieza svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".cifra-texto")).toHaveTextContent("3");
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("el simulador de confianza solo importa React y las reglas sin dependencias (nada de Zod en el navegador)", () => {
    const codigo = readFileSync(join(process.cwd(), "src/components/metodologia/SimuladorConfianza.tsx"), "utf8");
    expect(codigo.startsWith('"use client";')).toBe(true);
    const importaciones = [...codigo.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(importaciones.sort()).toEqual(["@/lib/domain/respaldo", "react"]);
  });
});
