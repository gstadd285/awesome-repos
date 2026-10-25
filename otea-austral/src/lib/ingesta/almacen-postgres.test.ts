import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorFuentesFalsas } from "../../../scripts/lib/fuentes-falsas.mjs";
import type { Feed, Source } from "@/lib/domain/schemas";
import { HAY_BASE_DE_PRUEBAS, crearBaseDePrueba, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import type { SecurityEvent } from "@/lib/security/log";
import { crearAlmacenIngestaPostgres } from "./almacen-postgres";
import { agenteIngesta, crearDescargador } from "./descarga";
import { correrIngesta } from "./servicio";
import { crearTurnoPostgres } from "./turno";

/**
 * Integración de la ingesta con Postgres real (migración 0007) y el servidor de fuentes falsas: una corrida completa
 * contra fixtures SINTÉTICOS de prueba (organismos «(ejemplo)», dominios example.org), sin salir a internet.
 */
const MARCA = "TEXTO-DE-LA-FUENTE-NO-SE-GUARDA";
const CONDICIONES = "Verificadas el 2026-10-24: datos sintéticos de prueba (ejemplo).";

const feed = (url: string, formato: Feed["formato"] = "rss"): Feed => ({ url, formato, titulo: "Feed de prueba (ejemplo)", verificado: "2026-10-24" });
const fuente = (id: string, url_base: string, feeds: Feed[]): Source => ({
  id,
  nombre: "Fuente de prueba (ejemplo)",
  organismo: `Organismo ${id} (ejemplo)`,
  url_base,
  tipo: "primaria",
  temas: [],
  acceso: "rss",
  feeds,
  condiciones_reutilizacion: CONDICIONES,
  prioridad: "A",
  activa: true,
});

const P = "https://fuente-prueba.example.org";
const FUENTES: Source[] = [
  fuente("prueba-a", `${P}/`, [
    feed(`${P}/canal.rss.xml`),
    feed(`${P}/canal.atom.xml`, "atom"),
    feed(`${P}/api.json`, "api"),
    feed(`${P}/privado/canal.rss.xml`), // robots.txt lo prohíbe
    feed(`${P}/xxe.rss.xml`),
    feed(`${P}/bomba.rss.xml`),
    feed(`${P}/especial/redirige-fuera`),
  ]),
  fuente("prueba-libre", "https://robots-libre.example.org/", [feed("https://robots-libre.example.org/canal.atom.xml", "atom")]),
  fuente("prueba-caido", "https://robots-caido.example.org/", [feed("https://robots-caido.example.org/canal.rss.xml")]),
];

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("ingesta en Postgres (migración 0007)", () => {
  let base: BaseDePrueba;
  let servidor: Awaited<ReturnType<typeof crearServidorFuentesFalsas>>;
  const dueño = (sql: string, parametros: unknown[] = []) => base.propietario.consulta(sql, parametros);
  const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);

  beforeAll(async () => {
    [base, servidor] = await Promise.all([crearBaseDePrueba(), crearServidorFuentesFalsas()]);
    for (const f of FUENTES) {
      await dueño(
        `insert into fuentes (id, nombre, organismo, url_base, tipo, temas, acceso, condiciones_reutilizacion, prioridad)
         values ($1, $2, $3, $4, 'primaria', '{}', 'rss', $5, 'A')`,
        [f.id, f.nombre, f.organismo, f.url_base, CONDICIONES],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.all([base?.cerrar(), servidor?.cerrar()]);
  });

  const correr = (ahora: Date, fuentes: Source[] = FUENTES, eventos: SecurityEvent[] = []) =>
    correrIngesta({
      fuentes,
      almacen: crearAlmacenIngestaPostgres(base.app),
      turno: crearTurnoPostgres(base.app, "ingesta"),
      descargar: crearDescargador({
        agente: agenteIngesta("https://oteaustral.example.org", "mailto:ingesta@example.org"),
        origenPrueba: servidor.url,
        pausaHostMs: 0,
      }),
      reloj: () => ahora,
      registrar: (e) => eventos.push(e),
    });

  describe("esquema", () => {
    const columnas = async (tabla: string) =>
      (await dueño("select column_name from information_schema.columns where table_name = $1 order by ordinal_position", [tabla])).map(
        (f) => f.column_name,
      );

    it("ninguna columna guarda texto de una fuente: lista cerrada", async () => {
      // `evento_id` llega con la 0008 (agrupación en eventos candidatos): es una referencia, no texto.
      expect(await columnas("fuente_items")).toEqual([
        "id", "source_id", "feed_url", "clave", "titulo", "url", "identificador", "publicado", "visto", "evento_id",
      ]);
      expect(await columnas("ingesta_feeds")).toEqual([
        "feed_url", "source_id", "etag", "ultima_modificacion", "ultimo_intento", "ultimo_ok", "fallos_seguidos",
        "pausado_hasta", "robots", "robots_revisado", "ultimo_error",
      ]);
      expect(await columnas("ingesta_corridas")).toEqual([
        "orden", "tarea", "inicio", "fin", "feeds", "nuevos", "fallos", "borradores", "costo_micros", "resultado",
      ]);
      expect(await columnas("tareas_turnos")).toEqual(["tarea", "ocupado_hasta"]);
    });

    it("fuente_items e ingesta_corridas son de solo agregar: ni la aplicación ni el dueño cambian, borran o vacían", async () => {
      await app(
        `insert into fuente_items (source_id, feed_url, clave, titulo, url) values ('prueba-a', $1, $2, 'T (ejemplo)', $1)`,
        [`${P}/manual`, "f".repeat(64)],
      );
      await app(`insert into ingesta_corridas (tarea, inicio, fin, feeds, nuevos, fallos, resultado) values ('ingesta', now(), now(), 0, 0, 0, 'ok')`);
      // La aplicación ni siquiera tiene permiso (42501); al dueño lo detiene el disparador `otea_rechazar` (OT001).
      await expect(app("update fuente_items set titulo = 'otro'")).rejects.toMatchObject({ code: "42501" });
      await expect(app("update ingesta_corridas set fallos = 9")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("update fuente_items set titulo = 'otro'")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("update ingesta_corridas set fallos = 9")).rejects.toMatchObject({ code: "OT001" });
      for (const sql of ["delete from fuente_items", "delete from ingesta_corridas"]) {
        await expect(app(sql), sql).rejects.toMatchObject({ code: "42501" });
        await expect(dueño(sql), sql).rejects.toMatchObject({ code: "OT001" });
      }
      for (const sql of ["truncate fuente_items", "truncate ingesta_corridas"]) {
        await expect(dueño(sql), sql).rejects.toMatchObject({ code: "OT001" });
      }
    });

    it("las restricciones de la base rechazan URLs que no son https, claves mal formadas y títulos largos", async () => {
      const alta = (url: string, clave: string, titulo: string) =>
        app(`insert into fuente_items (source_id, feed_url, clave, titulo, url) values ('prueba-a', $1, $2, $3, $1)`, [url, clave, titulo]);
      await expect(alta("http://fuente-prueba.example.org/x", "a".repeat(64), "T")).rejects.toMatchObject({ code: "23514" });
      await expect(alta(`${P}/x`, "no-hex", "T")).rejects.toMatchObject({ code: "23514" });
      await expect(alta(`${P}/x`, "b".repeat(64), "x".repeat(301))).rejects.toMatchObject({ code: "23514" });
    });

    it("un feed nace sin historia (RLS), y un turno no se reserva por más de 15 minutos", async () => {
      await dueño("grant insert (fallos_seguidos, pausado_hasta, robots) on ingesta_feeds to otea_app");
      try {
        await expect(
          app("insert into ingesta_feeds (feed_url, source_id, fallos_seguidos) values ($1, 'prueba-a', 2)", [`${P}/rls.xml`]),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          app("insert into ingesta_feeds (feed_url, source_id, robots) values ($1, 'prueba-a', 'permitido')", [`${P}/rls.xml`]),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await dueño("revoke insert (fallos_seguidos, pausado_hasta, robots) on ingesta_feeds from otea_app");
      }
      await app("insert into ingesta_feeds (feed_url, source_id) values ($1, 'prueba-a')", [`${P}/rls.xml`]);
      await expect(app("update ingesta_feeds set ultimo_error = 'Mensaje: https://x' where feed_url = $1", [`${P}/rls.xml`])).rejects.toMatchObject({
        code: "23514",
      });
      await expect(app("update tareas_turnos set ocupado_hasta = now() + interval '1 day' where tarea = 'resumen'")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(app("insert into tareas_turnos (tarea) values ('ingesta')")).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from tareas_turnos")).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from ingesta_feeds")).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("turno", () => {
    it("con dos corridas a la vez solo una toma el turno; soltarlo con otra ficha no lo libera", async () => {
      const turnos = [crearTurnoPostgres(base.app, "resumen"), crearTurnoPostgres(base.app, "resumen")];
      const fichas = await Promise.all(turnos.map((t) => t.tomar()));
      expect(fichas.filter(Boolean)).toHaveLength(1);
      const ficha = fichas.find(Boolean)!;
      await turnos[0].soltar("2000-01-01 00:00:00+00");
      expect(await turnos[1].tomar()).toBeNull();
      await turnos[0].soltar(ficha);
      const otra = await turnos[1].tomar();
      expect(otra).not.toBeNull();
      await turnos[1].soltar(otra!);
    });

    it("dos corridas de la ingesta a la vez: una corre y la otra queda omitida", async () => {
      const solo = [FUENTES[1]];
      const resultados = await Promise.all([correr(new Date("2026-10-25T10:00:00Z"), solo), correr(new Date("2026-10-25T10:00:00Z"), solo)]);
      expect(resultados.map((r) => r.resultado).sort()).toEqual(["ok", "omitida"]);
      const corridas = await dueño("select resultado from ingesta_corridas where inicio = '2026-10-25T10:00:00Z' order by 1");
      expect(corridas.map((c) => c.resultado)).toEqual(["ok", "omitida"]);
    });
  });

  describe("corrida contra el servidor de fuentes falsas (criterio de aceptación de F2)", () => {
    it("guarda solo metadatos, no lee lo prohibido ni lo de fuera del dominio, y la segunda corrida no duplica", async () => {
      servidor.solicitudes.length = 0;
      const antes = (await dueño("select count(*)::int as n from fuente_items"))[0].n as number;
      const eventos: SecurityEvent[] = [];
      const primera = await correr(new Date("2026-10-25T12:00:00Z"), FUENTES, eventos);

      // RSS: 4 de 7 · Atom: 2 · JSON: 2 de 3 · robots-libre: ya leído en la prueba del turno (0 nuevos).
      expect(primera).toEqual({ resultado: "parcial", feeds: 9, nuevos: 8, fallos: 4, pausados: 1, sinFeeds: false });
      const items = await dueño("select source_id, feed_url, titulo, url, identificador, publicado from fuente_items order by url");
      expect(items).toHaveLength(antes + 8);
      expect(JSON.stringify(items)).not.toContain(MARCA);
      expect(items.every((i) => /^https:\/\/([a-z0-9-]+\.)*(fuente-prueba|robots-libre)\.example\.org\//.test(i.url))).toBe(true);
      expect(items.find((i) => i.url === `${P}/comunicados/2026/prueba-1`)).toMatchObject({
        source_id: "prueba-a",
        feed_url: `${P}/canal.rss.xml`,
        titulo: "Comunicado de prueba 1 (ejemplo): decisión de tasa",
        identificador: "prueba-2026-001",
        publicado: new Date("2026-10-20T17:30:00Z"),
      });

      // Lo que no se pidió nunca: el feed prohibido por robots.txt, el de un host cuyo robots.txt no responde y el
      // destino de una redirección fuera del dominio.
      const pedidas = servidor.solicitudes.map((s) => `${s.host}${s.ruta}`);
      expect(pedidas).not.toContain("fuente-prueba.example.org/privado/canal.rss.xml");
      expect(pedidas).not.toContain("robots-caido.example.org/canal.rss.xml");
      expect(pedidas.some((p) => p.startsWith("otro-dominio"))).toBe(false);
      expect(pedidas.filter((p) => p.endsWith("/robots.txt")).sort()).toEqual([
        "fuente-prueba.example.org/robots.txt",
        "robots-caido.example.org/robots.txt",
      ]);
      expect(new Set(servidor.solicitudes.map((s) => s.agente))).toEqual(
        new Set(["OteaAustral/1.0 (+https://oteaustral.example.org/fuentes; mailto:ingesta@example.org)"]),
      );

      const estados = await dueño("select feed_url, robots, ultimo_error, fallos_seguidos, pausado_hasta is not null as pausado from ingesta_feeds");
      const estado = (url: string) => estados.find((e) => e.feed_url === url);
      expect(estado(`${P}/privado/canal.rss.xml`)).toMatchObject({ robots: "prohibido", ultimo_error: "robots_prohibido", pausado: true });
      expect(estado(`${P}/xxe.rss.xml`)).toMatchObject({ ultimo_error: "dtd", fallos_seguidos: 1 });
      expect(estado(`${P}/bomba.rss.xml`)).toMatchObject({ ultimo_error: "dtd" });
      expect(estado(`${P}/especial/redirige-fuera`)).toMatchObject({ ultimo_error: "redireccion_fuera" });
      expect(estado("https://robots-caido.example.org/canal.rss.xml")).toMatchObject({ ultimo_error: "robots_no_disponible" });
      expect(estado(`${P}/canal.rss.xml`)).toMatchObject({ robots: "permitido", ultimo_error: null, fallos_seguidos: 0 });
      expect(JSON.stringify(eventos)).not.toMatch(/https?:|ejemplo|TEXTO/);

      servidor.solicitudes.length = 0;
      const segunda = await correr(new Date("2026-10-25T13:17:00Z"));
      expect(segunda).toMatchObject({ nuevos: 0, pausados: 1 });
      expect((await dueño("select count(*)::int as n from fuente_items"))[0].n).toBe(antes + 8);
      // Con el ETag guardado, el servidor respondió 304; robots.txt sigue vigente (24 h) y no se volvió a pedir.
      expect(servidor.solicitudes.find((s) => s.ruta === "/canal.rss.xml")?.siNoCoincide).toMatch(/^"[0-9a-f]{16}"$/);
      expect(servidor.solicitudes.some((s) => s.host === "fuente-prueba.example.org" && s.ruta === "/robots.txt")).toBe(false);
      const corridas = await dueño("select resultado, feeds, nuevos, fallos from ingesta_corridas where inicio in ('2026-10-25T12:00:00Z', '2026-10-25T13:17:00Z') order by orden");
      expect(corridas).toEqual([
        { resultado: "parcial", feeds: 9, nuevos: 8, fallos: 4 },
        { resultado: "parcial", feeds: 9, nuevos: 0, fallos: 4 },
      ]);
    });
  });
});
