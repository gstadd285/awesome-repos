import { describe, expect, it } from "vitest";
import {
  ALFABETO_FRASE,
  base32,
  generarFrase,
  ITERACIONES,
  generarSecretoSesion,
  generarSecretoTotp,
  hashearFrase,
  uriTotp,
} from "../../../scripts/lib/credenciales.mjs";
import { EnvSchema, ITERACIONES_MINIMAS } from "@/lib/env";
import { verificarFrase } from "./clave";
import {
  COOKIE_SESION,
  crearSesion,
  DURACION_SESION_MS,
  leerSesion,
  OPCIONES_COOKIE,
  tokenCsrf,
  verificarCsrf,
} from "./sesion";
import { codigoTotp, decodificarBase32, verificarTotp } from "./totp";

// RFC 6238, apéndice B (SHA-1): secreto ASCII "12345678901234567890".
const SECRETO_RFC = base32(Buffer.from("12345678901234567890"));
const VECTORES: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("TOTP", () => {
  it("coincide con los vectores del RFC 6238", () => {
    const secreto = decodificarBase32(SECRETO_RFC);
    for (const [segundos, codigo] of VECTORES) {
      expect(codigoTotp(secreto, Math.floor(segundos / 30))).toBe(codigo);
    }
  });

  it("acepta un paso de desfase y rechaza códigos viejos o mal formados", () => {
    const ahora = 1111111111_000;
    expect(verificarTotp(SECRETO_RFC, "050471", ahora)).toBe(Math.floor(1111111111 / 30));
    const anterior = codigoTotp(decodificarBase32(SECRETO_RFC), Math.floor(1111111111 / 30) - 1);
    expect(verificarTotp(SECRETO_RFC, anterior, ahora)).not.toBeNull();
    const viejo = codigoTotp(decodificarBase32(SECRETO_RFC), Math.floor(1111111111 / 30) - 3);
    expect(verificarTotp(SECRETO_RFC, viejo, ahora)).toBeNull();
    for (const malo of ["", "12345", "1234567", "abcdef", "05047 1"]) {
      expect(verificarTotp(SECRETO_RFC, malo, ahora)).toBeNull();
    }
  });

  it("base32 ida y vuelta, y la URI para la app de autenticación", () => {
    const secreto = generarSecretoTotp();
    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32(decodificarBase32(secreto))).toBe(secreto);
    expect(uriTotp(secreto)).toBe(
      `otpauth://totp/Otea%20Austral%3Aadmin?secret=${secreto}&issuer=Otea%20Austral&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe("frase de acceso", () => {
  it("verifica el hash que genera el script y rechaza otras frases", async () => {
    const frase = generarFrase();
    expect(frase).toMatch(/^([a-z2-9]{5}-){4}[a-z2-9]{5}$/);
    const hash = await hashearFrase(frase, 1_000);
    expect(await verificarFrase(frase, hash)).toBe(true);
    expect(await verificarFrase(`${frase}x`, hash)).toBe(false);
    expect(await verificarFrase("", hash)).toBe(false);
  });

  it("la frase generada tiene al menos 120 bits de entropía y el hash usa el mínimo de OWASP", () => {
    // 5 grupos de 5 caracteres de un alfabeto de 31: 25 × log2(31) ≈ 124 bits.
    expect(25 * Math.log2(ALFABETO_FRASE.length)).toBeGreaterThanOrEqual(120);
    expect(ITERACIONES).toBeGreaterThanOrEqual(ITERACIONES_MINIMAS);
    expect(ITERACIONES_MINIMAS).toBeGreaterThanOrEqual(600_000);
  });

  it("el esquema de entorno rechaza un hash con pocas iteraciones", () => {
    const hash = `pbkdf2-sha256$100000$${"A".repeat(22)}$${"B".repeat(43)}`;
    const r = EnvSchema.safeParse({ ADMIN_CLAVE_HASH: hash });
    expect(r.success).toBe(false);
  });

  it("un hash mal formado nunca coincide", async () => {
    for (const malo of ["", "texto", "md5$1$a$b", "pbkdf2-sha256$0$aaaaaaaaaaaaaaaaaaaaaa$bb"]) {
      expect(await verificarFrase("frase", malo)).toBe(false);
    }
  });

  it("las credenciales generadas cumplen el esquema de entorno", async () => {
    const r = EnvSchema.safeParse({
      ADMIN_CLAVE_HASH: await hashearFrase(generarFrase()),
      ADMIN_TOTP_SECRETO: generarSecretoTotp(),
      ADMIN_SESION_SECRETO: generarSecretoSesion(),
      DATABASE_URL: "postgresql://otea_web:x@localhost:5432/otea",
    });
    expect(r.success).toBe(true);
  }, 20_000);
});

describe("sesión firmada", () => {
  const SECRETO = "s".repeat(43);
  const AHORA = Date.parse("2026-10-10T12:00:00Z");

  it("usa el prefijo __Host- y vence a las 8 horas", () => {
    expect(COOKIE_SESION.startsWith("__Host-")).toBe(true);
    const { valor } = crearSesion(SECRETO, AHORA);
    expect(leerSesion(SECRETO, valor, AHORA + DURACION_SESION_MS - 1)).not.toBeNull();
    expect(leerSesion(SECRETO, valor, AHORA + DURACION_SESION_MS)).toBeNull();
  });

  it("la cookie es HttpOnly, Secure, SameSite=Strict y de ruta / sin Domain (requisitos de __Host-)", () => {
    expect(OPCIONES_COOKIE).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/" });
    expect(OPCIONES_COOKIE).not.toHaveProperty("domain");
  });

  it("la sesión de la aplicación nunca dura más que el máximo que admite la base (12 horas, migración 0002)", () => {
    expect(DURACION_SESION_MS).toBeLessThanOrEqual(12 * 60 * 60_000);
  });

  it("rechaza firmas alteradas, otro secreto y cargas inventadas", () => {
    const { valor, sesion } = crearSesion(SECRETO, AHORA);
    expect(leerSesion(SECRETO, valor, AHORA)?.sid).toBe(sesion.sid);
    expect(leerSesion("o".repeat(43), valor, AHORA)).toBeNull();
    const [carga, firma] = valor.split(".");
    const otra = Buffer.from(JSON.stringify({ ...sesion, exp: AHORA + 10 * DURACION_SESION_MS })).toString("base64url");
    expect(leerSesion(SECRETO, `${otra}.${firma}`, AHORA)).toBeNull();
    expect(leerSesion(SECRETO, `${carga}.${firma.slice(1)}`, AHORA)).toBeNull();
    for (const basura of [undefined, "", ".", "a.b.c", "x".repeat(600)]) {
      expect(leerSesion(SECRETO, basura, AHORA)).toBeNull();
    }
  });

  it("el token CSRF depende de la sesión", () => {
    const a = crearSesion(SECRETO, AHORA).sesion;
    const b = crearSesion(SECRETO, AHORA).sesion;
    const token = tokenCsrf(SECRETO, a.sid);
    expect(verificarCsrf(SECRETO, a.sid, token)).toBe(true);
    expect(verificarCsrf(SECRETO, b.sid, token)).toBe(false);
    expect(verificarCsrf(SECRETO, a.sid, null)).toBe(false);
    expect(verificarCsrf(SECRETO, a.sid, "")).toBe(false);
  });
});
