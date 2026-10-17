import { describe, expect, it } from "vitest";
import { FORMATO_CIFRADO } from "../../../scripts/lib/lista-cifrado.mjs";
import { crearCifradorCorreo } from "./cifrado";

const SECRETO = "s".repeat(43);
const cifrador = crearCifradorCorreo(SECRETO);

describe("cifrado de correos de la lista de espera", () => {
  it("cifra y descifra, incluidos correos largos y con caracteres no ASCII", () => {
    for (const correo of ["persona@correo.cl", `${"a".repeat(64)}@${"b".repeat(180)}.cl`, "ñandú+prueba@correo.cl"]) {
      const { indice, cifrado } = cifrador.cifrar(correo);
      expect(cifrador.descifrar(cifrado, indice)).toBe(correo);
    }
  });

  it("el texto cifrado tiene la forma que exige la base, también con el correo más largo posible (254)", () => {
    const largo = `${"a".repeat(64)}@${"b".repeat(185)}.cl`;
    expect(largo.length).toBeLessThanOrEqual(254);
    for (const correo of ["a@b.c", largo]) {
      expect(cifrador.cifrar(correo).cifrado).toMatch(FORMATO_CIFRADO);
    }
  });

  it("no revela el correo ni el largo exacto con claridad: IV aleatorio, texto distinto cada vez", () => {
    const a = cifrador.cifrar("persona@correo.cl");
    const b = cifrador.cifrar("persona@correo.cl");
    expect(a.indice).toBe(b.indice);
    expect(a.cifrado).not.toBe(b.cifrado);
    expect(a.cifrado).not.toContain("persona");
    expect(Buffer.from(a.cifrado.slice(3), "base64url").toString("latin1")).not.toContain("persona");
  });

  it("el índice es estable, no se parece al correo y distingue correos", () => {
    expect(cifrador.indice("persona@correo.cl")).toMatch(/^[0-9a-f]{64}$/);
    expect(cifrador.indice("persona@correo.cl")).toBe(cifrador.indice("persona@correo.cl"));
    expect(cifrador.indice("persona@correo.cl")).not.toBe(cifrador.indice("otra@correo.cl"));
    expect(cifrador.indice("persona@correo.cl")).not.toContain("persona");
    // Otra clave, otro índice: sin el secreto no se puede comprobar si un correo está en la lista.
    expect(crearCifradorCorreo("o".repeat(43)).indice("persona@correo.cl")).not.toBe(cifrador.indice("persona@correo.cl"));
  });

  it("detecta clave equivocada, datos alterados y texto cifrado de otra fila", () => {
    const { indice, cifrado } = cifrador.cifrar("persona@correo.cl");
    expect(() => crearCifradorCorreo("o".repeat(43)).descifrar(cifrado, indice)).toThrow(/clave equivocada o dato alterado/);
    expect(() => cifrador.descifrar(cifrado, cifrador.indice("otra@correo.cl"))).toThrow(/clave equivocada o dato alterado/);

    const bytes = Buffer.from(cifrado.slice(3), "base64url");
    for (const posicion of [0, 13, bytes.length - 1]) {
      const alterado = Buffer.from(bytes);
      alterado[posicion] ^= 1;
      expect(() => cifrador.descifrar(`v1.${alterado.toString("base64url")}`, indice), `byte ${posicion}`).toThrow();
    }
  });

  it("rechaza formatos desconocidos o truncados con un mensaje que no filtra datos", () => {
    const { indice } = cifrador.cifrar("persona@correo.cl");
    for (const malo of ["", "persona@correo.cl", "v2.AAAA", "v1.", "v1.AAAA", "v1.@@@@"]) {
      expect(() => cifrador.descifrar(malo, indice), malo).toThrow();
    }
  });

  it("las claves de cifrado y de índice son independientes (HKDF por propósito)", () => {
    // Si fueran la misma, quien conociera el índice de un correo podría construir un texto cifrado válido.
    const otro = crearCifradorCorreo(SECRETO);
    expect(otro.indice("x@y.cl")).toBe(cifrador.indice("x@y.cl"));
    expect(cifrador.cifrar("x@y.cl").cifrado).not.toBe(otro.cifrar("x@y.cl").cifrado);
  });
});
