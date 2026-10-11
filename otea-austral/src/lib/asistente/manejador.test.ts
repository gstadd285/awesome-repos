import { describe, expect, it, vi } from "vitest";
import type { SecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter } from "@/lib/security/rate-limit";
import { MAX_CUERPO_BYTES, MAX_PREGUNTA, type EventoAsistente } from "./limites";
import { crearManejadorAsistente, esMismoOrigen, type DependenciasManejador } from "./manejador";
import type { Consulta } from "./servicio";

const URL_API = "https://oteaustral.example/api/asistente";

function solicitud(cuerpo: unknown, cabeceras: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(URL_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "oteaustral.example",
      "x-forwarded-for": "203.0.113.7",
      ...cabeceras,
    },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    ...init,
  });
}

const EVENTOS: EventoAsistente[] = [
  { t: "inicio", modo: "base", coincidencia: "¿Qué es?" },
  { t: "texto", d: "Hola. " },
  { t: "fin" },
];

function crear(extra: Partial<DependenciasManejador> = {}) {
  const consultas: Consulta[] = [];
  const senales: AbortSignal[] = [];
  const registros: SecurityEvent[] = [];
  const { responder: propio, ...resto } = extra;
  const manejador = crearManejadorAsistente({
    registrar: (e) => registros.push(e),
    ...resto,
    responder: (consulta, senal) => {
      consultas.push(consulta);
      senales.push(senal);
      return propio ? propio(consulta, senal) : (async function* () { yield* EVENTOS; })();
    },
  });
  return { manejador, consultas, senales, registros };
}

async function lineas(respuesta: Response): Promise<EventoAsistente[]> {
  const texto = await respuesta.text();
  return texto
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EventoAsistente);
}

describe("POST /api/asistente", () => {
  it("transmite los eventos como NDJSON, sin guardar en caché", async () => {
    const { manejador, consultas } = crear();
    const r = await manejador(solicitud({ pregunta: "¿Qué es Otea?" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-accel-buffering")).toBe("no");
    expect(await lineas(r)).toEqual(EVENTOS);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].pregunta).toBe("¿Qué es Otea?");
    expect(consultas[0].anteriores).toEqual([]);
  });

  it("limpia la pregunta y las anteriores antes de entregarlas al servicio", async () => {
    const { manejador, consultas } = crear();
    await (
      await manejador(
        solicitud({ pregunta: "  ¿Qué\u200B   es\n Otea?  ", anteriores: ["  antes \u202E 1 ", "   "] }),
      )
    ).text();
    expect(consultas[0].pregunta).toBe("¿Qué es Otea?");
    expect(consultas[0].anteriores).toEqual(["antes 1"]);
  });

  describe("rechaza lo que no corresponde", () => {
    it.each([
      ["texto plano", { "content-type": "text/plain" }, 415, "tipo"],
      ["formulario", { "content-type": "application/x-www-form-urlencoded" }, 415, "tipo"],
      ["otro origen", { origin: "https://malo.example" }, 403, "origen"],
      ["otro sitio (Sec-Fetch-Site)", { "sec-fetch-site": "cross-site" }, 403, "origen"],
      ["origen nulo", { origin: "null" }, 403, "origen"],
    ])("%s", async (_n, cabeceras, estado, codigo) => {
      const { manejador, consultas } = crear();
      const r = await manejador(solicitud({ pregunta: "hola" }, cabeceras));
      expect(r.status).toBe(estado);
      expect(await r.json()).toEqual({ error: codigo });
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(consultas).toHaveLength(0);
    });

    it.each([
      ["JSON roto", "{no es json"],
      ["no es un objeto", "[]"],
      ["sin pregunta", {}],
      ["pregunta que no es texto", { pregunta: 42 }],
      ["campo de más", { pregunta: "hola", rol: "system" }],
      ["anteriores que no es lista", { pregunta: "hola", anteriores: "x" }],
      ["demasiadas anteriores", { pregunta: "hola", anteriores: ["a", "b", "c"] }],
      ["anteriores con algo que no es texto", { pregunta: "hola", anteriores: [1] }],
    ])("cuerpo inválido: %s", async (_n, cuerpo) => {
      const { manejador, consultas } = crear();
      const r = await manejador(solicitud(cuerpo));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "invalida" });
      expect(consultas).toHaveLength(0);
    });

    it("pregunta vacía o demasiado larga", async () => {
      const { manejador, consultas } = crear();
      const vacia = await manejador(solicitud({ pregunta: " \u200B " }));
      expect([vacia.status, await vacia.json()]).toEqual([400, { error: "vacia" }]);
      const larga = await manejador(solicitud({ pregunta: "a".repeat(MAX_PREGUNTA + 1) }));
      expect([larga.status, await larga.json()]).toEqual([400, { error: "larga" }]);
      const justa = await manejador(solicitud({ pregunta: "a".repeat(MAX_PREGUNTA) }));
      expect(justa.status).toBe(200);
      await justa.text();
      expect(consultas).toHaveLength(1);
    });

    it("cuerpo demasiado grande (declarado o real)", async () => {
      const { manejador, consultas } = crear();
      const grande = JSON.stringify({ pregunta: "x", relleno: "y".repeat(MAX_CUERPO_BYTES) });
      const declarado = await manejador(solicitud(grande, { "content-length": String(grande.length) }));
      expect([declarado.status, await declarado.json()]).toEqual([413, { error: "grande" }]);
      const real = await manejador(solicitud(grande));
      expect([real.status, await real.json()]).toEqual([413, { error: "grande" }]);
      expect(consultas).toHaveLength(0);
    });
  });

  describe("origen", () => {
    it("acepta la propia página y las solicitudes sin Origin", () => {
      expect(esMismoOrigen(new Headers({ origin: "https://oteaustral.example", host: "oteaustral.example" }))).toBe(true);
      expect(esMismoOrigen(new Headers({ host: "oteaustral.example" }))).toBe(true);
      expect(esMismoOrigen(new Headers({ "sec-fetch-site": "same-origin", host: "x" }))).toBe(true);
    });

    it("detrás de un proxy usa el host reenviado", () => {
      const h = new Headers({ origin: "https://oteaustral.example", host: "interno:8080", "x-forwarded-host": "oteaustral.example" });
      expect(esMismoOrigen(h)).toBe(true);
    });

    it("rechaza un Origin con otro host, con otro puerto o ilegible", () => {
      expect(esMismoOrigen(new Headers({ origin: "https://oteaustral.example.malo.com", host: "oteaustral.example" }))).toBe(false);
      expect(esMismoOrigen(new Headers({ origin: "https://oteaustral.example:8443", host: "oteaustral.example" }))).toBe(false);
      expect(esMismoOrigen(new Headers({ origin: "no es una url", host: "oteaustral.example" }))).toBe(false);
      expect(esMismoOrigen(new Headers({ origin: "https://a.example" }))).toBe(false); // sin host con qué comparar
    });
  });

  describe("límites por persona", () => {
    const ahora = () => 0;

    it("corta con 429 y Retry-After, y avisa una sola vez por minuto", async () => {
      const porMinuto = createFixedWindowLimiter({ limite: 2, ventanaMs: 60_000, ahora });
      const { manejador, consultas, registros } = crear({ porMinuto });
      for (let i = 0; i < 2; i++) await (await manejador(solicitud({ pregunta: "hola" }))).text();
      const tercera = await manejador(solicitud({ pregunta: "hola" }));
      const cuarta = await manejador(solicitud({ pregunta: "hola" }));
      expect(tercera.status).toBe(429);
      expect(tercera.headers.get("retry-after")).toBe("60");
      expect(await tercera.json()).toEqual({ error: "limite" });
      expect(cuarta.status).toBe(429);
      expect(consultas).toHaveLength(2);
      expect(registros).toEqual([{ tipo: "limite_excedido", recurso: "asistente" }]);
    });

    it("también hay un tope por día", async () => {
      const porDia = createFixedWindowLimiter({ limite: 1, ventanaMs: 86_400_000, ahora });
      const { manejador } = crear({ porDia });
      await (await manejador(solicitud({ pregunta: "hola" }))).text();
      expect((await manejador(solicitud({ pregunta: "hola" }))).status).toBe(429);
    });

    it("cuenta a cada persona por separado y no cuenta las solicitudes que ya venían mal", async () => {
      const porMinuto = createFixedWindowLimiter({ limite: 1, ventanaMs: 60_000, ahora });
      const { manejador } = crear({ porMinuto });
      expect((await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(200);
      expect((await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "198.51.100.2" }))).status).toBe(200);
      expect((await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(429);
      // Un tipo de contenido incorrecto se rechaza antes de gastar cupo.
      const sinCupo = crear({ porMinuto: createFixedWindowLimiter({ limite: 1, ventanaMs: 60_000, ahora }) });
      expect((await sinCupo.manejador(solicitud({}, { "content-type": "text/plain" }))).status).toBe(415);
      expect((await sinCupo.manejador(solicitud({ pregunta: "hola" }))).status).toBe(200);
    });

    it("la IP que cuenta es la que dejó el último proxy de confianza: lo anterior lo escribe cualquiera", async () => {
      const porMinuto = createFixedWindowLimiter({ limite: 1, ventanaMs: 60_000, ahora });
      const { manejador } = crear({ porMinuto, proxiesConfiables: 1 });
      const a = await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
      const b = await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "2.2.2.2, 203.0.113.9" }));
      expect(a.status).toBe(200);
      expect(b.status).toBe(429); // mismo cliente real, aunque cambie lo que él escribe al principio
    });

    it("la clave que recibe el servicio no es la IP ni se parece a ella", async () => {
      const { manejador, consultas } = crear();
      await (await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "203.0.113.7" }))).text();
      await (await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "203.0.113.7" }))).text();
      await (await manejador(solicitud({ pregunta: "hola" }, { "x-forwarded-for": "203.0.113.8" }))).text();
      const [a, b, c] = consultas.map((q) => q.clave);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(JSON.stringify(consultas)).not.toContain("203.0.113");
    });
  });

  describe("transmisión", () => {
    it("si el servicio falla a mitad, la persona recibe un error genérico y la conexión se cierra", async () => {
      const { manejador } = crear({
        responder: async function* () {
          yield EVENTOS[0];
          throw new Error("detalle interno: sk-ant-secreto");
        },
      });
      const r = await manejador(solicitud({ pregunta: "hola" }));
      const texto = await r.text();
      expect(await lineas(new Response(texto))).toEqual([EVENTOS[0], { t: "error", codigo: "interno" }]);
      expect(texto).not.toContain("secreto");
      expect(texto).not.toContain("detalle");
    });

    it("si la persona cierra la conexión, el servicio se entera: señal cancelada y generador cerrado", async () => {
      const cerrado = vi.fn();
      const { manejador, senales } = crear({
        responder: async function* () {
          try {
            yield EVENTOS[0];
            await new Promise((r) => setTimeout(r, 1_000));
            yield EVENTOS[1];
          } finally {
            cerrado();
          }
        },
      });
      const r = await manejador(solicitud({ pregunta: "hola" }));
      const lector = r.body!.getReader();
      await lector.read(); // primera línea
      await lector.cancel();
      expect(senales[0].aborted).toBe(true);
      expect(cerrado).toHaveBeenCalled();
    });

    it("la señal del servicio también se cancela con la de la solicitud", async () => {
      const control = new AbortController();
      const { manejador, senales } = crear();
      const r = await manejador(solicitud({ pregunta: "hola" }, {}, { signal: control.signal }));
      await r.text();
      expect(senales[0].aborted).toBe(false);
      control.abort();
      expect(senales[0].aborted).toBe(true);
    });
  });
});
