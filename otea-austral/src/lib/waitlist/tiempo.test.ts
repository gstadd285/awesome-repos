import { describe, expect, it } from "vitest";
import { derivarClave } from "./claves";
import { crearMarcaDeTiempo, ESPERA_MINIMA_MS, revisarMarcaDeTiempo, VIGENCIA_MARCA_MS } from "./tiempo";

const SECRETO = "s".repeat(43);
const clave = derivarClave(SECRETO, "tiempo");
const T0 = Date.parse("2026-10-10T12:00:00Z");

describe("marca de tiempo del formulario", () => {
  const marca = crearMarcaDeTiempo(clave, T0);

  it("acepta una marca entre la espera mínima y un día", () => {
    expect(revisarMarcaDeTiempo(clave, marca, T0 + ESPERA_MINIMA_MS)).toBe("ok");
    expect(revisarMarcaDeTiempo(clave, marca, T0 + 60_000)).toBe("ok");
    expect(revisarMarcaDeTiempo(clave, marca, T0 + VIGENCIA_MARCA_MS)).toBe("ok");
  });

  it("rechaza un envío demasiado rápido y una pestaña vencida", () => {
    expect(revisarMarcaDeTiempo(clave, marca, T0)).toBe("muy_rapida");
    expect(revisarMarcaDeTiempo(clave, marca, T0 + ESPERA_MINIMA_MS - 1)).toBe("muy_rapida");
    expect(revisarMarcaDeTiempo(clave, marca, T0 + VIGENCIA_MARCA_MS + 1)).toBe("vencida");
  });

  it("no se puede fabricar ni adelantar: la firma cubre la hora", () => {
    const [, firma] = marca.split(".");
    // Misma firma con una hora más vieja (para saltarse la espera) o con otra clave.
    expect(revisarMarcaDeTiempo(clave, `${T0 - 10 * 60_000}.${firma}`, T0 + 1_000)).toBe("invalida");
    expect(revisarMarcaDeTiempo(derivarClave("o".repeat(43), "tiempo"), marca, T0 + 60_000)).toBe("invalida");
    expect(revisarMarcaDeTiempo(clave, `${T0}.${firma.slice(0, -1)}A`, T0 + 60_000)).toBe("invalida");
  });

  it("una clave derivada para otro propósito no sirve", () => {
    expect(revisarMarcaDeTiempo(derivarClave(SECRETO, "indice"), marca, T0 + 60_000)).toBe("invalida");
    expect(revisarMarcaDeTiempo(derivarClave(SECRETO, "cifrado"), marca, T0 + 60_000)).toBe("invalida");
  });

  it("distingue lo que falta de lo que está mal formado", () => {
    for (const ausente of [undefined, null, ""]) expect(revisarMarcaDeTiempo(clave, ausente, T0)).toBe("ausente");
    for (const mala of [123, {}, "x", "1.2", "a".repeat(81), `${T0}.${"A".repeat(43)}`, `${T0}`]) {
      expect(revisarMarcaDeTiempo(clave, mala, T0 + 60_000)).toBe("invalida");
    }
  });

  it("tolera un pequeño desfase de reloj entre instancias, pero no una marca del futuro lejano", () => {
    const futura = crearMarcaDeTiempo(clave, T0 + 30_000);
    expect(revisarMarcaDeTiempo(clave, futura, T0)).toBe("muy_rapida");
    expect(revisarMarcaDeTiempo(clave, crearMarcaDeTiempo(clave, T0 + 10 * 60_000), T0)).toBe("invalida");
  });
});

describe("derivación de claves (HKDF)", () => {
  it("cada propósito da una clave distinta de 256 bits y es estable", () => {
    const a = derivarClave(SECRETO, "cifrado");
    const b = derivarClave(SECRETO, "indice");
    const c = derivarClave(SECRETO, "tiempo");
    expect([a.length, b.length, c.length]).toEqual([32, 32, 32]);
    expect(new Set([a.toString("hex"), b.toString("hex"), c.toString("hex")]).size).toBe(3);
    expect(derivarClave(SECRETO, "cifrado").equals(a)).toBe(true);
  });

  it("otro secreto da otras claves", () => {
    expect(derivarClave("o".repeat(43), "cifrado").equals(derivarClave(SECRETO, "cifrado"))).toBe(false);
  });
});
