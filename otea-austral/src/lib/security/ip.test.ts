import { describe, expect, it } from "vitest";
import { ipCliente } from "./ip";

const h = (valores: Record<string, string>) => new Headers(valores);

describe("ipCliente", () => {
  it("con un proxy de confianza toma la última entrada (la que agregó el proxy)", () => {
    expect(ipCliente(h({ "x-forwarded-for": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    // Un cliente que inventa la cabecera no logra cambiar su IP efectiva.
    expect(ipCliente(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });

  it("con dos proxies toma la penúltima", () => {
    expect(ipCliente(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 10.0.0.1" }), 2)).toBe("203.0.113.9");
  });

  it("sin proxies de confianza ignora X-Forwarded-For", () => {
    expect(ipCliente(h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.7" }), 0)).toBe("198.51.100.7");
    expect(ipCliente(h({ "x-forwarded-for": "1.2.3.4" }), 0)).toBe("desconocida");
  });

  it("si faltan entradas cae a x-real-ip o a un valor fijo", () => {
    expect(ipCliente(h({ "x-forwarded-for": "203.0.113.9" }), 2)).toBe("desconocida");
    expect(ipCliente(h({}), 1)).toBe("desconocida");
  });
});
