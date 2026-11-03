import { describe, expect, it } from "vitest";
import { avisosDeOperacion } from "./avisos";
import type { Tablero } from "./cola-postgres";

const AHORA = new Date("2026-10-30T12:00:00.000Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

const tablero = (cambios: Partial<Tablero> = {}): Tablero => ({
  ultimaCorrida: { inicio: hace(1), fin: hace(1), resultado: "ok", feeds: 1, nuevos: 0, fallos: 0 },
  feedsConProblemas: [],
  feedsSinNovedades: [],
  eventosPendientes: 0,
  itemsSinEvento: 0,
  borradoresPendientes: 0,
  gastoMes: { micros: 0, llamadas: 0, topeMicros: null },
  gastoTotalMicros: 0,
  resumen: { ultimaCorrida: { inicio: hace(4), resultado: "ok", cuentas: 1, enviados: 1, fallos: 0 }, enviadosHoy: 1, fallidosHoy: 0, suscritas: 1 },
  ...cambios,
});

describe("avisos de operación del tablero", () => {
  it("con todo en orden, ninguno; con todo apagado (sin corridas), tampoco", () => {
    expect(avisosDeOperacion(tablero(), AHORA)).toEqual([]);
    expect(
      avisosDeOperacion(tablero({ ultimaCorrida: null, resumen: { ultimaCorrida: null, enviadosHoy: 0, fallidosHoy: 0, suscritas: 3 } }), AHORA),
    ).toEqual([]);
  });

  it("avisa de la ingesta parada o fallida, feeds con problemas o silenciosos, gasto alto y resúmenes que no salieron", () => {
    const avisos = avisosDeOperacion(
      tablero({
        ultimaCorrida: { inicio: hace(5), fin: hace(4), resultado: "fallida", feeds: 1, nuevos: 0, fallos: 1 },
        feedsConProblemas: [{ feedUrl: "https://example.org/f", sourceId: "x", organismo: "X (ejemplo)", fallosSeguidos: 3, pausadoHasta: null, ultimoError: "tiempo" }],
        feedsSinNovedades: [{ feedUrl: "https://example.org/g", organismo: "Y (ejemplo)", ultimoItem: null }],
        gastoMes: { micros: 4_100_000, llamadas: 10, topeMicros: 5_000_000 },
        resumen: { ultimaCorrida: { inicio: hace(30), resultado: "parcial", cuentas: 2, enviados: 1, fallos: 1 }, enviadosHoy: 0, fallidosHoy: 1, suscritas: 2 },
      }),
      AHORA,
    );
    expect(avisos).toHaveLength(7);
    expect(avisos.join(" ")).toMatch(/más de 3 horas[\s\S]*falló[\s\S]*1 feed en pausa[\s\S]*14 días[\s\S]*80 %[\s\S]*no salió[\s\S]*no corrió/);
  });
});
