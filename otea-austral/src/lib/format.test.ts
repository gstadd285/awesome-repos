import { describe, expect, it } from "vitest";
import { formatearDiaMes, formatearHora } from "./format";

describe("formato de fechas en hora de Chile", () => {
  it("la hora va en 24 horas y en la zona de Chile", () => {
    expect(formatearHora("2026-10-08T08:15:00-03:00")).toBe("08:15");
    expect(formatearHora("2026-10-07T21:30:00-03:00")).toBe("21:30");
    // Un instante en UTC se muestra en hora de Chile.
    expect(formatearHora("2026-10-08T11:15:00Z")).toBe("08:15");
  });

  it("el día y el mes, cortos y sin punto", () => {
    expect(formatearDiaMes("2026-10-08T08:15:00-03:00")).toBe("8 oct");
  });
});
