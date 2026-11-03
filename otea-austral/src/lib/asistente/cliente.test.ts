import { describe, expect, it, vi } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import {
  AVISOS_DE_IA,
  ErrorAsistente,
  MENSAJES_DE_FALLO,
  RESPUESTA_INICIAL,
  SALUDO_INICIAL,
  aplicar,
  esEvento,
  esRutaInterna,
  fallar,
  lineas,
  preguntar,
  type Respuesta,
} from "./cliente";
import { RUTA_ASISTENTE, type EventoAsistente } from "./limites";

const flujo = (trozos: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const codificador = new TextEncoder();
      for (const t of trozos) c.enqueue(typeof t === "string" ? codificador.encode(t) : t);
      c.close();
    },
  });

async function recoger<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const salida: T[] = [];
  for await (const x of iterable) salida.push(x);
  return salida;
}

const ndjson = (eventos: unknown[]) => eventos.map((e) => `${JSON.stringify(e)}\n`).join("");

describe("esEvento", () => {
  it.each<unknown>([
    { t: "inicio", modo: "base" },
    { t: "inicio", modo: "ia", coincidencia: "¿Qué es?" },
    { t: "texto", d: "hola" },
    { t: "texto", d: "" },
    { t: "fuentes", items: [] },
    { t: "fuentes", items: [{ titulo: "Metodología", href: "/metodologia" }] },
    { t: "sugerencias", items: ["a", "b"] },
    { t: "error", codigo: "salida" },
    { t: "fin" },
  ])("acepta %j", (e) => expect(esEvento(e)).toBe(true));

  it.each<unknown>([
    null,
    "texto",
    42,
    [],
    {},
    { t: "otro" },
    { t: "inicio" },
    { t: "inicio", modo: "x" },
    { t: "inicio", modo: "ia", coincidencia: 5 },
    { t: "texto" },
    { t: "texto", d: 5 },
    { t: "fuentes", items: "no" },
    { t: "fuentes", items: [{ titulo: "x" }] },
    { t: "sugerencias", items: [1] },
    { t: "error", codigo: "desconocido" },
    { t: "error" },
  ])("rechaza %j", (e) => expect(esEvento(e)).toBe(false));
});

describe("lineas", () => {
  it("separa por salto de línea aunque lleguen partidas", async () => {
    expect(await recoger(lineas(flujo(["uno\ndo", "s\n", "tres"])))).toEqual(["uno", "dos", "tres"]);
  });

  it("no se rompe si un carácter de varios bytes llega partido entre dos trozos", async () => {
    const bytes = new TextEncoder().encode("¿Qué señal?\n");
    const corte = 3; // en medio de «é»
    const r = await recoger(lineas(flujo([bytes.slice(0, corte), bytes.slice(corte)])));
    expect(r).toEqual(["¿Qué señal?"]);
  });

  it("un flujo vacío no entrega nada", async () => {
    expect(await recoger(lineas(flujo([])))).toEqual([]);
    expect(await recoger(lineas(flujo(["\n\n"])))).toEqual(["", ""]);
  });
});

describe("preguntar", () => {
  const senal = () => new AbortController().signal;
  const respuesta = (cuerpo: string, init: ResponseInit = { status: 200 }) => new Response(flujo([cuerpo]), init);
  const EVENTOS: EventoAsistente[] = [
    { t: "inicio", modo: "base", coincidencia: "¿Qué es?" },
    { t: "texto", d: "Hola. " },
    { t: "fin" },
  ];

  it("envía la pregunta por POST y entrega los eventos en orden", async () => {
    const peticion = vi.fn(async () => respuesta(ndjson(EVENTOS)));
    const s = senal();
    const eventos = await recoger(preguntar({ pregunta: "¿Qué es?", anteriores: ["antes"] }, s, peticion as unknown as typeof fetch));
    expect(eventos).toEqual(EVENTOS);
    expect(peticion).toHaveBeenCalledTimes(1);
    const [url, init] = peticion.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RUTA_ASISTENTE);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ pregunta: "¿Qué es?", anteriores: ["antes"] });
    expect(init.signal).toBe(s);
    expect(init.cache).toBe("no-store");
  });

  it("ignora las líneas rotas y los eventos que no conoce", async () => {
    const cuerpo = `no es json\n${JSON.stringify({ t: "raro" })}\n\n${ndjson(EVENTOS)}`;
    const eventos = await recoger(preguntar({ pregunta: "x" }, senal(), (async () => respuesta(cuerpo)) as unknown as typeof fetch));
    expect(eventos).toEqual(EVENTOS);
  });

  it.each([
    [429, "limite"],
    [400, "invalida"],
    [403, "invalida"],
    [413, "invalida"],
    [415, "invalida"],
    [500, "servidor"],
    [503, "servidor"],
  ])("HTTP %i → %s", async (estado, tipo) => {
    const peticion = (async () => new Response("{}", { status: estado })) as unknown as typeof fetch;
    await expect(recoger(preguntar({ pregunta: "x" }, senal(), peticion))).rejects.toMatchObject({
      name: "ErrorAsistente",
      tipo,
    });
  });

  it("sin conexión → red", async () => {
    const peticion = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(recoger(preguntar({ pregunta: "x" }, senal(), peticion))).rejects.toMatchObject({ tipo: "red" });
  });

  it("si la persona cancela, el error de cancelación sigue su camino (no es un fallo del asistente)", async () => {
    const control = new AbortController();
    control.abort();
    const peticion = (async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;
    const error = await recoger(preguntar({ pregunta: "x" }, control.signal, peticion)).catch((e) => e);
    expect(error).not.toBeInstanceOf(ErrorAsistente);
    expect((error as Error).name).toBe("AbortError");
  });

  it("una respuesta que se corta antes del «fin» es un fallo, pero lo recibido ya se entregó", async () => {
    const recibidos: EventoAsistente[] = [];
    const generador = preguntar(
      { pregunta: "x" },
      senal(),
      (async () => respuesta(ndjson(EVENTOS.slice(0, 2)))) as unknown as typeof fetch,
    );
    await expect(
      (async () => {
        for await (const e of generador) recibidos.push(e);
      })(),
    ).rejects.toMatchObject({ tipo: "cortada" });
    expect(recibidos).toEqual(EVENTOS.slice(0, 2));
  });

  it("un cuerpo que falla a mitad de lectura es «cortada»", async () => {
    const roto = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(ndjson(EVENTOS.slice(0, 1))));
        c.error(new TypeError("network error"));
      },
    });
    const peticion = (async () => new Response(roto, { status: 200 })) as unknown as typeof fetch;
    await expect(recoger(preguntar({ pregunta: "x" }, senal(), peticion))).rejects.toMatchObject({ tipo: "cortada" });
  });
});

describe("aplicar", () => {
  const correr = (eventos: EventoAsistente[]) => eventos.reduce(aplicar, RESPUESTA_INICIAL);

  it("una pregunta frecuente: un bloque con su pregunta, enlaces y sugerencias", () => {
    const r = correr([
      { t: "inicio", modo: "base", coincidencia: "¿Qué es?" },
      { t: "texto", d: "Es una " },
      { t: "texto", d: "plataforma." },
      { t: "fuentes", items: [{ titulo: "Cómo funciona", href: "/#como-funciona" }] },
      { t: "sugerencias", items: ["¿Y las fuentes?"] },
      { t: "fin" },
    ]);
    expect(r).toEqual({
      bloques: [{ modo: "base", coincidencia: "¿Qué es?", texto: "Es una plataforma." }],
      fuentes: [{ titulo: "Cómo funciona", href: "/#como-funciona" }],
      sugerencias: ["¿Y las fuentes?"],
      estado: "listo",
    });
  });

  it("la respuesta se va completando con cada frase", () => {
    let r: Respuesta = RESPUESTA_INICIAL;
    r = aplicar(r, { t: "inicio", modo: "ia" });
    r = aplicar(r, { t: "texto", d: "Primera. " });
    expect(r.bloques[0].texto).toBe("Primera. ");
    expect(r.estado).toBe("cargando");
    r = aplicar(r, { t: "texto", d: "Segunda." });
    expect(r.bloques).toEqual([{ modo: "ia", coincidencia: undefined, texto: "Primera. Segunda." }]);
  });

  it("si la IA falla antes de escribir, el bloque vacío se reemplaza por el de la base", () => {
    const r = correr([
      { t: "inicio", modo: "ia" },
      { t: "error", codigo: "proveedor" },
      { t: "inicio", modo: "base", coincidencia: "¿Qué es?" },
      { t: "texto", d: "Respuesta de la base." },
      { t: "fin" },
    ]);
    expect(r.bloques).toEqual([{ modo: "base", coincidencia: "¿Qué es?", texto: "Respuesta de la base." }]);
    expect(r.aviso).toBe("proveedor");
  });

  it("si la IA falla a mitad, lo que escribió queda y la base va debajo", () => {
    const r = correr([
      { t: "inicio", modo: "ia" },
      { t: "texto", d: "Una frase de la IA. " },
      { t: "error", codigo: "salida" },
      { t: "inicio", modo: "base", coincidencia: "¿Qué es?" },
      { t: "texto", d: "La de la base." },
      { t: "fuentes", items: [{ titulo: "Metodología", href: "/metodologia" }] },
      { t: "fin" },
    ]);
    expect(r.bloques.map((b) => [b.modo, b.texto])).toEqual([
      ["ia", "Una frase de la IA. "],
      ["base", "La de la base."],
    ]);
    expect(r.aviso).toBe("salida");
    expect(r.fuentes).toEqual([{ titulo: "Metodología", href: "/metodologia" }]);
    expect(r.estado).toBe("listo");
  });

  it("un texto sin «inicio» se trata como una respuesta de la base", () => {
    expect(correr([{ t: "texto", d: "Suelto." }]).bloques).toEqual([{ modo: "base", texto: "Suelto." }]);
  });

  it("no muta el estado anterior", () => {
    const antes = Object.freeze({ ...RESPUESTA_INICIAL, bloques: Object.freeze([]) as unknown as Respuesta["bloques"] });
    expect(() => aplicar(antes, { t: "inicio", modo: "ia" })).not.toThrow();
    expect(antes.bloques).toEqual([]);
  });

  it("solo conserva enlaces del propio sitio: nada de otros dominios, esquemas ni rutas con huecos", () => {
    const r = aplicar(RESPUESTA_INICIAL, {
      t: "fuentes",
      items: [
        { titulo: "Metodología", href: "/metodologia" },
        { titulo: "Ancla", href: "/#temas" },
        { titulo: "Otro sitio", href: "https://ejemplo.com" },
        { titulo: "Mismo esquema", href: "//ejemplo.com/x" },
        { titulo: "Código", href: "javascript:alert(1)" },
        { titulo: "Barra invertida", href: "/\\ejemplo.com" },
        { titulo: "Con espacio", href: "/a b" },
      ],
    });
    expect(r.fuentes.map((e) => e.href)).toEqual(["/metodologia", "/#temas"]);
  });

  it("fallar conserva lo que ya había llegado", () => {
    const r = fallar(correr([{ t: "inicio", modo: "ia" }, { t: "texto", d: "Algo. " }]), "cortada");
    expect(r.estado).toBe("fallo");
    expect(r.fallo).toBe("cortada");
    expect(r.bloques[0].texto).toBe("Algo. ");
  });
});

describe("esRutaInterna", () => {
  it.each(["/", "/metodologia", "/#como-funciona", "/alertas?tema=cobre", "/seguridad#reportar"])("acepta %s", (href) => {
    expect(esRutaInterna(href)).toBe(true);
  });

  it.each([
    "",
    "metodologia",
    "#temas",
    "//ejemplo.com",
    "/\\ejemplo.com",
    "https://ejemplo.com",
    "http://ejemplo.com/",
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "/con espacio",
    "/con\nsalto",
    "/con\ttab",
    "/\u0000nulo",
  ])("rechaza %j", (href) => {
    expect(esRutaInterna(href)).toBe(false);
  });
});

describe("textos de la interfaz", () => {
  it("hay uno por cada caso y cumplen las reglas de lenguaje del sitio", () => {
    expect(Object.keys(AVISOS_DE_IA).sort()).toEqual(["interno", "limite", "proveedor", "salida"]);
    expect(Object.keys(MENSAJES_DE_FALLO).sort()).toEqual(["cortada", "invalida", "limite", "red", "servidor"]);
    for (const texto of [SALUDO_INICIAL, ...Object.values(AVISOS_DE_IA), ...Object.values(MENSAJES_DE_FALLO)]) {
      expect(frasesProhibidas(texto), texto).toEqual([]);
      expect(texto.length).toBeGreaterThan(20);
    }
  });
});
