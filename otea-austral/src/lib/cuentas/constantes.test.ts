import { describe, expect, it } from "vitest";
import {
  COOKIE_SESION_CUENTA,
  ESPERA_REENVIO_MS,
  FORMATO_HASH,
  FORMATO_TOKEN,
  OPCIONES_COOKIE_CUENTA,
  SESION_ABSOLUTA_MS,
  SESION_INACTIVA_MS,
  SESION_PENDIENTE_MS,
  VIGENCIA_ALTA_MS,
  VIGENCIA_RESTABLECER_MS,
} from "./constantes";
import { generarToken, hashToken } from "./tokens";

describe("cookie de sesión de la persona usuaria", () => {
  it("lleva el prefijo __Host- (obliga a Secure, Path=/ y sin Domain) y los atributos que cierran el robo y el envío cruzado", () => {
    expect(COOKIE_SESION_CUENTA.startsWith("__Host-")).toBe(true);
    expect(OPCIONES_COOKIE_CUENTA).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(OPCIONES_COOKIE_CUENTA).not.toHaveProperty("domain");
  });
});

describe("plazos", () => {
  it("el enlace de restablecer es el más corto, y la sesión pendiente no dura más que él", () => {
    expect(VIGENCIA_RESTABLECER_MS).toBeLessThan(VIGENCIA_ALTA_MS);
    expect(SESION_PENDIENTE_MS).toBeLessThanOrEqual(VIGENCIA_RESTABLECER_MS);
  });

  it("la sesión inactiva se cierra antes que la absoluta, y la base nunca admite más de 31 días (migración 0006)", () => {
    expect(SESION_INACTIVA_MS).toBeLessThan(SESION_ABSOLUTA_MS);
    expect(SESION_ABSOLUTA_MS).toBeLessThanOrEqual(31 * 24 * 60 * 60_000);
  });

  it("reenviar un enlace exige esperar, pero menos de lo que vale el enlace", () => {
    expect(ESPERA_REENVIO_MS).toBeGreaterThan(0);
    expect(ESPERA_REENVIO_MS).toBeLessThan(VIGENCIA_RESTABLECER_MS);
  });
});

describe("formatos", () => {
  it("un token generado y su hash cumplen los formatos que exigen el servicio y la base", () => {
    const token = generarToken();
    expect(token).toMatch(FORMATO_TOKEN);
    expect(hashToken(token)).toMatch(FORMATO_HASH);
  });
});
