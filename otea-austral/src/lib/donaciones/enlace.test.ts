import { describe, expect, it } from "vitest";
import { DOMINIOS_DONACIONES, enlaceDonacion } from "./enlace";

// Direcciones de prueba: ninguna es el link de la dueña (todavía no existe).
describe("link de pago para aportes (lista cerrada de dominios de Mercado Pago)", () => {
  it("la lista es la verificada: el link de cobro de Chile y el dominio corto oficial", () => {
    expect([...DOMINIOS_DONACIONES]).toEqual(["link.mercadopago.cl", "mpago.la"]);
  });

  it("acepta un link https de cada dominio permitido, con su ruta", () => {
    expect(enlaceDonacion("https://link.mercadopago.cl/prueba-otea")).toBe("https://link.mercadopago.cl/prueba-otea");
    expect(enlaceDonacion("https://mpago.la/2AbC9xZ")).toBe("https://mpago.la/2AbC9xZ");
    expect(enlaceDonacion("https://link.mercadopago.cl/prueba_otea.cl/")).toBe("https://link.mercadopago.cl/prueba_otea.cl/");
    // El puerto por omisión y las mayúsculas del dominio se normalizan: es el mismo destino.
    expect(enlaceDonacion("https://MPAGO.LA:443/2AbC9xZ")).toBe("https://mpago.la/2AbC9xZ");
  });

  it("rechaza http y cualquier otro esquema", () => {
    for (const malo of [
      "http://link.mercadopago.cl/prueba-otea",
      "http://mpago.la/2AbC9xZ",
      "javascript:alert(1)",
      "data:text/html,hola",
      "//mpago.la/2AbC9xZ",
      "mpago.la/2AbC9xZ",
    ]) {
      expect(enlaceDonacion(malo), malo).toBeNull();
    }
  });

  it("rechaza dominios parecidos y otros dominios de Mercado Pago que no son de links de pago verificados", () => {
    for (const malo of [
      "https://mpago.co/2AbC9xZ", // herramienta de un tercero
      "https://mpago.li/2AbC9xZ", // sin verificar como dominio de links de pago
      "https://mpago.cl/link",
      "https://link.mercadopago.com/prueba-otea",
      "https://link.mercadopag0.cl/prueba-otea",
      "https://link-mercadopago.cl/prueba-otea",
      "https://linkmercadopago.cl/prueba-otea",
      "https://mpago.lat/2AbC9xZ",
      "https://mpago.la.com/2AbC9xZ",
      "https://www.mercadopago.cl/prueba-otea",
      "https://mpägo.la/2AbC9xZ", // el navegador lo convierte a punycode: otro dominio
      "https://link.mercadopago.cl./prueba-otea", // punto final: otro nombre para el resolvedor
    ]) {
      expect(enlaceDonacion(malo), malo).toBeNull();
    }
  });

  it("rechaza subdominios engañosos: el host debe ser exactamente uno de la lista", () => {
    for (const malo of [
      "https://link.mercadopago.cl.example.org/prueba-otea",
      "https://link.mercadopago.cl.atacante.cl/prueba-otea",
      "https://mpago.la.atacante.com/2AbC9xZ",
      "https://pagos.link.mercadopago.cl/prueba-otea",
      "https://www.mpago.la/2AbC9xZ",
    ]) {
      expect(enlaceDonacion(malo), malo).toBeNull();
    }
  });

  it("rechaza credenciales, otro puerto, la raíz sin ruta, parámetros, anclas y rutas raras", () => {
    for (const malo of [
      "https://usuario@link.mercadopago.cl/prueba-otea",
      "https://link.mercadopago.cl@atacante.com/prueba-otea",
      "https://link.mercadopago.cl:8443/prueba-otea",
      "https://link.mercadopago.cl/",
      "https://link.mercadopago.cl",
      "https://mpago.la/2AbC9xZ?redirect=https://atacante.com",
      "https://mpago.la/2AbC9xZ?",
      "https://mpago.la/2AbC9xZ#x",
      "https://mpago.la/2AbC%2F9xZ",
      "https://mpago.la/2AbC 9xZ",
      " https://mpago.la/2AbC9xZ",
      "https://mpago.la/a/b/c/d/e",
      `https://mpago.la/${"a".repeat(121)}`,
      "",
    ]) {
      expect(enlaceDonacion(malo), malo).toBeNull();
    }
  });
});
