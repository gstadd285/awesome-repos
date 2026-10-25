import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorFuentesFalsas } from "../../../scripts/lib/fuentes-falsas.mjs";
import { crearRepositorioAlertas, type DatosNuevaAlerta, type RepositorioAlertas } from "@/lib/alertas/repositorio";
import { HAY_BASE_DE_PRUEBAS, crearBaseDePrueba, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import type { Contexto } from "@/lib/domain/rules";
import type { Feed, Source } from "@/lib/domain/schemas";
import { crearAlmacenIngestaPostgres } from "./almacen-postgres";
import { crearColaEventos, type ColaEventos } from "./cola-postgres";
import { agenteIngesta, crearDescargador } from "./descarga";
import { agruparPendientes } from "./eventos-postgres";
import { correrIngesta } from "./servicio";
import { crearTurnoPostgres } from "./turno";

/**
 * Integración de la agrupación y de la cola manual (migración 0008) con Postgres real y el servidor de fuentes falsas.
 * DATOS DE PRUEBA: fixtures SINTÉTICOS (organismos «(ejemplo)», dominios example.org); nada sale a internet ni llama a
 * una IA.
 */
// Verificadas antes de la fecha de las corridas (21 de octubre): si no, los feeds no serían elegibles.
const CONDICIONES = "Verificadas el 2026-10-19: datos sintéticos de prueba (ejemplo).";
const P = "https://fuente-prueba.example.org";
const O = "https://otra-prueba.example.org";
const DECISION_1 = "Comunicado de prueba 1 (ejemplo): decisión de tasa";
const DECISION_2 = "Nota de prueba (ejemplo) sobre la decisión de tasa";
const COBRE = "Boletín de prueba (ejemplo) del precio del cobre";

const feed = (url: string): Feed => ({ url, formato: "rss", titulo: "Feed de prueba (ejemplo)", verificado: "2026-10-19" });
const fuente = (id: string, url_base: string, prioridad: Source["prioridad"], feeds: Feed[]): Source => ({
  id,
  nombre: "Fuente de prueba (ejemplo)",
  organismo: `Organismo ${id} (ejemplo)`,
  url_base,
  tipo: "primaria",
  temas: [],
  acceso: "rss",
  feeds,
  condiciones_reutilizacion: CONDICIONES,
  prioridad,
  activa: true,
});
const FUENTES: Source[] = [
  fuente("prueba-a", `${P}/`, "A", [feed(`${P}/canal.rss.xml`), feed(`${P}/xxe.rss.xml`)]),
  fuente("prueba-b", `${O}/`, "B", [feed(`${O}/canal.rss.xml`)]),
];

const AHORA = new Date("2026-10-21T14:00:00Z");
const ctx = (): Contexto => ({ actor: "editora", fecha: "2026-10-25T12:00:00.000Z", generarId: () => randomUUID() });

// DATOS DE EJEMPLO para el contenido de la alerta: escenario ficticio.
const CONTENIDO: Omit<DatosNuevaAlerta, "es_ejemplo"> = {
  tema: "divisas",
  evento: "Decisión de tasa de un banco central de prueba",
  resumen: "Escenario redactado para las pruebas: el tipo de cambio podría moverse si la decisión sorprende.",
  filas: [{ sector: "Importadores de prueba", direccion: "condicionado", condicion: "Si el peso se aprecia", confianza: "media" }],
  impacto: "medio",
  revisor: "Equipo de prueba",
};

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("eventos candidatos y cola manual en Postgres (migración 0008)", () => {
  let base: BaseDePrueba;
  let servidor: Awaited<ReturnType<typeof crearServidorFuentesFalsas>>;
  let cola: ColaEventos;
  let alertas: RepositorioAlertas;
  const dueño = (sql: string, parametros: unknown[] = []) => base.propietario.consulta(sql, parametros);
  const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);
  const eventoDe = async (titulo: string) =>
    (await dueño("select evento_id from fuente_items where titulo = $1", [titulo]))[0]?.evento_id as string;

  beforeAll(async () => {
    [base, servidor] = await Promise.all([crearBaseDePrueba(), crearServidorFuentesFalsas()]);
    for (const f of FUENTES) {
      await dueño(
        `insert into fuentes (id, nombre, organismo, url_base, tipo, temas, acceso, condiciones_reutilizacion, prioridad)
         values ($1, $2, $3, $4, 'primaria', '{}', 'rss', $5, $6)`,
        [f.id, f.nombre, f.organismo, f.url_base, CONDICIONES, f.prioridad],
      );
    }
    cola = crearColaEventos(base.app, { fuentes: FUENTES });
    alertas = crearRepositorioAlertas(base.app);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([base?.cerrar(), servidor?.cerrar()]);
  });

  const correr = (ahora: Date) =>
    correrIngesta({
      fuentes: FUENTES,
      almacen: crearAlmacenIngestaPostgres(base.app),
      turno: crearTurnoPostgres(base.app, "ingesta"),
      descargar: crearDescargador({
        agente: agenteIngesta("https://oteaustral.example.org", "mailto:ingesta@example.org"),
        origenPrueba: servidor.url,
        pausaHostMs: 0,
      }),
      reloj: () => ahora,
      registrar: () => undefined,
      agrupar: (momento) => agruparPendientes(base.app, { fuentes: FUENTES, ahora: momento }),
    });

  describe("agrupación al final de la corrida (criterio de aceptación de F3)", () => {
    it("los ítems de una misma decisión de tasas, de dos organismos, forman un evento; el resto, los suyos", async () => {
      const r = await correr(AHORA);
      // RSS de prueba-a: 4 ítems válidos; el de prueba-b: 2; el XXE falla (la corrida queda parcial).
      expect(r).toMatchObject({ resultado: "parcial", nuevos: 6, fallos: 1, agrupacion: { asignados: 6, eventosNuevos: 5 } });
      expect((await dueño("select count(*)::int as n from fuente_items where evento_id is null"))[0].n).toBe(0);

      const decision = await eventoDe(DECISION_1);
      expect(decision).toMatch(/^[0-9a-f-]{36}$/);
      expect(await eventoDe(DECISION_2)).toBe(decision);
      expect(await eventoDe(COBRE)).not.toBe(decision);
      const [evento] = await dueño("select * from eventos_candidatos where id = $1", [decision]);
      expect(evento).toMatchObject({
        tema: "divisas",
        clave_agenda: null,
        titulo_referencia: DECISION_1,
        primero: new Date("2026-10-20T17:30:00Z"),
        ultimo: new Date("2026-10-21T13:00:00Z"),
        // 2 organismos (+25), decisión (+30), prioridad A (+15), ítem de las últimas 6 h (+10).
        puntaje: 80,
        estado: "abierto",
        alert_id: null,
      });
      const [cobre] = await dueño("select tema, puntaje from eventos_candidatos where id = $1", [await eventoDe(COBRE)]);
      expect(cobre).toEqual({ tema: "cobre", puntaje: 20 });
    });

    it("la segunda corrida no trae nada nuevo y no vuelve a asignar ni a crear eventos", async () => {
      const antes = (await dueño("select count(*)::int as n from eventos_candidatos"))[0].n;
      const r = await correr(new Date(AHORA.getTime() + 3_600_000));
      expect(r).toMatchObject({ nuevos: 0, agrupacion: { asignados: 0, eventosNuevos: 0 } });
      expect((await dueño("select count(*)::int as n from eventos_candidatos"))[0].n).toBe(antes);
    });

    it("un ítem nuevo de la misma decisión, dentro de las 48 h, entra al evento abierto y ensancha su ventana", async () => {
      const decision = await eventoDe(DECISION_1);
      await app(
        `insert into fuente_items (source_id, feed_url, clave, titulo, url, publicado) values ('prueba-b', $1, $2, $3, $4, $5)`,
        [`${O}/canal.rss.xml`, "e".repeat(64), "Aclaración de prueba (ejemplo) sobre la decisión de tasa", `${O}/aclaracion`, new Date("2026-10-22T09:00:00Z")],
      );
      expect(await agruparPendientes(base.app, { fuentes: FUENTES, ahora: new Date("2026-10-22T10:00:00Z") })).toEqual({
        asignados: 1,
        eventosNuevos: 0,
      });
      expect(await eventoDe("Aclaración de prueba (ejemplo) sobre la decisión de tasa")).toBe(decision);
      const [evento] = await dueño("select ultimo, puntaje from eventos_candidatos where id = $1", [decision]);
      expect(evento).toEqual({ ultimo: new Date("2026-10-22T09:00:00Z"), puntaje: 80 });
    });
  });

  describe("esquema y permisos", () => {
    const columnas = async (tabla: string) =>
      (await dueño("select column_name from information_schema.columns where table_name = $1 order by ordinal_position", [tabla])).map(
        (f) => f.column_name,
      );

    it("ninguna columna guarda texto de una fuente: listas cerradas", async () => {
      expect(await columnas("fuente_items")).toEqual([
        "id", "source_id", "feed_url", "clave", "titulo", "url", "identificador", "publicado", "visto", "evento_id",
      ]);
      expect(await columnas("eventos_candidatos")).toEqual([
        "id", "tema", "clave_agenda", "titulo_referencia", "primero", "ultimo", "puntaje", "estado", "alert_id", "creado", "actualizado",
      ]);
      expect(await columnas("evento_auditoria")).toEqual(["orden", "evento_id", "accion", "actor", "fecha", "nota", "alert_id", "registrada"]);
    });

    it("un ítem recibe su evento una sola vez y nada más de él cambia", async () => {
      const [otro] = await dueño("select id from eventos_candidatos where id <> $1 limit 1", [await eventoDe(DECISION_1)]);
      // Para la aplicación, un ítem con evento ya no existe al actualizar (RLS): 0 filas, sin error.
      expect(await app("update fuente_items set evento_id = $1 where titulo = $2 returning 1", [otro.id, DECISION_1])).toEqual([]);
      await expect(app("update fuente_items set titulo = 'otro'")).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from fuente_items")).rejects.toMatchObject({ code: "42501" });
      // Ni el dueño, que no pasa por RLS: lo detiene el disparador.
      await expect(dueño("update fuente_items set evento_id = $1 where titulo = $2", [otro.id, DECISION_1])).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("update fuente_items set titulo = 'otro'")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("delete from fuente_items")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("truncate fuente_items")).rejects.toMatchObject({ code: "OT001" });
    });

    it("un evento nace abierto, su estado solo avanza y lo que lo identifica no cambia", async () => {
      const nuevo = randomUUID();
      const alta = (estado: string) =>
        app(
          `insert into eventos_candidatos (id, tema, titulo_referencia, primero, ultimo, puntaje, estado) values ($1, 'divisas', 'T (ejemplo)', now(), now(), 0, $2)`,
          [randomUUID(), estado],
        );
      await expect(alta("descartado")).rejects.toMatchObject({ code: "42501" }); // sin permiso sobre la columna `estado`
      await dueño("grant insert (estado) on eventos_candidatos to otea_app");
      try {
        await expect(alta("convertido")).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|23514)$/) });
        await expect(alta("descartado")).rejects.toMatchObject({ code: "42501" }); // la política de alta exige «abierto»
      } finally {
        await dueño("revoke insert (estado) on eventos_candidatos from otea_app");
      }
      await app(
        `insert into eventos_candidatos (id, tema, titulo_referencia, primero, ultimo, puntaje) values ($1, 'sin_tema', 'Evento manual (ejemplo)', now(), now(), 10)`,
        [nuevo],
      );
      await app("update eventos_candidatos set estado = 'con_borrador' where id = $1", [nuevo]);
      await expect(app("update eventos_candidatos set estado = 'solicitado' where id = $1", [nuevo])).rejects.toMatchObject({ code: "OT012" });
      await expect(app("update eventos_candidatos set primero = primero + interval '1 hour' where id = $1", [nuevo])).rejects.toMatchObject({
        code: "OT011",
      });
      await expect(app("update eventos_candidatos set tema = 'cobre' where id = $1", [nuevo])).rejects.toMatchObject({ code: "42501" });
      await expect(app("update eventos_candidatos set estado = 'convertido' where id = $1", [nuevo])).rejects.toMatchObject({ code: "23514" });
      await app("update eventos_candidatos set estado = 'descartado' where id = $1", [nuevo]);
      await expect(app("update eventos_candidatos set estado = 'abierto' where id = $1", [nuevo])).rejects.toMatchObject({ code: "OT012" });
      await expect(dueño("update eventos_candidatos set estado = 'abierto' where id = $1", [nuevo])).rejects.toMatchObject({ code: "OT012" });
      await expect(app("delete from eventos_candidatos where id = $1", [nuevo])).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("delete from eventos_candidatos where id = $1", [nuevo])).rejects.toMatchObject({ code: "OT001" });
    });

    it("la auditoría de la cola es de solo agregar", async () => {
      const [evento] = await dueño("select id from eventos_candidatos limit 1");
      await app("insert into evento_auditoria (evento_id, accion, actor, fecha) values ($1, 'descartado', 'editora', now())", [evento.id]);
      await expect(
        app("insert into evento_auditoria (evento_id, accion, actor, fecha) values ($1, 'convertido', 'editora', now())", [evento.id]),
      ).rejects.toMatchObject({ code: "23514" }); // convertido exige la alerta
      await expect(
        app("insert into evento_auditoria (evento_id, accion, actor, fecha) values ($1, 'descartado', 'editora@example.org', now())", [evento.id]),
      ).rejects.toMatchObject({ code: "23514" }); // un alias, nunca un correo
      await expect(app("update evento_auditoria set nota = 'x'")).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from evento_auditoria")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("update evento_auditoria set nota = 'x'")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("delete from evento_auditoria")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("truncate evento_auditoria")).rejects.toMatchObject({ code: "OT001" });
    });
  });

  describe("cola manual (/admin/eventos)", () => {
    it("lista lo pendiente por puntaje, con sus fuentes del registro y la confianza que tendría la alerta", async () => {
      const pendientes = await cola.pendientes(AHORA);
      expect(pendientes[0]).toMatchObject({ tituloReferencia: DECISION_1, puntaje: 80, confianzaPosible: "alta", cerrado: false });
      expect(pendientes[0].fuentes.map((f) => [f.organismo, f.titulo, f.url])).toEqual([
        ["Organismo prueba-a (ejemplo)", DECISION_1, `${P}/comunicados/2026/prueba-1`],
        ["Organismo prueba-b (ejemplo)", DECISION_2, `${O}/notas/2026/decision-tasa`],
        ["Organismo prueba-b (ejemplo)", "Aclaración de prueba (ejemplo) sobre la decisión de tasa", `${O}/aclaracion`],
      ]);
      expect(pendientes[0].senales).toMatchObject({ organismos: 2, decision: true, prioridad: "A" });
      expect(pendientes.map((e) => e.puntaje)).toEqual([...pendientes.map((e) => e.puntaje)].sort((a, b) => b - a));
      expect(pendientes.every((e) => e.estado !== "descartado" && e.estado !== "convertido")).toBe(true);
      // Pasadas 72 h desde el primero, el evento sigue en la cola pero ya no recibe ítems.
      expect((await cola.pendientes(new Date("2026-10-24T18:00:00Z")))[0].cerrado).toBe(true);
    });

    it("crea una alerta en borrador, real, con las fuentes elegidas enlazadas, y convierte el evento, en una transacción", async () => {
      const decision = await eventoDe(DECISION_1);
      const items = await dueño("select id from fuente_items where evento_id = $1 and titulo <> $2 order by titulo", [
        decision,
        "Aclaración de prueba (ejemplo) sobre la decisión de tasa",
      ]);
      // Aunque alguien mande «es_ejemplo: true», la alerta de la cola nunca es de ejemplo.
      const datos = { ...CONTENIDO, es_ejemplo: true } as Omit<DatosNuevaAlerta, "es_ejemplo">;
      const r = await cola.crearAlerta(alertas, decision, datos, items.map((i) => i.id), ctx());
      if (!r.ok) throw new Error(r.motivos.join(" | "));
      expect(r.valor.version).toBe(3);

      const d = await alertas.obtener(r.valor.id);
      expect(d?.alerta).toMatchObject({ estado: "borrador", es_ejemplo: false, tema: "divisas" });
      // Enlazadas en la misma transacción (misma hora de alta): el orden entre ellas no importa.
      const enlaces = (d?.enlaces ?? []).map((e) => [e.organismo, e.titulo_documento, e.url, e.fecha_publicacion, e.fecha_consulta, e.identificador]);
      expect(enlaces.sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
        ["Organismo prueba-a (ejemplo)", DECISION_1, `${P}/comunicados/2026/prueba-1`, "2026-10-20", "2026-10-25", "prueba-2026-001"],
        ["Organismo prueba-b (ejemplo)", DECISION_2, `${O}/notas/2026/decision-tasa`, "2026-10-21", "2026-10-25", "otra-2026-017"],
      ]);
      expect(d?.auditoria.map((a) => [a.accion, a.actor])).toEqual([
        ["creada", "editora"],
        ["editada", "editora"],
        ["editada", "editora"],
      ]);
      expect(d?.auditoria[0].nota).toBe(`Desde el evento candidato ${decision} · 2 fuentes`);
      // El flujo de siempre: con impacto medio y una fuente primaria, ya se podría publicar (no aquí: no hay acceso privado).
      expect(d?.vista.confianza).toBe("alta");
      expect(d?.motivosParaNoPublicar).toEqual([]);

      const detalle = await cola.obtener(decision, AHORA);
      expect(detalle).toMatchObject({ estado: "convertido", alertId: r.valor.id });
      expect(detalle?.auditoria).toEqual([
        { accion: "convertido", actor: "editora", fecha: "2026-10-25T12:00:00.000Z", nota: `Alerta ${r.valor.id} en borrador`, alertId: r.valor.id },
      ]);
      expect((await cola.pendientes(AHORA)).some((e) => e.id === decision)).toBe(false);
    });

    it("un evento ya convertido no da otra alerta, y nada queda a medias", async () => {
      const decision = await eventoDe(DECISION_1);
      const [item] = await dueño("select id from fuente_items where evento_id = $1 limit 1", [decision]);
      const antes = (await dueño("select count(*)::int as n from alertas"))[0].n;
      const r = await cola.crearAlerta(alertas, decision, CONTENIDO, [item.id], ctx());
      expect(r).toEqual({ ok: false, motivos: ["El evento ya se descartó o ya tiene una alerta: recarga la cola."] });
      expect(await cola.descartar(decision, ctx(), "")).toMatchObject({ ok: false });
      expect((await dueño("select count(*)::int as n from alertas"))[0].n).toBe(antes);
    });

    it("dos conversiones a la vez del mismo evento: solo una alerta", async () => {
      const cobre = await eventoDe(COBRE);
      const [item] = await dueño("select id from fuente_items where evento_id = $1", [cobre]);
      const antes = (await dueño("select count(*)::int as n from alertas"))[0].n;
      const datos = { ...CONTENIDO, tema: "cobre" as const, evento: "Precio del cobre de prueba" };
      const resultados = await Promise.all([
        cola.crearAlerta(alertas, cobre, datos, [item.id], ctx()),
        cola.crearAlerta(alertas, cobre, datos, [item.id], ctx()),
      ]);
      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      expect((await dueño("select count(*)::int as n from alertas"))[0].n).toBe(antes + 1);
      expect((await dueño("select count(*)::int as n from evento_auditoria where evento_id = $1", [cobre]))[0].n).toBe(1);
    });

    it("rechaza sin guardar nada: sin fuentes, fuentes de otro evento, ids inválidos y lenguaje de recomendación", async () => {
      const [pendiente] = await cola.pendientes(AHORA);
      const [ajeno] = await dueño("select id from fuente_items where evento_id <> $1 limit 1", [pendiente.id]);
      const antes = (await dueño("select count(*)::int as n from alertas"))[0].n;
      expect(await cola.crearAlerta(alertas, pendiente.id, CONTENIDO, [], ctx())).toEqual({
        ok: false,
        motivos: ["Elige al menos una fuente del evento."],
      });
      expect(await cola.crearAlerta(alertas, pendiente.id, CONTENIDO, ["no-es-un-uuid"], ctx())).toMatchObject({ ok: false });
      expect(await cola.crearAlerta(alertas, pendiente.id, CONTENIDO, [ajeno.id], ctx())).toEqual({
        ok: false,
        motivos: ["Alguna fuente elegida no pertenece al evento."],
      });
      expect(await cola.crearAlerta(alertas, "no-existe", CONTENIDO, [ajeno.id], ctx())).toEqual({ ok: false, motivos: ["El evento no existe."] });
      const recomendacion = { ...CONTENIDO, resumen: "Recomendamos comprar dólares de prueba." };
      const r = await cola.crearAlerta(alertas, pendiente.id, recomendacion, [pendiente.fuentes[0].id], ctx());
      expect(r.ok).toBe(false);
      expect((await dueño("select count(*)::int as n from alertas"))[0].n).toBe(antes);
      expect((await cola.obtener(pendiente.id, AHORA))?.estado).toBe("abierto");
    });

    it("descartar deja el evento fuera de la cola y una fila en la auditoría; no se descarta dos veces", async () => {
      const [pendiente] = await cola.pendientes(AHORA);
      expect(await cola.descartar(pendiente.id, ctx(), "x".repeat(501))).toMatchObject({ ok: false });
      expect(await cola.descartar(pendiente.id, ctx(), "  Sin relevancia para los temas (prueba).  ")).toEqual({ ok: true, valor: { id: pendiente.id } });
      const detalle = await cola.obtener(pendiente.id, AHORA);
      expect(detalle?.estado).toBe("descartado");
      expect(detalle?.auditoria).toEqual([
        { accion: "descartado", actor: "editora", fecha: "2026-10-25T12:00:00.000Z", nota: "Sin relevancia para los temas (prueba).", alertId: null },
      ]);
      expect(await cola.descartar(pendiente.id, ctx(), "")).toEqual({
        ok: false,
        motivos: ["El evento ya se descartó o ya tiene una alerta: recarga la cola."],
      });
      expect(await cola.descartar(randomUUID(), ctx(), "")).toEqual({ ok: false, motivos: ["El evento no existe."] });
      expect(await cola.descartar("1; drop table alertas", ctx(), "")).toEqual({ ok: false, motivos: ["El evento no existe."] });
    });

    it("el tablero muestra la última corrida, los feeds con fallos y lo pendiente", async () => {
      const t = await cola.tablero(AHORA);
      expect(t.ultimaCorrida).toMatchObject({ resultado: "parcial", nuevos: 0, fallos: 1 });
      expect(t.feedsConProblemas).toEqual([
        expect.objectContaining({ feedUrl: `${P}/xxe.rss.xml`, organismo: "Organismo prueba-a (ejemplo)", ultimoError: "dtd", fallosSeguidos: 2 }),
      ]);
      const pendientes = (await dueño("select count(*)::int as n from eventos_candidatos where estado in ('abierto', 'solicitado', 'con_borrador')"))[0].n;
      expect(t.eventosPendientes).toBe(pendientes);
      expect(t.itemsSinEvento).toBe(0);
    });
  });
});
