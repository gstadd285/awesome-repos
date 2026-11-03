import { describe, expect, it } from "vitest";
import { TIPOS_DE_EVENTO } from "./almacen";
import { DESCRIPCION_EVENTO, enmascararCorreo, etiquetaDispositivo } from "./formato";

describe("correo enmascarado", () => {
  it("deja la primera letra y el dominio", () => {
    expect(enmascararCorreo("ana.perez@correo.cl")).toBe("a***@correo.cl");
    expect(enmascararCorreo("x@y.cl")).toBe("x***@y.cl");
    expect(enmascararCorreo("ñandú@correo.cl")).toBe("ñ***@correo.cl");
    expect(enmascararCorreo("😀@correo.cl")).toBe("😀***@correo.cl");
  });

  it("si no parece un correo, no muestra nada", () => {
    expect(enmascararCorreo("")).toBe("***");
    expect(enmascararCorreo("sin-arroba")).toBe("***");
    expect(enmascararCorreo("@dominio.cl")).toBe("***");
  });
});

describe("etiqueta del dispositivo", () => {
  const casos: [string, string][] = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome en Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Edge en Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Safari en macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox en Linux"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari en iOS"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Chrome en Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0", "Opera en Windows"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome en ChromeOS"],
  ];
  it.each(casos)("%s → %s", (agente, esperado) => {
    expect(etiquetaDispositivo(agente)).toBe(esperado);
  });

  it("sin agente o con uno desconocido, no inventa nada", () => {
    expect(etiquetaDispositivo(null)).toBeNull();
    expect(etiquetaDispositivo(undefined)).toBeNull();
    expect(etiquetaDispositivo("")).toBeNull();
    expect(etiquetaDispositivo("curl/8.0")).toBeNull();
    expect(etiquetaDispositivo("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows");
  });

  it("la etiqueta es corta aunque el agente sea enorme, y nunca lleva el agente completo", () => {
    const enorme = `Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537 ${"x".repeat(10_000)}`;
    const etiqueta = etiquetaDispositivo(enorme)!;
    expect(etiqueta).toBe("Chrome en Windows");
    expect(etiqueta.length).toBeLessThanOrEqual(60);
  });
});

describe("descripción de los eventos", () => {
  it("cada tipo de evento que guarda la base tiene su frase, y no sobra ninguna", () => {
    expect(Object.keys(DESCRIPCION_EVENTO).sort()).toEqual([...TIPOS_DE_EVENTO].sort());
    for (const frase of Object.values(DESCRIPCION_EVENTO)) expect(frase.length).toBeGreaterThan(10);
  });
});
