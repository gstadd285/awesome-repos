import { describe, expect, it } from "vitest";
import { codigoTotp, decodificarBase32, pasoTotp, verificarTotp } from "@/lib/admin/totp";
import { FORMATO_SECRETO_TOTP, generarSecretoTotp, secretoEnGrupos, uriTotp } from "./totp-cuenta";

describe("verificación en dos pasos de las cuentas", () => {
  it("el secreto tiene 160 bits en base32 (32 caracteres) y no se repite", () => {
    const secretos = Array.from({ length: 100 }, generarSecretoTotp);
    expect(new Set(secretos).size).toBe(100);
    for (const s of secretos) {
      expect(s).toMatch(FORMATO_SECRETO_TOTP);
      expect(decodificarBase32(s)).toHaveLength(20);
    }
  });

  it("un código calculado con el secreto se acepta en su paso (y en los vecinos), y no en otros", () => {
    const secreto = generarSecretoTotp();
    const ahora = Date.UTC(2026, 9, 11, 12, 0, 0);
    const paso = pasoTotp(ahora);
    const codigo = codigoTotp(decodificarBase32(secreto), paso);
    expect(verificarTotp(secreto, codigo, ahora)).toBe(paso);
    expect(verificarTotp(secreto, codigo, ahora + 30_000)).toBe(paso);
    expect(verificarTotp(secreto, codigo, ahora - 30_000)).toBe(paso);
    expect(verificarTotp(secreto, codigo, ahora + 120_000)).toBeNull();
    expect(verificarTotp(generarSecretoTotp(), codigo, ahora)).toBeNull();
  });

  it("el vector de prueba del RFC 6238 (SHA-1) da el código esperado", () => {
    // Secreto «12345678901234567890» en base32; a las 59 s el código de 8 dígitos es 94287082 (6 dígitos: 287082).
    const secreto = decodificarBase32("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(codigoTotp(secreto, pasoTotp(59_000))).toBe("287082");
  });

  it("el enlace para la app lleva el emisor, el correo escapado y el secreto", () => {
    const uri = uriTotp("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "ana+prueba@correo.cl");
    expect(uri).toBe(
      "otpauth://totp/Otea%20Austral:ana%2Bprueba%40correo.cl?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Otea%20Austral",
    );
    expect(() => new URL(uri)).not.toThrow();
    expect(new URL(uri).searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  });

  it("el secreto se muestra en grupos de cuatro para copiarlo a mano", () => {
    expect(secretoEnGrupos("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")).toBe("ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567");
  });
});
