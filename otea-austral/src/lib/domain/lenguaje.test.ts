import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "./lenguaje";

describe("frasesProhibidas", () => {
  it("detecta recomendaciones sin importar tildes, mayúsculas ni puntuación", () => {
    expect(frasesProhibidas("RECOMENDAMOS COMPRAR acciones")).toEqual(["recomendamos comprar"]);
    expect(frasesProhibidas("Es una señal de compra clara")).toEqual(["senal de compra"]);
    expect(frasesProhibidas("Inversión  sin riesgo.")).toEqual(["inversion sin riesgo"]);
    expect(frasesProhibidas("¡Compra ya!")).toEqual(["compra ya"]);
  });

  it("detecta promesas de rentabilidad", () => {
    expect(frasesProhibidas("Rentabilidad garantizada del 10 %")).toEqual(["rentabilidad garantizada"]);
    expect(frasesProhibidas("ganancias aseguradas")).toEqual(["ganancias aseguradas"]);
  });

  it("compara palabras completas", () => {
    expect(frasesProhibidas("Las ventas de compra-venta subieron")).toEqual([]);
    expect(frasesProhibidas("La compra yace estancada")).toEqual([]);
  });

  it("acepta el lenguaje condicional de Otea", () => {
    expect(frasesProhibidas("Podría beneficiarse si el alza del crudo se sostiene")).toEqual([]);
    expect(frasesProhibidas("La tasa libre de riesgo subió")).toEqual([]);
  });
});
