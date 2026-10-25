import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { claveItem, guidNormalizado, urlCanonica } from "./canonica";

describe("URL canónica", () => {
  it.each([
    ["https://Fuente-Prueba.Example.org/a/b/", "https://fuente-prueba.example.org/a/b"],
    ["https://fuente-prueba.example.org/", "https://fuente-prueba.example.org"],
    ["https://fuente-prueba.example.org/a#seccion", "https://fuente-prueba.example.org/a"],
    ["https://fuente-prueba.example.org/a?utm_source=rss&id=2&UTM_Medium=x", "https://fuente-prueba.example.org/a?id=2"],
    ["https://fuente-prueba.example.org/a?utm_source=rss", "https://fuente-prueba.example.org/a"],
    ["https://fuente-prueba.example.org:443/a", "https://fuente-prueba.example.org/a"],
    ["https://usuario:clave@fuente-prueba.example.org/a", "https://fuente-prueba.example.org/a"],
  ])("%s → %s", (entrada, esperada) => {
    expect(urlCanonica(entrada)).toBe(esperada);
  });

  it("conserva la consulta tal cual llegó (sin reescribir %20 como +), así la clave es estable", () => {
    expect(urlCanonica("https://x.example.org/b?q=a%20b&utm_x=1")).toBe("https://x.example.org/b?q=a%20b");
    expect(urlCanonica("https://x.example.org/b?q=a%20b")).toBe("https://x.example.org/b?q=a%20b");
  });

  it("rechaza lo que no es http(s)", () => {
    for (const mala of ["javascript:alert(1)", "data:text/html,x", "no es url", "ftp://x.example.org/a"]) {
      expect(urlCanonica(mala), mala).toBeNull();
    }
  });
});

describe("clave de deduplicación", () => {
  const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");

  it("es sha256(source_id ‖ \\n ‖ guid normalizado) cuando hay guid", () => {
    expect(claveItem("bcch", "  prueba-2026-001 ", "https://x.example.org/a")).toBe(sha("bcch\nprueba-2026-001"));
  });

  it("sin guid usa la URL canónica: utm, fragmento, mayúsculas del host y barra final no crean otro ítem", () => {
    const base = claveItem("bcch", null, "https://fuente-prueba.example.org/informes/2");
    expect(base).toBe(sha("bcch\nhttps://fuente-prueba.example.org/informes/2"));
    for (const variante of [
      "https://FUENTE-PRUEBA.example.org/informes/2/",
      "https://fuente-prueba.example.org/informes/2?utm_source=rss&utm_medium=feed",
      "https://fuente-prueba.example.org/informes/2#arriba",
    ]) {
      expect(claveItem("bcch", null, variante), variante).toBe(base);
    }
  });

  it("un guid que es una URL se canonicaliza igual que el enlace", () => {
    expect(guidNormalizado("https://X.example.org/a/?utm_campaign=1")).toBe("https://x.example.org/a");
    expect(guidNormalizado("   ")).toBeNull();
    expect(guidNormalizado("tag:x.example.org,2026:a\n  b")).toBe("tag:x.example.org,2026:a b");
  });

  it("la misma entrada en otra fuente es otro ítem, y no depende del título ni de la fecha", () => {
    expect(claveItem("bcch", "g-1", "https://x.example.org/a")).not.toBe(claveItem("cmf", "g-1", "https://x.example.org/a"));
    expect(claveItem("bcch", "g-1", "https://x.example.org/a")).toBe(claveItem("bcch", "g-1", "https://x.example.org/otra"));
  });

  it("sin guid ni URL utilizable no hay clave", () => {
    expect(claveItem("bcch", null, "javascript:alert(1)")).toBeNull();
  });
});
