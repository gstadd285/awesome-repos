import { describe, expect, it, vi } from "vitest";
import type { Feed, Source } from "@/lib/domain/schemas";
import type { SecurityEvent } from "@/lib/security/log";
import { REGISTRO_FUENTES } from "@/lib/sources/registry";
import type { Descarga, Descargador, SolicitudDescarga } from "./descarga";
import {
  PAUSA_MS,
  correrIngesta,
  feedsElegibles,
  type AlmacenIngesta,
  type Corrida,
  type EstadoFeed,
  type ItemParaGuardar,
  type Turno,
} from "./servicio";

// Fuentes y feeds SINTÉTICOS de prueba (organismos «(ejemplo)», dominios example.org): nunca se presentan como reales.
const feed = (url: string, formato: Feed["formato"] = "rss"): Feed => ({ url, formato, titulo: "Feed de prueba (ejemplo)", verificado: "2026-10-24" });
const fuente = (id: string, feeds: Feed[], extra: Partial<Source> = {}): Source => ({
  id,
  nombre: "Fuente de prueba (ejemplo)",
  organismo: `Organismo ${id} (ejemplo)`,
  url_base: "https://fuente-prueba.example.org/",
  tipo: "primaria",
  temas: [],
  acceso: "rss",
  feeds,
  condiciones_reutilizacion: "Verificadas el 2026-10-24: datos sintéticos de prueba (ejemplo).",
  prioridad: "A",
  activa: true,
  ...extra,
});
const FEED = "https://fuente-prueba.example.org/canal.rss.xml";
const RSS =
  '<rss version="2.0"><channel><item><title>Ítem de prueba (ejemplo)</title>' +
  "<link>https://fuente-prueba.example.org/a</link><guid>g-1</guid><description>TEXTO-DE-LA-FUENTE</description></item></channel></rss>";

function almacenMemoria() {
  const estados = new Map<string, EstadoFeed>();
  const items = new Map<string, ItemParaGuardar>();
  const corridas: Corrida[] = [];
  const almacen: AlmacenIngesta = {
    async estadoFeed(feedUrl, sourceId) {
      if (!estados.has(feedUrl)) {
        estados.set(feedUrl, {
          feedUrl, sourceId, etag: null, ultimaModificacion: null, ultimoIntento: null, ultimoOk: null,
          fallosSeguidos: 0, pausadoHasta: null, robots: "sin_revisar", robotsRevisado: null, ultimoError: null,
        });
      }
      return { ...estados.get(feedUrl)! };
    },
    async guardarEstado(e) {
      estados.set(e.feedUrl, { ...e });
    },
    async guardarItems(lista) {
      let nuevos = 0;
      for (const i of lista) {
        const k = `${i.sourceId}|${i.clave}`;
        if (!items.has(k)) {
          items.set(k, i);
          nuevos++;
        }
      }
      return nuevos;
    },
    async registrarCorrida(c) {
      corridas.push(c);
    },
  };
  return { estados, items, corridas, almacen };
}

function turnoMemoria(): Turno & { ocupado: boolean } {
  return {
    ocupado: false,
    async tomar() {
      if (this.ocupado) return null;
      this.ocupado = true;
      return "ficha";
    },
    async soltar() {
      this.ocupado = false;
    },
  };
}

type Guion = (s: SolicitudDescarga) => Descarga | Promise<Descarga>;
const ok = (texto: string, tipo = "application/rss+xml"): Descarga => ({
  estado: "ok",
  cuerpo: new TextEncoder().encode(texto),
  tipo,
  etag: '"e1"',
  ultimaModificacion: null,
  url: FEED,
});
const sinRobots: Descarga = { estado: "error", codigo: "no_encontrado", http: 404 };

function preparar(guion: Guion, fuentes: Source[] = [fuente("prueba", [feed(FEED)])]) {
  const memoria = almacenMemoria();
  const turno = turnoMemoria();
  const solicitudes: SolicitudDescarga[] = [];
  const eventos: SecurityEvent[] = [];
  let ahora = new Date("2026-10-25T12:00:00Z");
  const descargar: Descargador = vi.fn(async (s) => {
    solicitudes.push(s);
    return guion(s);
  });
  const correr = (extra: { presupuestoMs?: number } = {}) =>
    correrIngesta({ fuentes, almacen: memoria.almacen, turno, descargar, reloj: () => ahora, registrar: (e) => eventos.push(e), ...extra });
  return {
    ...memoria,
    turno,
    solicitudes,
    eventos,
    correr,
    avanzar: (ms: number) => {
      ahora = new Date(ahora.getTime() + ms);
    },
    ahora: () => ahora,
  };
}

describe("qué lee la ingesta", () => {
  it("hoy el registro no tiene ningún feed verificado: la corrida no hace nada y lo dice en su registro", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    expect(feedsElegibles(REGISTRO_FUENTES, hoy)).toEqual([]);
    const p = preparar(() => {
      throw new Error("no debería pedir nada");
    }, [...REGISTRO_FUENTES]);
    const r = await p.correr();
    expect(r).toEqual({ resultado: "ok", feeds: 0, nuevos: 0, fallos: 0, pausados: 0, sinFeeds: true });
    expect(p.solicitudes).toEqual([]);
    expect(p.eventos).toEqual([{ tipo: "tarea", tarea: "ingesta", resultado: "sin_feeds", feeds: 0, nuevos: 0, fallos: 0 }]);
    expect(p.corridas).toMatchObject([{ resultado: "ok", feeds: 0, nuevos: 0, fallos: 0 }]);
  });

  it("solo fuentes activas, rss o api, con condiciones «Verificadas el …» y feeds ya verificados", () => {
    const hoy = "2026-10-25";
    const fuentes = [
      fuente("buena", [feed(FEED)]),
      fuente("inactiva", [feed("https://fuente-prueba.example.org/1.xml")], { activa: false }),
      fuente("manual", [], { acceso: "manual" }),
      fuente("sin-verificar", [feed("https://fuente-prueba.example.org/2.xml")], { condiciones_reutilizacion: "Por confirmar en la página (x)" }),
      fuente("futuro", [{ ...feed("https://fuente-prueba.example.org/3.xml"), verificado: "2026-12-01" }]),
    ];
    expect(feedsElegibles(fuentes, hoy).map((e) => e.fuente.id)).toEqual(["buena"]);
  });
});

describe("una corrida", () => {
  it("guarda solo metadatos, una vez: la segunda corrida no duplica (y usa el ETag)", async () => {
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : s.etag === '"e1"' ? { estado: "sin_cambios", url: FEED } : ok(RSS)));
    expect(await p.correr()).toMatchObject({ resultado: "ok", feeds: 1, nuevos: 1, fallos: 0 });
    const [item] = [...p.items.values()];
    expect(Object.keys(item).sort()).toEqual(["clave", "feedUrl", "identificador", "publicado", "sourceId", "titulo", "url"]);
    expect(JSON.stringify(item)).not.toContain("TEXTO-DE-LA-FUENTE");
    expect(await p.correr()).toMatchObject({ resultado: "ok", nuevos: 0 });
    expect(p.solicitudes.at(-1)).toMatchObject({ etag: '"e1"' });
    expect(p.items.size).toBe(1);
    expect(p.estados.get(FEED)).toMatchObject({ robots: "permitido", fallosSeguidos: 0, etag: '"e1"' });
  });

  it("robots.txt se lee una vez por host y corrida, y otra vez pasadas 24 h", async () => {
    const otro = "https://fuente-prueba.example.org/otro.rss.xml";
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : ok(RSS)), [fuente("prueba", [feed(FEED), feed(otro)])]);
    await p.correr();
    expect(p.solicitudes.filter((s) => s.clase === "robots")).toHaveLength(1);
    p.avanzar(60 * 60_000);
    await p.correr();
    expect(p.solicitudes.filter((s) => s.clase === "robots")).toHaveLength(1);
    p.avanzar(24 * 60 * 60_000);
    await p.correr();
    expect(p.solicitudes.filter((s) => s.clase === "robots")).toHaveLength(2);
  });

  it("un Disallow pone el feed en pausa 24 h y no se lee", async () => {
    const robots = ok("User-agent: OteaAustral\nDisallow: /canal", "text/plain");
    const p = preparar((s) => (s.clase === "robots" ? robots : ok(RSS)));
    expect(await p.correr()).toMatchObject({ resultado: "ok", pausados: 1, nuevos: 0 });
    expect(p.solicitudes.map((s) => s.clase)).toEqual(["robots"]);
    expect(p.estados.get(FEED)).toMatchObject({ robots: "prohibido", ultimoError: "robots_prohibido", pausadoHasta: new Date(p.ahora().getTime() + PAUSA_MS) });
    expect(p.eventos).toContainEqual({ tipo: "ingesta_feed", fuente: "prueba", evento: "robots_prohibido", codigo: "robots_prohibido" });
  });

  it("si robots.txt no llega (5xx, tiempo) no se lee el feed y cuenta como fallo", async () => {
    const p = preparar((s) => (s.clase === "robots" ? { estado: "error", codigo: "http_servidor", http: 500 } : ok(RSS)));
    expect(await p.correr()).toMatchObject({ resultado: "fallida", fallos: 1 });
    expect(p.solicitudes.map((s) => s.clase)).toEqual(["robots"]);
    expect(p.estados.get(FEED)).toMatchObject({ ultimoError: "robots_no_disponible", fallosSeguidos: 1 });
  });

  it("tres fallos seguidos ⇒ pausa de 24 h y aviso; un éxito reinicia la cuenta", async () => {
    let falla = true;
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : falla ? { estado: "error", codigo: "tiempo" } : ok(RSS)));
    for (let i = 0; i < 2; i++) {
      await p.correr();
      p.avanzar(60 * 60_000);
    }
    expect(p.estados.get(FEED)).toMatchObject({ fallosSeguidos: 2, pausadoHasta: null });
    await p.correr();
    expect(p.estados.get(FEED)).toMatchObject({ fallosSeguidos: 3, ultimoError: "tiempo", pausadoHasta: new Date(p.ahora().getTime() + PAUSA_MS) });
    expect(p.eventos).toContainEqual({ tipo: "ingesta_feed", fuente: "prueba", evento: "pausa", codigo: "tiempo" });

    const pedidos = p.solicitudes.length;
    p.avanzar(60 * 60_000);
    expect(await p.correr()).toMatchObject({ resultado: "ok", pausados: 1 });
    expect(p.solicitudes).toHaveLength(pedidos);

    falla = false;
    p.avanzar(PAUSA_MS);
    await p.correr();
    expect(p.estados.get(FEED)).toMatchObject({ fallosSeguidos: 0, pausadoHasta: null, ultimoError: null });
  });

  it("Retry-After pone el feed en pausa hasta esa hora", async () => {
    const hasta = new Date("2026-10-25T14:00:00Z");
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : { estado: "error", codigo: "ritmo", http: 429, reintentarDesde: hasta }));
    await p.correr();
    expect(p.estados.get(FEED)).toMatchObject({ pausadoHasta: hasta, ultimoError: "ritmo" });
  });

  it("un documento maligno o con otro tipo cuenta como fallo con su código, sin guardar nada", async () => {
    const xxe = '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss version="2.0"/>';
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : ok(xxe)));
    await p.correr();
    expect(p.estados.get(FEED)).toMatchObject({ ultimoError: "dtd", fallosSeguidos: 1 });
    expect(p.items.size).toBe(0);
  });

  it("con el turno tomado por otra corrida, se registra como omitida y no se pide nada", async () => {
    const p = preparar(() => ok(RSS));
    p.turno.ocupado = true;
    expect(await p.correr()).toMatchObject({ resultado: "omitida" });
    expect(p.solicitudes).toEqual([]);
    expect(p.corridas).toMatchObject([{ resultado: "omitida" }]);
  });

  it("al agotarse el presupuesto de tiempo corta lo que esté en curso y deja el resto para la siguiente", async () => {
    const feeds = [feed(FEED), feed("https://fuente-prueba.example.org/b.xml"), feed("https://fuente-prueba.example.org/c.xml")];
    const p = preparar(
      (s) =>
        s.clase === "robots"
          ? sinRobots
          : new Promise<Descarga>((resolver) => s.senal?.addEventListener("abort", () => resolver({ estado: "error", codigo: "tiempo" }))),
      [fuente("prueba", feeds)],
    );
    expect(await p.correr({ presupuestoMs: 50 })).toMatchObject({ resultado: "parcial", fallos: 0, feeds: 1 });
    expect(p.estados.get(FEED)).toMatchObject({ fallosSeguidos: 0 });
    expect(p.turno.ocupado).toBe(false);
  });

  it("si la base falla a mitad de camino, la corrida es fallida y suelta el turno", async () => {
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : ok(RSS)));
    p.almacen.guardarItems = async () => {
      throw new Error("conexión perdida");
    };
    expect(await p.correr()).toMatchObject({ resultado: "fallida" });
    expect(p.turno.ocupado).toBe(false);
    expect(p.eventos).toContainEqual({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "ingesta" });
    expect(p.eventos.at(-1)).toMatchObject({ tipo: "tarea", resultado: "fallida" });
  });

  it("los registros llevan solo conteos y códigos: ni URLs, ni títulos, ni texto", async () => {
    const p = preparar((s) => (s.clase === "robots" ? sinRobots : ok(RSS)));
    await p.correr();
    const todo = JSON.stringify(p.eventos);
    expect(todo).not.toMatch(/https?:|Ítem de prueba|TEXTO-DE-LA-FUENTE/);
  });
});
