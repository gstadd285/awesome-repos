import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as respaldo from "./respaldo";
import * as reglas from "./rules";
import { Confianza, NivelVerificacion, TipoFuente } from "./schemas";

describe("respaldo.ts: las reglas de confianza sin dependencias", () => {
  it("rules.ts reexporta las mismas funciones, no copias", () => {
    for (const nombre of [
      "normalizarOrganismo",
      "contarOrganismosDistintos",
      "calcularConfianza",
      "calcularNivelVerificacion",
      "acotarConfianza",
    ] as const) {
      expect(reglas[nombre], nombre).toBe(respaldo[nombre]);
    }
  });

  it("no importa nada (el simulador de /metodologia lo lleva al navegador sin Zod)", () => {
    const codigo = readFileSync(join(process.cwd(), "src/lib/domain/respaldo.ts"), "utf8");
    expect(codigo).not.toMatch(/^\s*import\s/m);
  });

  it("sus uniones de tipos coinciden con los enums de Zod", () => {
    // Si un enum de `schemas.ts` cambia, estas asignaciones dejan de compilar o la prueba falla.
    const confianzas: respaldo.Confianza[] = ["baja", "media", "alta"];
    const niveles: respaldo.NivelVerificacion[] = ["sin_verificar", "una_fuente", "dos_fuentes", "fuente_oficial"];
    const tipos: respaldo.TipoFuente[] = ["primaria", "secundaria", "prensa"];
    expect(Confianza.options).toEqual(confianzas);
    expect(NivelVerificacion.options).toEqual(niveles);
    expect(TipoFuente.options).toEqual(tipos);
    const ida: Confianza[] = confianzas;
    const vuelta: respaldo.Confianza[] = Confianza.options;
    expect(ida).toEqual(vuelta);
  });

  it("calcula como dicen las reglas 1, 2 y 6", () => {
    const { calcularConfianza, calcularNivelVerificacion, acotarConfianza } = respaldo;
    expect(calcularConfianza([])).toBe("baja");
    expect(calcularConfianza([{ tipo: "primaria", organismo: "A" }])).toBe("alta");
    expect(calcularConfianza([{ tipo: "secundaria", organismo: "A" }])).toBe("media");
    expect(calcularConfianza([{ tipo: "prensa", organismo: "A" }, { tipo: "prensa", organismo: " a " }])).toBe("baja");
    expect(calcularConfianza([{ tipo: "prensa", organismo: "A" }, { tipo: "prensa", organismo: "B" }])).toBe("media");
    expect(calcularNivelVerificacion([{ tipo: "prensa", organismo: "Á" }, { tipo: "prensa", organismo: "a" }])).toBe("una_fuente");
    expect(acotarConfianza("alta", "baja")).toBe("baja");
    expect(acotarConfianza("baja", "alta")).toBe("baja");
  });
});
