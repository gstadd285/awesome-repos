import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { contarOrganismosDistintos, motivosInvariantesPublicada, motivosParaNoPublicar } from "@/lib/domain/rules";
import { TEMAS } from "@/lib/domain/temas";
import {
  ESCENARIOS_PORTADA,
  alertasEjemplo,
  enlacesEjemplo,
  fuentesEjemplo,
  vistaEjemplo,
  vistaSinPrimaria,
  vistasEjemplo,
  vistasPortada,
} from "./ejemplo";

const NUEVAS = ["ejemplo-energia", "ejemplo-planta-chips", "ejemplo-divisas"];

describe("datos de ejemplo", () => {
  it("todas las alertas están marcadas como ejemplo", () => {
    expect(alertasEjemplo.every((a) => a.es_ejemplo)).toBe(true);
  });

  it("ningún enlace apunta a una fuente real", () => {
    const urls = [...enlacesEjemplo.map((e) => e.url), ...fuentesEjemplo.map((f) => f.url_base)];
    for (const url of urls) {
      expect(new URL(url).hostname).toBe("example.org");
    }
  });

  it("los organismos se nombran como ejemplo", () => {
    expect(fuentesEjemplo.every((f) => f.organismo.includes("(ejemplo)"))).toBe(true);
  });

  it("muestran los tres niveles de confianza calculada", () => {
    expect(vistaEjemplo("ejemplo-ormuz").confianza).toBe("alta");
    expect(vistaEjemplo("ejemplo-chips").confianza).toBe("media");
    expect(vistaEjemplo("ejemplo-cobre").confianza).toBe("baja");
  });

  it("la fila declarada alta se muestra acotada a la confianza de la alerta", () => {
    const fila = vistaEjemplo("ejemplo-cobre").filas[0];
    expect(fila.confianza).toBe("alta");
    expect(fila.confianza_mostrada).toBe("baja");
  });

  it("la alerta de impacto alto cumple el requisito de dos organismos", () => {
    const ormuz = vistasEjemplo.find((v) => v.impacto === "alto")!;
    const motivos = motivosParaNoPublicar(
      { ...alertasEjemplo.find((a) => a.id === ormuz.id)!, estado: "en_revision" },
      ormuz.fuentes,
      [],
    );
    // Solo falta la aprobación humana, que los datos de ejemplo no simulan.
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/aprobación/);
  });

  it("hay un escenario de ejemplo por cada uno de los seis temas («Tu mañana» puede filtrar cualquiera)", () => {
    expect(new Set(alertasEjemplo.map((a) => a.tema))).toEqual(new Set(TEMAS));
  });

  it("las tres alertas nuevas cubren Energía, Chips y Divisas, cada una con al menos una fila por dirección", () => {
    const nuevas = NUEVAS.map((id) => alertasEjemplo.find((a) => a.id === id)!);
    expect(nuevas.map((a) => a.tema)).toEqual(["energia", "chips", "divisas"]);
    for (const a of nuevas) {
      expect(a.es_ejemplo, a.id).toBe(true);
      expect(new Set(a.filas.map((f) => f.direccion)), a.id).toEqual(new Set(["gana", "condicionado", "pierde"]));
      expect(enlacesEjemplo.filter((e) => e.alert_id === a.id).length, a.id).toBeGreaterThan(0);
    }
  });

  it("todo texto de ejemplo es condicional, sin recomendaciones ni cifras que parezcan de mercado", () => {
    for (const a of alertasEjemplo) {
      expect(a.resumen, a.id).toMatch(/^Escenario de ejemplo: /);
      const textos = [a.evento, a.resumen, ...a.filas.flatMap((f) => [f.sector, f.condicion])];
      for (const t of textos) {
        expect(frasesProhibidas(t), t).toEqual([]);
        // Ningún número: un precio, un porcentaje o una fecha inventada se leerían como datos reales.
        expect(t, a.id).not.toMatch(/\d/);
      }
      for (const f of a.filas) expect(f.condicion, `${a.id} · ${f.sector}`).toMatch(/^(Si|Según|Depende|Fletes)\b/);
    }
  });

  it("la portada elige sus tres escenarios por id: sumar ejemplos no cambia la historia, el tablero ni la vitrina", () => {
    expect(vistasPortada.map((v) => v.id)).toEqual([...ESCENARIOS_PORTADA]);
    expect(vistasEjemplo.length).toBeGreaterThan(vistasPortada.length);
  });

  it("sin su fuente primaria, Ormuz baja a confianza baja y ya no sostiene el impacto alto (reglas reales)", () => {
    const sin = vistaSinPrimaria("ejemplo-ormuz");
    expect(sin.confianza).toBe("baja");
    expect(sin.nivel_verificacion).toBe("una_fuente");
    expect(sin.fuentes.every((f) => f.tipo !== "primaria")).toBe(true);
    expect(contarOrganismosDistintos(sin.fuentes)).toBe(1);
    // La fila de Aerolíneas, declarada alta, queda acotada a baja.
    expect(sin.filas.find((f) => f.sector === "Aerolíneas")!.confianza_mostrada).toBe("baja");
    expect(motivosInvariantesPublicada(alertasEjemplo.find((a) => a.id === "ejemplo-ormuz")!, sin.fuentes)).toContain(
      "Impacto alto exige dos fuentes de organismos distintos.",
    );
  });
});
