import { describe, expect, it } from "vitest";
import { SECURITY_TXT_EXPIRES, buildSecurityTxt, describirContacto } from "./security-txt";

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

function campos(texto: string): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const linea of texto.split("\n")) {
    if (!linea || linea.startsWith("#")) continue;
    const i = linea.indexOf(": ");
    (mapa[linea.slice(0, i)] ??= []).push(linea.slice(i + 2));
  }
  return mapa;
}

describe("buildSecurityTxt (RFC 9116)", () => {
  const txt = buildSecurityTxt({
    contacto: "mailto:seguridad@oteaustral.com",
    sitio: "https://oteaustral.com",
  });
  const c = campos(txt);

  it("incluye un Contact y exactamente un Expires", () => {
    expect(c.Contact).toEqual(["mailto:seguridad@oteaustral.com"]);
    expect(c.Expires).toHaveLength(1);
  });

  it("publica Canonical y Policy en https", () => {
    expect(c.Canonical).toEqual(["https://oteaustral.com/.well-known/security.txt"]);
    expect(c.Policy).toEqual(["https://oteaustral.com/seguridad#reportar"]);
  });

  it("omite Canonical y Policy si el sitio no es https (desarrollo)", () => {
    const local = campos(buildSecurityTxt({ contacto: "mailto:a@b.cl", sitio: "http://localhost:3000" }));
    expect(local.Canonical).toBeUndefined();
    expect(local.Policy).toBeUndefined();
  });

  it("termina en salto de línea y no usa CRLF mezclado", () => {
    expect(txt.endsWith("\n")).toBe(true);
    expect(txt).not.toContain("\r");
  });
});

describe("SECURITY_TXT_EXPIRES", () => {
  it("no está vencido (si falla: renovar la fecha en security-txt.ts)", () => {
    expect(Date.parse(SECURITY_TXT_EXPIRES)).toBeGreaterThan(Date.now());
  });

  it("vence en menos de un año, como recomienda el RFC", () => {
    expect(Date.parse(SECURITY_TXT_EXPIRES) - Date.now()).toBeLessThan(UN_ANIO_MS);
  });
});

describe("describirContacto", () => {
  it("muestra el correo sin el prefijo mailto", () => {
    expect(describirContacto("mailto:seguridad@oteaustral.com")).toEqual({
      href: "mailto:seguridad@oteaustral.com",
      texto: "seguridad@oteaustral.com",
      externo: false,
    });
  });

  it("nombra el formulario de GitHub", () => {
    expect(describirContacto("https://github.com/o/r/security/advisories/new")).toMatchObject({
      texto: "formulario privado de GitHub",
      externo: true,
    });
  });
});
