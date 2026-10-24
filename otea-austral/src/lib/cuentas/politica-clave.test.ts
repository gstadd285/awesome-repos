import { describe, expect, it } from "vitest";
import { evaluarClave, largoClave, MENSAJES_CLAVE, TAMANO_LISTA_COMUN, type MotivoClave } from "./politica-clave";

const CONTEXTO = { correo: "maria.gonzalez@correo.cl", nombre: "Catalina" };

describe("política de contraseñas", () => {
  describe("largo", () => {
    it("pide 12 caracteres como mínimo y cuenta caracteres, no unidades UTF-16", () => {
      expect(evaluarClave("a1b2c3d4e5f")).toBe("corta"); // 11
      expect(evaluarClave("lluvia sobre el cerro")).toBeNull();
      // 12 emojis son 12 caracteres (24 unidades UTF-16): sirven de largo, aunque se rechazan por repetidos.
      expect(largoClave("😀".repeat(12))).toBe(12);
      expect(evaluarClave("😀".repeat(11))).toBe("corta");
    });

    it("acepta hasta 128 y rechaza más", () => {
      const larga = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + ((i * 7 + (i >> 3)) % 26))).join("");
      expect(evaluarClave(larga(128))).toBeNull();
      expect(evaluarClave(larga(129))).toBe("larga");
    });

    it("normaliza con NFKC: las formas de ancho completo cuentan como las normales", () => {
      expect(largoClave("ｌｌｕｖｉａ")).toBe(6);
      expect(evaluarClave("ｐａｓｓｗｏｒｄ１２３４")).toBe("comun");
    });
  });

  describe("sin reglas de composición", () => {
    it("una frase en minúsculas y con espacios sirve", () => {
      expect(evaluarClave("correct horse battery staple")).toBeNull();
      expect(evaluarClave("el perro verde cruza la ruta")).toBeNull();
    });

    it("una contraseña aleatoria sirve aunque sea solo de números o solo de letras", () => {
      expect(evaluarClave("839201746502")).toBeNull();
      expect(evaluarClave("xqvjzpmwkdhrbtnf")).toBeNull();
    });

    it("acepta espacios, tildes y símbolos", () => {
      expect(evaluarClave("Árbol-Nuevo ¡Sí! 7 pájaros")).toBeNull();
    });
  });

  describe("contraseñas comunes", () => {
    const comunes = [
      "password1234",
      "Password12345!",
      "qwertyuiop12",
      "iloveyou12345",
      "Tequiero2026!!",
      "contraseña2026",
      "Contrasena.2025",
      "P@ssw0rd12345",
      "pa$$word123456",
      "1234567890123",
      "123qweasdzxc",
      "dragon123456",
      "colocolo2026!!",
    ];
    it.each(comunes)("rechaza %s", (clave) => {
      expect(evaluarClave(clave), clave).not.toBeNull();
    });

    it("distingue las mayúsculas, las tildes y los cambios de letra por cifra de la contraseña común", () => {
      for (const clave of ["PASSWORD1234!", "Pässwörd-1234", "pa55w0rd1234", "p455w0rd-2026"]) {
        expect(evaluarClave(clave), clave).toBe("comun");
      }
    });

    it("la lista local es amplia (diez mil entradas o más)", () => {
      expect(TAMANO_LISTA_COMUN).toBeGreaterThan(10_000);
    });

    it("no rechaza una frase solo porque lleve una palabra común entre otras", () => {
      expect(evaluarClave("mi dragon come sandia en marzo")).toBeNull();
      expect(evaluarClave("monkey-teclado-volcan-sereno")).toBeNull();
    });
  });

  describe("contexto: el sitio, el correo y el nombre", () => {
    it("rechaza el nombre del sitio", () => {
      expect(evaluarClave("OteaAustral-2026-x", {})).toBe("contexto");
      expect(evaluarClave("mi_austral_favorito_77", {})).toBe("contexto");
    });

    it("rechaza el correo, sus partes y el nombre", () => {
      expect(evaluarClave("maria.gonzalez@correo.cl", CONTEXTO)).toBe("contexto");
      expect(evaluarClave("gonzalez-lluvia-sol-77", CONTEXTO)).toBe("contexto");
      expect(evaluarClave("verde maria camino cerro", CONTEXTO)).toBe("contexto");
      expect(evaluarClave("tarde de catalina en el sur", CONTEXTO)).toBe("contexto");
      expect(evaluarClave("viaje por correo ordinario", CONTEXTO)).toBe("contexto");
    });

    it("sin contexto (o con partes cortas) no rechaza por eso", () => {
      expect(evaluarClave("gonzalez-lluvia-sol-77", {})).toBeNull();
      expect(evaluarClave("ana y jo suben al cerro", { correo: "ana.jo@x.cl", nombre: "Ana" })).toBeNull();
    });
  });

  describe("repeticiones y secuencias", () => {
    it.each(["aaaaaaaaaaaa", "abababababab", "abcabcabcabc", "xyzxyzxyzxyz", "112211221122", "zzzzzzzzzzzzzzz1"])(
      "rechaza la repetición %s",
      (clave) => {
        expect(evaluarClave(clave), clave).toBe("repetitiva");
      },
    );

    it("rechaza la misma palabra repetida", () => {
      expect(evaluarClave("lluvialluvia")).toBe("repetitiva");
    });

    it.each(["abcdefghijkl", "zyxwvutsrqpo", "123456789012", "mnbvcxzlkjhg", "asdfghjklñqw", "9876543210"])(
      "rechaza la secuencia %s",
      (clave) => {
        const motivo = evaluarClave(clave.padEnd(12, "0"));
        expect(["secuencia", "comun", "repetitiva"], clave).toContain(motivo);
      },
    );

    it("una secuencia corta dentro de una contraseña larga no la descarta", () => {
      expect(evaluarClave("nube-1234-roble-gris-faro")).toBeNull();
    });
  });

  it("el orden de los motivos: largo, contexto, común, repetición, secuencia", () => {
    expect(evaluarClave("corta", CONTEXTO)).toBe("corta");
    expect(evaluarClave("password-maria-1234", CONTEXTO)).toBe("contexto");
    expect(evaluarClave("password-1234!", {})).toBe("comun");
  });

  it("todo motivo tiene su mensaje, en español y sin dar pistas de más", () => {
    const motivos: MotivoClave[] = ["corta", "larga", "contexto", "comun", "repetitiva", "secuencia"];
    for (const motivo of motivos) {
      expect(MENSAJES_CLAVE[motivo], motivo).toMatch(/^[A-ZÁÉÍÓÚ]/);
      expect(MENSAJES_CLAVE[motivo].length, motivo).toBeLessThan(200);
    }
    expect(Object.keys(MENSAJES_CLAVE).sort()).toEqual([...motivos].sort());
  });
});
