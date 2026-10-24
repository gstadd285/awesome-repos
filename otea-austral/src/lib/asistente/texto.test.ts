import { describe, expect, it } from "vitest";
import { normalizar, raiz, raices } from "./texto";

describe("normalizar", () => {
  it("quita tildes, mayúsculas y signos", () => {
    expect(normalizar("¿Cómo CALCULAN la confianza?")).toBe("como calculan la confianza");
    expect(normalizar("  Año  nuevo… ")).toBe("ano nuevo");
    expect(normalizar("EE.UU.–China")).toBe("ee uu china");
  });
});

describe("raiz", () => {
  it("une singular y plural", () => {
    expect(raiz("fuente")).toBe(raiz("fuentes"));
    expect(raiz("alerta")).toBe(raiz("alertas"));
    expect(raiz("real")).toBe(raiz("reales"));
    expect(raiz("sector")).toBe(raiz("sectores"));
    expect(raiz("organismo")).toBe(raiz("organismos"));
  });

  it("une las variantes de una misma palabra", () => {
    expect(raiz("confianza")).toBe(raiz("confiable"));
    expect(raiz("verificacion")).toBe(raiz("verificamos"));
    expect(raiz("calculan")).toBe(raiz("calcula"));
  });

  it("separa palabras distintas", () => {
    expect(raiz("confianza")).not.toBe(raiz("confirmar"));
    expect(raiz("precio")).not.toBe(raiz("primaria"));
  });

  it("quita el pronombre pegado a un infinitivo", () => {
    expect(raiz("usarlo")).toBe(raiz("usar"));
  });

  it("deja las palabras cortas como están", () => {
    expect(raiz("gas")).toBe("gas");
    expect(raiz("tema")).toBe("tema");
  });
});

describe("raices", () => {
  it("descarta las palabras vacías y conserva las que cambian el sentido", () => {
    expect(raices("¿Qué es lo que hace la plataforma?")).toEqual(["plataf"]);
    expect(raices("sin fuentes")).toEqual(["sin", "fuente"]);
    expect(raices("no es asesoría")).toEqual(["no", "asesor"]);
  });

  it("no devuelve nada si solo hay palabras vacías", () => {
    expect(raices("¿Y eso?")).toEqual([]);
    expect(raices("hola, gracias")).toEqual([]);
  });
});
