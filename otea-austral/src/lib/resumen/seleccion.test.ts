import { describe, expect, it } from "vitest";
import { TEMAS } from "@/lib/domain/temas";
import { PRIMERA_VENTANA_MS, seleccionar, temasEfectivos, VENTANA_MAXIMA_MS, ventanaDe, type AlertaParaResumen } from "./seleccion";

const AHORA = new Date("2026-10-30T10:41:00.000Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

/** DATOS DE PRUEBA: alertas ficticias de las pruebas (títulos «(prueba)»). */
const alerta = (id: string, tema: AlertaParaResumen["tema"], horas: number, extra: Partial<AlertaParaResumen> = {}): AlertaParaResumen => ({
  id,
  tema,
  evento: `Evento ${id} (prueba)`,
  confianza: "media",
  publicada: hace(horas),
  estado: "publicada",
  es_ejemplo: false,
  ...extra,
});

describe("ventana del resumen", () => {
  it("la primera vez, las últimas 24 horas; después, desde el fin del último que salió", () => {
    expect(ventanaDe(null, AHORA)).toEqual({ desde: new Date(AHORA.getTime() - PRIMERA_VENTANA_MS), hasta: AHORA });
    const ultimo = new Date(hace(30));
    expect(ventanaDe(ultimo, AHORA)).toEqual({ desde: ultimo, hasta: AHORA });
  });

  it("si nunca salió uno, desde que lo pidió o hace 24 horas, lo que sea antes", () => {
    expect(ventanaDe(null, AHORA, new Date(hace(48))).desde).toEqual(new Date(hace(48)));
    expect(ventanaDe(null, AHORA, new Date(hace(1))).desde).toEqual(new Date(hace(24)));
    // Con un resumen ya enviado, manda ese.
    expect(ventanaDe(new Date(hace(5)), AHORA, new Date(hace(48))).desde).toEqual(new Date(hace(5)));
  });

  it("nunca más de 7 días atrás, ni una ventana vacía o al revés", () => {
    expect(ventanaDe(new Date(hace(24 * 40)), AHORA).desde).toEqual(new Date(AHORA.getTime() - VENTANA_MAXIMA_MS));
    const futuro = ventanaDe(new Date(AHORA.getTime() + 3_600_000), AHORA);
    expect(futuro.desde.getTime()).toBeLessThan(futuro.hasta.getTime());
  });
});

describe("qué alertas lleva", () => {
  const alertas = [
    alerta("a", "cobre", 2),
    alerta("b", "energia", 5),
    alerta("c", "cobre", 30), // fuera de las 24 h
    alerta("d", "cobre", 1, { es_ejemplo: true }),
    alerta("e", "divisas", 3, { estado: "corregida" }),
    alerta("f", "cobre", 4, { estado: "retractada" as never }),
  ];

  it("solo reales, publicadas o corregidas, en los temas de la cuenta y dentro de la ventana, las más recientes primero", () => {
    const v = ventanaDe(null, AHORA);
    expect(seleccionar(alertas, ["cobre"], v).map((a) => a.id)).toEqual(["a"]);
    expect(seleccionar(alertas, ["cobre", "divisas", "energia"], v).map((a) => a.id)).toEqual(["a", "e", "b"]);
    expect(seleccionar(alertas, ["chips"], v)).toEqual([]);
  });

  it("sin temas elegidos (o con uno que no existe), todos los temas: lo mismo que ve en /alertas", () => {
    expect(temasEfectivos([])).toEqual([...TEMAS]);
    expect(temasEfectivos(["inventado"])).toEqual([...TEMAS]);
    expect(temasEfectivos(["divisas", "cobre", "divisas"])).toEqual(["cobre", "divisas"]);
    expect(seleccionar(alertas, [], ventanaDe(null, AHORA)).map((a) => a.id)).toEqual(["a", "e", "b"]);
  });

  it("la ventana es (desde, hasta]: lo publicado justo en el corte del último resumen no se repite", () => {
    const corte = new Date(hace(2));
    expect(seleccionar(alertas, ["cobre"], ventanaDe(corte, AHORA))).toEqual([]);
    expect(seleccionar(alertas, ["cobre"], ventanaDe(new Date(corte.getTime() - 1), AHORA)).map((a) => a.id)).toEqual(["a"]);
  });
});
