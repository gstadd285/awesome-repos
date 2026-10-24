import { describe, expect, it } from "vitest";
import {
  costoEnMicros,
  costoMaximoEnMicros,
  crearPresupuestoMemoria,
  dolaresAMicros,
  estimarTokens,
  microsADolares,
} from "./presupuesto";

const HAIKU = { entrada: 0.1, salida: 0.5 };
const OPUS = { entrada: 4, salida: 20 };

describe("costos", () => {
  it("el precio por millón de tokens es el costo en micros por token", () => {
    expect(costoEnMicros({ entrada: 1_000_000, salida: 0 }, HAIKU)).toBe(100_000); // US$ 0,10
    expect(costoEnMicros({ entrada: 0, salida: 1_000_000 }, HAIKU)).toBe(500_000); // US$ 0,50
    expect(microsADolares(costoEnMicros({ entrada: 2_000, salida: 300 }, HAIKU))).toBeCloseTo(0.00035, 8);
    expect(microsADolares(costoEnMicros({ entrada: 2_000, salida: 300 }, OPUS))).toBeCloseTo(0.014, 8);
  });

  it("redondea hacia arriba: nunca subestima", () => {
    expect(costoEnMicros({ entrada: 1, salida: 1 }, HAIKU)).toBe(1); // 0,6 micros → 1
  });

  it("el peor caso incluye toda la salida posible y una entrada estimada por lo alto", () => {
    const texto = "a".repeat(5_000);
    expect(estimarTokens(texto)).toBe(2_000);
    expect(costoMaximoEnMicros(texto, 1_200, HAIKU)).toBe(200 + 600);
    expect(costoMaximoEnMicros(texto, 1_200, OPUS)).toBe(8_000 + 24_000);
  });

  it("dólares ↔ micros", () => {
    expect(dolaresAMicros(1)).toBe(1_000_000);
    expect(dolaresAMicros(0.5)).toBe(500_000);
    expect(microsADolares(dolaresAMicros(2.25))).toBe(2.25);
  });
});

describe("presupuesto en memoria", () => {
  const reloj = (iso: string) => {
    let ahora = new Date(iso);
    return { ahora: () => ahora, mover: (iso2: string) => (ahora = new Date(iso2)) };
  };

  it("reserva hasta el tope y rechaza lo que ya no alcanza", async () => {
    const p = crearPresupuestoMemoria({ micros: 1_000, llamadas: 100 });
    expect(await p.reservar(400)).toBe(true);
    expect(await p.reservar(400)).toBe(true);
    expect(await p.reservar(400)).toBe(false);
    expect(await p.reservar(200)).toBe(true); // justo el tope
    expect(await p.reservar(1)).toBe(false);
  });

  it("ajustar devuelve lo que no se gastó y cobra lo que faltó", async () => {
    const p = crearPresupuestoMemoria({ micros: 1_000, llamadas: 100 });
    expect(await p.reservar(900)).toBe(true);
    expect(await p.reservar(200)).toBe(false);
    await p.ajustar(900, 100); // se usó mucho menos
    expect(await p.reservar(800)).toBe(true);
    await p.ajustar(800, 1_500); // se usó más de lo reservado
    expect(await p.reservar(1)).toBe(false);
  });

  it("también limita el número de llamadas", async () => {
    const p = crearPresupuestoMemoria({ micros: 1_000_000, llamadas: 3 });
    expect(await p.reservar(1)).toBe(true);
    expect(await p.reservar(1)).toBe(true);
    expect(await p.reservar(1)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
  });

  it("no reserva cifras raras", async () => {
    const p = crearPresupuestoMemoria({ micros: 1_000, llamadas: 10 });
    expect(await p.reservar(Number.NaN)).toBe(false);
    expect(await p.reservar(-5)).toBe(false);
    expect(await p.reservar(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("no baja de cero aunque se ajuste de más", async () => {
    const p = crearPresupuestoMemoria({ micros: 1_000, llamadas: 10 });
    await p.reservar(100);
    await p.ajustar(100, -5_000);
    expect(await p.reservar(1_000)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
  });

  it("empieza de cero cada día de Chile", async () => {
    const r = reloj("2026-10-11T12:00:00Z");
    const p = crearPresupuestoMemoria({ micros: 1_000, llamadas: 10 }, r.ahora);
    expect(await p.reservar(1_000)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
    r.mover("2026-10-11T23:30:00Z"); // 20:30 en Chile: sigue siendo el mismo día
    expect(await p.reservar(1)).toBe(false);
    r.mover("2026-10-12T04:00:00Z"); // 01:00 del día siguiente en Chile (UTC−3)
    expect(await p.reservar(1_000)).toBe(true);
  });
});
