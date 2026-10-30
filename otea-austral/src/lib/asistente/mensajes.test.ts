import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { MAX_PREGUNTA } from "./limites";
import { MENSAJES } from "./mensajes";
import { revisarFrase } from "./salida";

describe("respuestas fijas", () => {
  it("cumplen las reglas de lenguaje del sitio y las de la revisión de salida", () => {
    for (const [nombre, texto] of Object.entries(MENSAJES)) {
      expect(frasesProhibidas(texto), nombre).toEqual([]);
      expect(revisarFrase(texto, texto), nombre).toBeUndefined();
      expect(texto.length, nombre).toBeLessThan(MAX_PREGUNTA);
    }
  });

  it("la de datos personales dice la verdad: no se guardó ni se envió", () => {
    expect(MENSAJES.datosPersonales).toMatch(/no se guardó ni se envió a ningún proveedor/);
  });
});
