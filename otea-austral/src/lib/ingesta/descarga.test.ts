import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearServidorFuentesFalsas } from "../../../scripts/lib/fuentes-falsas.mjs";
import type { Feed } from "@/lib/domain/schemas";
import {
  MAX_REINTENTO_MS,
  agenteIngesta,
  crearDescargador,
  destinoPermitido,
  destinoSeguro,
  reintentoDesde,
  type ConfigDescarga,
  type FuenteDescarga,
} from "./descarga";

/**
 * `descarga.ts` contra un servidor local de fuentes falsas (fixtures sintéticos de prueba): nada sale a internet. La
 * validación usa siempre la URL del registro; `origenPrueba` solo cambia a dónde se conecta.
 */
const BASE = "https://fuente-prueba.example.org/";
const feed = (ruta: string, formato: Feed["formato"] = "rss"): Feed => ({
  url: `https://fuente-prueba.example.org${ruta}`,
  formato,
  titulo: "Feed de prueba (ejemplo)",
  verificado: "2026-10-24",
});
const RUTAS = [
  "/canal.rss.xml",
  "/especial/redirige-dentro",
  "/especial/redirige-fuera",
  "/especial/redirige-sufijo",
  "/especial/redirige-http",
  "/especial/redirige-ip",
  "/especial/bucle",
  "/especial/lento",
  "/especial/goteo",
  "/especial/gigante.rss.xml",
  "/especial/gigante-declarado.rss.xml",
  "/especial/tipo-html",
  "/especial/ritmo",
  "/especial/caido",
  "/especial/error",
  "/no-existe.rss.xml",
];
const FUENTE: FuenteDescarga = {
  url_base: BASE,
  feeds: [...RUTAS.map((r) => feed(r)), feed("/canal.atom.xml", "atom"), feed("/api.json", "api")],
};
const AGENTE = agenteIngesta("https://oteaustral.example.org", "mailto:ingesta@example.org");

let servidor: Awaited<ReturnType<typeof crearServidorFuentesFalsas>>;
beforeAll(async () => {
  servidor = await crearServidorFuentesFalsas();
});
afterAll(async () => {
  await servidor?.cerrar();
});
beforeEach(() => {
  servidor.solicitudes.length = 0;
});

const descargador = (extra: Partial<ConfigDescarga> = {}) =>
  crearDescargador({ agente: AGENTE, origenPrueba: servidor.url, pausaHostMs: 0, ...extra });
const pedir = (ruta: string, extra: Partial<ConfigDescarga> = {}) =>
  descargador(extra)({ fuente: FUENTE, url: `https://fuente-prueba.example.org${ruta}`, clase: "feed_xml" });

describe("validación antes de conectar", () => {
  it.each([
    ["https://fuente-prueba.example.org/otro.rss.xml", "no es un feed verificado del registro"],
    ["http://fuente-prueba.example.org/canal.rss.xml", "http"],
    ["https://fuente-prueba.example.org:8443/canal.rss.xml", "otro puerto"],
    ["https://usuario:clave@fuente-prueba.example.org/canal.rss.xml", "credenciales"],
    ["https://127.0.0.1/canal.rss.xml", "IP literal"],
    ["https://otro-dominio.example.net/canal.rss.xml", "otro dominio"],
    ["https://fuente-prueba.example.org.otro-dominio.example.net/canal.rss.xml", "sufijo engañoso"],
    ["javascript:alert(1)", "otro esquema"],
  ])("rechaza %s (%s) sin hacer ninguna solicitud", async (url) => {
    const r = await descargador()({ fuente: FUENTE, url, clase: "feed_xml" });
    expect(r).toEqual({ estado: "error", codigo: "destino" });
    expect(servidor.solicitudes).toEqual([]);
  });

  it("un feed solo se pide con la clase de su formato; robots.txt solo en la raíz", () => {
    expect(destinoPermitido(`${BASE}api.json`, FUENTE, "feed_xml")).toBeNull();
    expect(destinoPermitido(`${BASE}api.json`, FUENTE, "feed_json")?.href).toBe(`${BASE}api.json`);
    expect(destinoPermitido(`${BASE}robots.txt`, FUENTE, "robots")?.href).toBe(`${BASE}robots.txt`);
    expect(destinoPermitido(`${BASE}x/robots.txt`, FUENTE, "robots")).toBeNull();
    expect(destinoPermitido(`${BASE}robots.txt?x=1`, FUENTE, "robots")).toBeNull();
    expect(destinoPermitido("https://www.fuente-prueba.example.org/robots.txt", FUENTE, "robots")).not.toBeNull();
  });

  it("destinoSeguro: https, 443, sin credenciales, sin IP y dentro del dominio", () => {
    expect(destinoSeguro("https://si3.fuente-prueba.example.org/a", BASE)).not.toBeNull();
    expect(destinoSeguro("https://[::1]/a", BASE)).toBeNull();
    expect(destinoSeguro("https://fuente-prueba.example.org./a", BASE)).toBeNull();
    expect(destinoSeguro("https://fuente-prueba.example.org:443/a", BASE)?.href).toBe("https://fuente-prueba.example.org/a");
  });
});

describe("lectura", () => {
  it("lee un feed verificado y declara el User-Agent con contacto", async () => {
    const r = await pedir("/canal.rss.xml");
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(new TextDecoder().decode(r.cuerpo)).toContain('<rss version="2.0"');
    expect(r.tipo).toMatch(/^application\/rss\+xml/);
    expect(r.etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(r.ultimaModificacion).toBe("Fri, 23 Oct 2026 12:00:00 GMT");
    expect(servidor.solicitudes[0]).toMatchObject({
      host: "fuente-prueba.example.org",
      ruta: "/canal.rss.xml",
      metodo: "GET",
      agente: "OteaAustral/1.0 (+https://oteaustral.example.org/fuentes; mailto:ingesta@example.org)",
    });
  });

  it("con el ETag guardado, un 304 no trae cuerpo (sin_cambios)", async () => {
    const primera = await pedir("/canal.rss.xml");
    if (primera.estado !== "ok") throw new Error("primera lectura fallida");
    const r = await descargador()({
      fuente: FUENTE,
      url: `${BASE}canal.rss.xml`,
      clase: "feed_xml",
      etag: primera.etag,
      ultimaModificacion: primera.ultimaModificacion,
    });
    expect(r).toEqual({ estado: "sin_cambios", url: `${BASE}canal.rss.xml` });
    expect(servidor.solicitudes[1]).toMatchObject({ siNoCoincide: primera.etag, siModificado: primera.ultimaModificacion });
  });

  it("no reenvía un ETag guardado con saltos de línea (inyección de cabeceras)", async () => {
    await descargador()({ fuente: FUENTE, url: `${BASE}canal.rss.xml`, clase: "feed_xml", etag: '"a"\r\nX-Inyectada: 1' });
    expect(servidor.solicitudes[0].siNoCoincide).toBeNull();
  });

  it("lee la API JSON con su clase", async () => {
    const r = await descargador()({ fuente: FUENTE, url: `${BASE}api.json`, clase: "feed_json" });
    expect(r.estado).toBe("ok");
  });
});

describe("redirecciones: cada salto se valida otra vez", () => {
  it("sigue una redirección dentro del dominio", async () => {
    const r = await pedir("/especial/redirige-dentro");
    expect(r).toMatchObject({ estado: "ok", url: `${BASE}canal.rss.xml` });
    expect(servidor.solicitudes.map((s) => s.ruta)).toEqual(["/especial/redirige-dentro", "/canal.rss.xml"]);
  });

  it.each([
    ["/especial/redirige-fuera", "redireccion_fuera"],
    ["/especial/redirige-sufijo", "redireccion_fuera"],
    ["/especial/redirige-ip", "redireccion_fuera"],
    ["/especial/redirige-http", "redireccion_http"],
  ])("%s → %s, sin conectar con el destino", async (ruta, codigo) => {
    expect(await pedir(ruta)).toMatchObject({ estado: "error", codigo });
    expect(servidor.solicitudes).toHaveLength(1);
  });

  it("como mucho 3 saltos", async () => {
    expect(await pedir("/especial/bucle")).toMatchObject({ estado: "error", codigo: "redirecciones" });
    expect(servidor.solicitudes).toHaveLength(4);
  });
});

describe("tiempo, tamaño y tipo", () => {
  it("corta por tiempo esperando la respuesta y leyendo un cuerpo que gotea", async () => {
    expect(await pedir("/especial/lento", { tiempoMs: 300 })).toEqual({ estado: "error", codigo: "tiempo" });
    const inicio = Date.now();
    expect(await pedir("/especial/goteo", { tiempoMs: 500 })).toEqual({ estado: "error", codigo: "tiempo" });
    expect(Date.now() - inicio).toBeLessThan(3_000);
  });

  it("corta al pasar 1 MB leyendo en flujo, y antes de leer si el largo declarado ya lo pasa", async () => {
    expect(await pedir("/especial/gigante.rss.xml")).toMatchObject({ estado: "error", codigo: "tamano" });
    const inicio = Date.now();
    expect(await pedir("/especial/gigante-declarado.rss.xml")).toMatchObject({ estado: "error", codigo: "tamano" });
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("rechaza un tipo de contenido incorrecto", async () => {
    expect(await pedir("/especial/tipo-html")).toMatchObject({ estado: "error", codigo: "tipo" });
    const robots = await descargador()({ fuente: FUENTE, url: `${BASE}robots.txt`, clase: "robots" });
    expect(robots.estado).toBe("ok");
  });

  it("la señal de la corrida corta lo que esté en curso", async () => {
    const corrida = new AbortController();
    setTimeout(() => corrida.abort(), 200);
    const r = await descargador()({ fuente: FUENTE, url: `${BASE}especial/lento`, clase: "feed_xml", senal: corrida.signal });
    expect(r).toEqual({ estado: "error", codigo: "tiempo" });
  });
});

describe("respuestas de error y Retry-After", () => {
  it("429 con Retry-After en segundos", async () => {
    const ahora = Date.parse("2026-10-25T12:00:00Z");
    const r = await pedir("/especial/ritmo", { reloj: () => ahora });
    expect(r).toEqual({ estado: "error", codigo: "ritmo", http: 429, reintentarDesde: new Date(ahora + 120_000) });
  });

  it("503 con un Retry-After enorme queda acotado a 24 h", async () => {
    const ahora = Date.parse("2026-10-25T12:00:00Z");
    const r = await pedir("/especial/caido", { reloj: () => ahora });
    expect(r).toEqual({ estado: "error", codigo: "http_servidor", http: 503, reintentarDesde: new Date(ahora + MAX_REINTENTO_MS) });
  });

  it("500 y 404", async () => {
    expect(await pedir("/especial/error")).toEqual({ estado: "error", codigo: "http_servidor", http: 500 });
    expect(await pedir("/no-existe.rss.xml")).toEqual({ estado: "error", codigo: "no_encontrado", http: 404 });
  });

  it("reintentoDesde entiende segundos y fechas HTTP, y nunca pasa de 24 h ni va hacia atrás", () => {
    const ahora = Date.parse("2026-10-25T12:00:00Z");
    expect(reintentoDesde("30", ahora)).toEqual(new Date(ahora + 30_000));
    expect(reintentoDesde("Sun, 25 Oct 2026 13:00:00 GMT", ahora)).toEqual(new Date(ahora + 3_600_000));
    expect(reintentoDesde("Sat, 24 Oct 2026 13:00:00 GMT", ahora)).toEqual(new Date(ahora));
    expect(reintentoDesde("9999999999", ahora)).toEqual(new Date(ahora + MAX_REINTENTO_MS));
    expect(reintentoDesde("pronto", ahora)).toBeUndefined();
    expect(reintentoDesde(null, ahora)).toBeUndefined();
  });
});

describe("ritmo e identidad", () => {
  it("espera 2 s entre solicitudes al mismo host, no entre hosts distintos", async () => {
    let ahora = 1_000_000;
    const esperas: number[] = [];
    const descargar = crearDescargador({
      agente: AGENTE,
      origenPrueba: servidor.url,
      reloj: () => ahora,
      esperar: async (ms) => {
        esperas.push(ms);
        ahora += ms;
      },
    });
    const otra: FuenteDescarga = { url_base: "https://robots-libre.example.org/", feeds: [] };
    await descargar({ fuente: FUENTE, url: `${BASE}canal.rss.xml`, clase: "feed_xml" });
    ahora += 500;
    await descargar({ fuente: otra, url: "https://robots-libre.example.org/robots.txt", clase: "robots" });
    await descargar({ fuente: FUENTE, url: `${BASE}robots.txt`, clase: "robots" });
    expect(esperas).toEqual([1_500]);
  });

  it("el User-Agent no admite saltos de línea ni caracteres fuera de ASCII visible", () => {
    expect(() => crearDescargador({ agente: "OteaAustral/1.0\r\nX: y" })).toThrow();
    expect(agenteIngesta("https://oteaustral.com/", "mailto:ingesta@oteaustral.com")).toBe(
      "OteaAustral/1.0 (+https://oteaustral.com/fuentes; mailto:ingesta@oteaustral.com)",
    );
  });
});
