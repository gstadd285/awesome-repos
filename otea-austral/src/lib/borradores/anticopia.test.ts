import { describe, expect, it } from "vitest";
import { compararCopia, esCopia, palabras, PROPORCION_MAXIMA, TRAMO_MAXIMO, tramoComun } from "./anticopia";

// TEXTO DE PRUEBA: un comunicado sintético (ejemplo), no copia de ningún organismo real.
const FUENTE = `El Consejo del Banco Central de prueba (ejemplo) acordó por unanimidad mantener la tasa de política monetaria en 5,25 %.
La decisión considera que la inflación subyacente ha disminuido de manera gradual durante el último trimestre y que las
expectativas a dos años se mantienen cerca de la meta. El Consejo reiteró que los próximos movimientos dependerán de la
evolución del escenario macroeconómico y de sus implicancias para la convergencia inflacionaria.`;

describe("anticopia (§4.5, paso 5)", () => {
  it("normaliza sin tildes, en minúsculas y solo con letras y números", () => {
    expect(palabras("¡Decisión: TASA del 5,25 %!")).toEqual(["decision", "tasa", "del", "5", "25"]);
  });

  it("calcula la secuencia común más larga de palabras", () => {
    expect(tramoComun(palabras("a b c d e"), palabras("x b c d y"))).toBe(3);
    expect(tramoComun([], palabras("a"))).toBe(0);
  });

  it("una copia literal se rechaza por el tramo y por la proporción", () => {
    const r = compararCopia([FUENTE.slice(0, 300)], [FUENTE]);
    expect(r.tramo).toBeGreaterThan(TRAMO_MAXIMO);
    expect(r.proporcion).toBeGreaterThan(PROPORCION_MAXIMA);
    expect(esCopia(r)).toBe(true);
  });

  it("una sola frase copiada dentro de un texto propio se rechaza por el tramo", () => {
    const campo =
      "El banco de prueba dejó su tasa sin cambios. La decisión considera que la inflación subyacente ha disminuido de manera gradual.";
    const r = compararCopia([campo], [FUENTE]);
    expect(r.tramo).toBeGreaterThanOrEqual(10);
    expect(esCopia(r)).toBe(true);
  });

  it("una paráfrasis con palabras propias pasa", () => {
    const resumen =
      "El banco central de prueba dejó su tasa de referencia sin cambios. Según el comunicado, la inflación de fondo viene bajando " +
      "y las expectativas siguen ancladas; los pasos siguientes dependerían de cómo evolucione la economía.";
    const r = compararCopia([resumen, "Si la inflación sigue cediendo, podría abrirse espacio para recortes."], [FUENTE]);
    expect(esCopia(r)).toBe(false);
    expect(r.tramo).toBeLessThanOrEqual(TRAMO_MAXIMO);
  });

  it("los nombres propios largos no cuentan como copia", () => {
    const nombre = "Reunión de Política Monetaria del Banco Central de Chile";
    const fuente = `Comunicado de la ${nombre} (ejemplo): el Consejo decidió mantener la tasa.`;
    const campos = [
      `Tras la ${nombre}, la tasa de referencia quedó igual que el mes anterior según el texto de prueba.`,
      "Los bancos podrían ver márgenes estables si la tasa se mantiene en los próximos meses del año.",
    ];
    const r = compararCopia(campos, [fuente]);
    expect(r.tramo).toBeLessThan(10);
    expect(esCopia(r)).toBe(false);
  });

  it("sin texto de las fuentes no hay nada que comparar", () => {
    expect(compararCopia(["Cualquier texto propio de prueba."], [])).toEqual({ tramo: 0, proporcion: 0 });
    expect(compararCopia(["Cualquier texto propio de prueba."], ["", "  "])).toEqual({ tramo: 0, proporcion: 0 });
  });

  it("una secuencia no cruza de un campo a otro", () => {
    const fuente = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce";
    const r = compararCopia(["uno dos tres cuatro cinco seis", "siete ocho nueve diez once doce"], [fuente]);
    expect(r.tramo).toBe(6);
    expect(esCopia(r)).toBe(true); // por la proporción: todo lo del borrador está en la fuente
  });

  it("con el tamaño máximo (3 documentos de 12.000 caracteres) responde rápido", () => {
    const doc = Array.from({ length: 2000 }, (_, i) => `palabra${i % 700}`).join(" ");
    const campos = Array.from({ length: 12 }, (_, i) => Array.from({ length: 50 }, (_, j) => `otra${i}x${j}`).join(" "));
    const inicio = performance.now();
    compararCopia(campos, [doc, doc, doc]);
    expect(performance.now() - inicio).toBeLessThan(2000);
  });
});
