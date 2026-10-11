import { describe, expect, it } from "vitest";
import { FORMATO_HASH, FORMATO_TOKEN } from "./constantes";
import {
  generarCodigoRecuperacion,
  generarToken,
  hashCodigoRecuperacion,
  hashToken,
  normalizarCodigoRecuperacion,
} from "./tokens";

describe("tokens de un solo uso", () => {
  it("son de 256 bits en base64url, distintos cada vez, con el formato que validan los esquemas", () => {
    const tokens = Array.from({ length: 200 }, generarToken);
    expect(new Set(tokens).size).toBe(200);
    for (const t of tokens) expect(t).toMatch(FORMATO_TOKEN);
  });

  it("de cada uno se guarda un SHA-256 en hexadecimal, estable y sin el token", () => {
    const token = generarToken();
    expect(hashToken(token)).toMatch(FORMATO_HASH);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token.slice(0, 8));
    expect(hashToken(generarToken())).not.toBe(hashToken(token));
    // Valor conocido: SHA-256 de «abc».
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("códigos de recuperación", () => {
  it("tienen dos grupos de cinco caracteres sin los que se confunden", () => {
    for (let i = 0; i < 300; i++) {
      const codigo = generarCodigoRecuperacion();
      expect(codigo).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
      expect(codigo).not.toMatch(/[01oil]/);
    }
  });

  it("no se repiten (49 bits de entropía)", () => {
    expect(new Set(Array.from({ length: 2000 }, generarCodigoRecuperacion)).size).toBe(2000);
  });

  it("se comparan sin guion, sin espacios y sin importar las mayúsculas", () => {
    expect(normalizarCodigoRecuperacion(" ABCDE-fghjk ")).toBe("abcdefghjk");
    const codigo = generarCodigoRecuperacion();
    expect(hashCodigoRecuperacion(codigo.toUpperCase().replace("-", " "))).toBe(hashCodigoRecuperacion(codigo));
    expect(hashCodigoRecuperacion(codigo)).toMatch(FORMATO_HASH);
    expect(hashCodigoRecuperacion(codigo)).not.toBe(hashCodigoRecuperacion(generarCodigoRecuperacion()));
  });

  it("su hash lleva un prefijo propio: no coincide con el de un token", () => {
    expect(hashCodigoRecuperacion("abcde-fghjk")).not.toBe(hashToken("abcdefghjk"));
  });
});
