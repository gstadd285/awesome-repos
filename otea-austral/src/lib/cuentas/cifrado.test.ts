import { describe, expect, it } from "vitest";
import {
  crearCifradorCuentas,
  derivarClaveCuentas,
  FORMATO_CORREO_CIFRADO,
  FORMATO_TOTP_CIFRADO,
  type PropositoClave,
} from "./cifrado";
import { generarSecretoTotp } from "./totp-cuenta";

const SECRETO = "S".repeat(43);
const OTRO = "T".repeat(43);

describe("claves derivadas de CUENTAS_SECRETO", () => {
  it("cada propósito tiene su propia clave de 256 bits, estable para el mismo secreto", () => {
    const propositos: PropositoClave[] = ["correo-cifrado", "correo-indice", "totp", "csrf", "tiempo"];
    const claves = propositos.map((p) => derivarClaveCuentas(SECRETO, p).toString("hex"));
    expect(new Set(claves).size).toBe(propositos.length);
    for (const c of claves) expect(c).toHaveLength(64);
    expect(derivarClaveCuentas(SECRETO, "totp").equals(derivarClaveCuentas(SECRETO, "totp"))).toBe(true);
    expect(derivarClaveCuentas(OTRO, "totp").equals(derivarClaveCuentas(SECRETO, "totp"))).toBe(false);
  });

  it("no coincide con las claves de la lista de espera aunque se use el mismo texto como secreto", async () => {
    const { derivarClave } = await import("../waitlist/claves");
    expect(derivarClaveCuentas(SECRETO, "correo-indice").equals(derivarClave(SECRETO, "indice"))).toBe(false);
    expect(derivarClaveCuentas(SECRETO, "correo-cifrado").equals(derivarClave(SECRETO, "cifrado"))).toBe(false);
    expect(derivarClaveCuentas(SECRETO, "tiempo").equals(derivarClave(SECRETO, "tiempo"))).toBe(false);
  });
});

describe("correo cifrado con índice ciego", () => {
  const c = crearCifradorCuentas(SECRETO);

  it("cifra y descifra, con el formato que valida la base", () => {
    const { indice, cifrado } = c.cifrarCorreo("persona@correo.cl");
    expect(indice).toMatch(/^[0-9a-f]{64}$/);
    expect(cifrado).toMatch(FORMATO_CORREO_CIFRADO);
    expect(cifrado.length).toBeGreaterThanOrEqual(42);
    expect(cifrado.length).toBeLessThanOrEqual(400);
    expect(c.descifrarCorreo(cifrado, indice)).toBe("persona@correo.cl");
  });

  it("el correo más largo que admite el sitio (254 caracteres) cabe en el formato", () => {
    const largo = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(55)}.cl`.slice(0, 254);
    const { indice, cifrado } = c.cifrarCorreo(largo);
    expect(cifrado).toMatch(FORMATO_CORREO_CIFRADO);
    expect(c.descifrarCorreo(cifrado, indice)).toBe(largo);
  });

  it("el índice es determinista (sirve para buscar) y el texto cifrado no (IV nuevo cada vez)", () => {
    const a = c.cifrarCorreo("persona@correo.cl");
    const b = c.cifrarCorreo("persona@correo.cl");
    expect(a.indice).toBe(b.indice);
    expect(a.indice).toBe(c.indiceCorreo("persona@correo.cl"));
    expect(a.cifrado).not.toBe(b.cifrado);
    expect(c.indiceCorreo("otra@correo.cl")).not.toBe(a.indice);
  });

  it("ni el índice ni el texto cifrado contienen el correo", () => {
    const { indice, cifrado } = c.cifrarCorreo("persona@correo.cl");
    for (const dato of [indice, cifrado, Buffer.from(cifrado.slice(3), "base64url").toString("latin1")]) {
      expect(dato).not.toContain("persona");
      expect(dato).not.toContain("correo.cl");
    }
  });

  it("otro secreto da otro índice y no descifra", () => {
    const otro = crearCifradorCuentas(OTRO);
    const { indice, cifrado } = c.cifrarCorreo("persona@correo.cl");
    expect(otro.indiceCorreo("persona@correo.cl")).not.toBe(indice);
    expect(() => otro.descifrarCorreo(cifrado, indice)).toThrow();
  });

  it("un texto cifrado copiado a otra fila (otro índice) no se descifra", () => {
    const a = c.cifrarCorreo("a@correo.cl");
    const b = c.cifrarCorreo("b@correo.cl");
    expect(() => c.descifrarCorreo(a.cifrado, b.indice)).toThrow();
  });

  it("un dato alterado, truncado o con otro formato falla en vez de devolver basura", () => {
    const { indice, cifrado } = c.cifrarCorreo("persona@correo.cl");
    const bytes = Buffer.from(cifrado.slice(3), "base64url");
    bytes[bytes.length - 20] ^= 1;
    expect(() => c.descifrarCorreo(`v1.${bytes.toString("base64url")}`, indice)).toThrow();
    expect(() => c.descifrarCorreo(cifrado.slice(0, 30), indice)).toThrow();
    expect(() => c.descifrarCorreo("v2.AAAA", indice)).toThrow();
    expect(() => c.descifrarCorreo("", indice)).toThrow();
  });
});

describe("secreto de la verificación en dos pasos cifrado", () => {
  const c = crearCifradorCuentas(SECRETO);
  const cuenta = "3f2c1a54-1111-4222-8333-444455556666";

  it("cifra y descifra, con el formato que valida la base, y no deja ver el secreto", () => {
    const secreto = generarSecretoTotp();
    const cifrado = c.cifrarTotp(secreto, cuenta);
    expect(cifrado).toMatch(FORMATO_TOTP_CIFRADO);
    expect(cifrado).not.toContain(secreto);
    expect(c.descifrarTotp(cifrado, cuenta)).toBe(secreto);
  });

  it("está ligado a su cuenta: en otra cuenta o con otro secreto maestro no se abre", () => {
    const cifrado = c.cifrarTotp(generarSecretoTotp(), cuenta);
    expect(() => c.descifrarTotp(cifrado, "00000000-0000-4000-8000-000000000000")).toThrow();
    expect(() => crearCifradorCuentas(OTRO).descifrarTotp(cifrado, cuenta)).toThrow();
  });

  it("no se confunde con un correo cifrado", () => {
    const { indice, cifrado } = c.cifrarCorreo("persona@correo.cl");
    expect(() => c.descifrarTotp(cifrado, indice)).toThrow();
  });
});

describe("token anti-CSRF", () => {
  const c = crearCifradorCuentas(SECRETO);
  const hash = "a".repeat(64);

  it("es estable para una sesión, distinto entre sesiones y entre secretos, y no revela el hash", () => {
    expect(c.tokenCsrf(hash)).toBe(c.tokenCsrf(hash));
    expect(c.tokenCsrf(hash)).not.toBe(c.tokenCsrf("b".repeat(64)));
    expect(crearCifradorCuentas(OTRO).tokenCsrf(hash)).not.toBe(c.tokenCsrf(hash));
    expect(c.tokenCsrf(hash)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c.tokenCsrf(hash)).not.toContain(hash.slice(0, 8));
  });
});
