import { describe, expect, it } from "vitest";
import { motivosParaNoPublicar } from "@/lib/domain/rules";
import { alertasEjemplo, enlacesEjemplo, fuentesEjemplo, vistaEjemplo, vistasEjemplo } from "./ejemplo";

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
});
