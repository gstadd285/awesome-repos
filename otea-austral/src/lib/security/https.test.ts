import { describe, expect, it } from "vitest";
import { destinoHttps } from "./https";

const SITIO = "https://oteaustral.example.org";
const base = { reenviado: "http", ruta: "/alertas", busqueda: "?tema=cobre", sitio: SITIO, produccion: true };

describe("HTTPS forzado (control 19)", () => {
  it("redirige al mismo camino y parámetros en el dominio configurado", () => {
    expect(destinoHttps(base)).toBe("https://oteaustral.example.org/alertas?tema=cobre");
    expect(destinoHttps({ ...base, ruta: "/", busqueda: "" })).toBe("https://oteaustral.example.org/");
  });

  it("no redirige si la solicitud ya llegó por https o no hay cabecera (sonda de Cloud Run, pruebas locales)", () => {
    expect(destinoHttps({ ...base, reenviado: "https" })).toBeNull();
    expect(destinoHttps({ ...base, reenviado: null })).toBeNull();
    expect(destinoHttps({ ...base, reenviado: "" })).toBeNull();
    expect(destinoHttps({ ...base, reenviado: "ftp" })).toBeNull();
  });

  it("con varios proxies manda el último, el de confianza: una cabecera inventada por el cliente no basta", () => {
    expect(destinoHttps({ ...base, reenviado: "http, https" })).toBeNull();
    expect(destinoHttps({ ...base, reenviado: "https, http" })).not.toBeNull();
    expect(destinoHttps({ ...base, reenviado: " HTTP " })).not.toBeNull();
  });

  it("solo en producción y solo si el dominio configurado es https", () => {
    expect(destinoHttps({ ...base, produccion: false })).toBeNull();
    expect(destinoHttps({ ...base, sitio: "http://localhost:3000" })).toBeNull();
  });

  it("una ruta tramposa no puede cambiar de dominio (redirección abierta)", () => {
    for (const ruta of ["//evil.example/x", "///evil.example", "/\\evil.example", "/@evil.example", "/%2F%2Fevil.example"]) {
      const destino = destinoHttps({ ...base, ruta, busqueda: "" });
      expect(new URL(destino ?? "").origin, ruta).toBe(SITIO);
    }
  });

  it("no arrastra un fragmento ni credenciales", () => {
    expect(destinoHttps({ ...base, ruta: "/x#a", busqueda: "" })).toBe("https://oteaustral.example.org/x%23a");
    expect(new URL(destinoHttps({ ...base, ruta: "/u:p@evil.example" }) ?? "").username).toBe("");
  });
});
