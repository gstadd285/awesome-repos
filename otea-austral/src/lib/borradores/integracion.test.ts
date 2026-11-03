import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLAVE_FALSA, crearServidorAnthropicFalso } from "../../../scripts/lib/anthropic-falso.mjs";
import { crearServidorFuentesFalsas } from "../../../scripts/lib/fuentes-falsas.mjs";
import { crearRepositorioAlertas, type DatosNuevaAlerta, type RepositorioAlertas } from "@/lib/alertas/repositorio";
import { HAY_BASE_DE_PRUEBAS, crearBaseDePrueba, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import type { Contexto } from "@/lib/domain/rules";
import type { Source } from "@/lib/domain/schemas";
import { crearColaEventos, type ColaEventos } from "@/lib/ingesta/cola-postgres";
import { agenteIngesta, crearDescargador } from "@/lib/ingesta/descarga";
import type { SecurityEvent } from "@/lib/security/log";
import { crearAlmacenBorradoresPostgres } from "./almacen-postgres";
import { crearPresupuestoBorradoresPostgres } from "./presupuesto-postgres";
import { crearProveedorBorrador } from "./proveedor-borrador";
import { redactarBorradores } from "./servicio";

/**
 * Borradores con IA de punta a punta (migración 0010), sin salir a internet ni gastar: Postgres real, el servidor de
 * **fuentes falsas** (documentos HTML sintéticos de `e2e/fixtures/fuentes/`), el **Anthropic falso** contra el SDK oficial y
 * la cola del panel. DATOS DE PRUEBA: organismos «(ejemplo)», dominios example.org.
 */
const CONDICIONES = "Verificadas el 2026-10-19: datos sintéticos de prueba (ejemplo).";
const P = "https://fuente-prueba.example.org";
const O = "https://otra-prueba.example.org";
const TEXTO_A = "DOCUMENTO-SINTETICO-A";
const TEXTO_B = "TEXTO-DE-FUENTE-SIN-LECTURA-IA";
const TITULO_B = "Nota TITULO-SIN-LECTURA-IA (ejemplo) sobre la decisión de tasa";

const fuente = (id: string, url_base: string, lectura_ia: boolean, tipo: Source["tipo"] = "primaria"): Source => ({
  id,
  nombre: "Fuente de prueba (ejemplo)",
  organismo: `Organismo ${id} (ejemplo)`,
  url_base,
  tipo,
  temas: ["divisas"],
  acceso: "manual",
  feeds: [],
  condiciones_reutilizacion: CONDICIONES,
  prioridad: "A",
  activa: true,
  lectura_ia,
});
const FUENTES = [fuente("prueba-a", `${P}/`, true), fuente("prueba-b", `${O}/`, false, "secundaria")];

const ctx = (): Contexto => ({ actor: "editora", fecha: new Date().toISOString(), generarId: () => randomUUID() });

// DATOS DE EJEMPLO para lo que la dueña deja en el formulario al aceptar.
const EDITADO: Omit<DatosNuevaAlerta, "es_ejemplo"> = {
  tema: "divisas",
  evento: "Decisión de tasa de un banco de prueba (editado)",
  resumen: "Escenario redactado para las pruebas a partir del borrador, con palabras propias y sin datos reales.",
  filas: [{ sector: "Importadores de prueba", direccion: "condicionado", condicion: "Si el peso se aprecia", confianza: "media" }],
  impacto: "medio",
  revisor: "Equipo de prueba",
};

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("borradores con IA en Postgres, de punta a punta con servidores falsos (migración 0010)", () => {
  let base: BaseDePrueba;
  let fuentes: Awaited<ReturnType<typeof crearServidorFuentesFalsas>>;
  let anthropic: Awaited<ReturnType<typeof crearServidorAnthropicFalso>>;
  let cola: ColaEventos;
  let alertas: RepositorioAlertas;
  const dueño = (sql: string, parametros: unknown[] = []) => base.propietario.consulta(sql, parametros);
  const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);

  beforeAll(async () => {
    [base, fuentes, anthropic] = await Promise.all([crearBaseDePrueba(), crearServidorFuentesFalsas(), crearServidorAnthropicFalso()]);
    for (const f of FUENTES) {
      await dueño(
        `insert into fuentes (id, nombre, organismo, url_base, tipo, temas, acceso, condiciones_reutilizacion, prioridad)
         values ($1, $2, $3, $4, $5, '{divisas}', 'manual', $6, 'A')`,
        [f.id, f.nombre, f.organismo, f.url_base, f.tipo, CONDICIONES],
      );
    }
    cola = crearColaEventos(base.app, { fuentes: FUENTES });
    alertas = crearRepositorioAlertas(base.app);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([base?.cerrar(), fuentes?.cerrar(), anthropic?.cerrar()]);
  });

  /** Un evento como lo deja la agrupación, con sus ítems (solo metadatos). */
  async function evento(items: { fuente: string; titulo: string; url: string }[], { puntaje = 80, tema = "divisas" } = {}): Promise<string> {
    const id = randomUUID();
    await dueño(
      `insert into eventos_candidatos (id, tema, titulo_referencia, primero, ultimo, puntaje)
       values ($1, $2, $3, now() - interval '2 hours', now() - interval '1 hour', $4)`,
      [id, tema, items[0].titulo, puntaje],
    );
    for (const [i, item] of items.entries()) {
      const [fila] = await dueño(
        `insert into fuente_items (source_id, feed_url, clave, titulo, url, identificador, publicado)
         values ($1, $2, $3, $4, $5, $6, now() - interval '2 hours') returning id`,
        [item.fuente, `https://${new URL(item.url).host}/canal.rss.xml`, createHash("sha256").update(`${id}-${i}`).digest("hex"), item.titulo, item.url, `folio-${i + 1}`],
      );
      await dueño("update fuente_items set evento_id = $1 where id = $2", [id, fila.id]);
    }
    return id;
  }

  const eventos: SecurityEvent[] = [];
  const redactar = (topeMicros = 5_000_000) =>
    redactarBorradores({
      fuentes: FUENTES,
      almacen: crearAlmacenBorradoresPostgres(base.app),
      descargar: crearDescargador({
        agente: agenteIngesta("https://oteaustral.example.org", "mailto:ingesta@example.org"),
        origenPrueba: fuentes.url,
        pausaHostMs: 0,
      }),
      proveedor: crearProveedorBorrador({ apiKey: CLAVE_FALSA, modelo: "claude-haiku-5-5", baseURL: anthropic.url }),
      presupuesto: crearPresupuestoBorradoresPostgres(base.app, { micros: topeMicros, llamadas: 600 }),
      precios: { entrada: 0.1, salida: 0.5 },
      modelo: "claude-haiku-5-5",
      porCorrida: 5,
      registrar: (e) => eventos.push(e),
    });

  const estado = async (id: string) => (await dueño("select estado from eventos_candidatos where id = $1", [id]))[0].estado;

  describe("esquema y permisos", () => {
    const columnas = async (tabla: string) =>
      (await dueño("select column_name from information_schema.columns where table_name = $1 order by ordinal_position", [tabla])).map(
        (f) => f.column_name,
      );

    it("ninguna columna guarda texto de una fuente: listas cerradas", async () => {
      expect(await columnas("borradores")).toEqual([
        "id", "evento_id", "contenido", "modelo", "entrada_tokens", "salida_tokens", "cache_tokens", "costo_micros",
        "copia_proporcion", "copia_tramo", "documentos", "banderas", "estado", "motivo_descarte", "alert_id", "creado", "resuelto",
      ]);
      expect(await columnas("borrador_intentos")).toEqual(["orden", "evento_id", "resultado", "motivo", "banderas", "llamadas", "costo_micros", "creado"]);
      expect(await columnas("borradores_uso")).toEqual(["mes", "llamadas", "costo_micros", "tope_micros", "actualizado"]);
    });

    it("un borrador nace pendiente, su contenido no cambia, se resuelve una vez y no se borra", async () => {
      const id = await evento([{ fuente: "prueba-a", titulo: "Evento de esquema (ejemplo)", url: `${P}/documentos/esquema.html` }], { puntaje: 10 });
      const insertar = (estadoInicial?: string) =>
        app(
          `insert into borradores (evento_id, contenido, modelo, entrada_tokens, salida_tokens, costo_micros, copia_proporcion, copia_tramo, documentos${estadoInicial ? ", estado" : ""})
           values ($1, '{"evento":"x"}', 'claude-haiku-5-5', 1, 1, 1, 0, 0, 0${estadoInicial ? ", $2" : ""}) returning id`,
          estadoInicial ? [id, estadoInicial] : [id],
        );
      await expect(insertar("aceptado")).rejects.toMatchObject({ code: "42501" }); // sin permiso sobre `estado`
      await expect(
        app(`insert into borradores (evento_id, contenido, modelo, entrada_tokens, salida_tokens, costo_micros, copia_proporcion, copia_tramo, documentos)
             values ($1, '"texto suelto"', 'claude-haiku-5-5', 1, 1, 1, 0, 0, 0)`, [id]),
      ).rejects.toMatchObject({ code: "23514" }); // contenido: un objeto
      await expect(
        app(`insert into borradores (evento_id, contenido, modelo, entrada_tokens, salida_tokens, costo_micros, copia_proporcion, copia_tramo, documentos, banderas)
             values ($1, '{}', 'claude-haiku-5-5', 1, 1, 1, 0, 0, 0, '{inventada}')`, [id]),
      ).rejects.toMatchObject({ code: "23514" }); // banderas: lista cerrada
      const [{ id: borrador }] = await insertar();
      await expect(app("update borradores set contenido = '{}'")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("update borradores set contenido = '{}' where id = $1", [borrador])).rejects.toMatchObject({ code: "OT015" });
      await expect(app("update borradores set estado = 'aceptado', resuelto = now() where id = $1", [borrador])).rejects.toMatchObject({
        code: "23514", // aceptado sin alerta
      });
      expect(await app("update borradores set estado = 'descartado', motivo_descarte = 'otro', resuelto = now() where id = $1 returning 1", [borrador])).toHaveLength(1);
      // Ya resuelto: la seguridad por fila lo deja fuera (0 filas) y, para el dueño, el disparador lo rechaza.
      expect(await app("update borradores set estado = 'descartado', motivo_descarte = 'copia', resuelto = now() where id = $1 returning 1", [borrador])).toEqual([]);
      await expect(dueño("update borradores set motivo_descarte = 'copia' where id = $1", [borrador])).rejects.toMatchObject({ code: "OT015" });
      await expect(app("delete from borradores")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("delete from borradores")).rejects.toMatchObject({ code: "OT001" });
      // Uno por evento.
      await expect(insertar()).rejects.toMatchObject({ code: "23505" });
    });

    it("los intentos son de solo agregar y la auditoría de la cola admite las acciones nuevas", async () => {
      const id = await evento([{ fuente: "prueba-a", titulo: "Evento de intentos (ejemplo)", url: `${P}/documentos/intentos.html` }], { puntaje: 10 });
      await app("insert into borrador_intentos (evento_id, resultado, motivo, llamadas) values ($1, 'error', 'servidor', 1)", [id]);
      await expect(app("update borrador_intentos set motivo = 'otro'")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("update borrador_intentos set motivo = 'otro'")).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("delete from borrador_intentos")).rejects.toMatchObject({ code: "OT001" });
      await expect(app("insert into borrador_intentos (evento_id, resultado, motivo, llamadas) values ($1, 'error', 'Un mensaje con texto', 1)", [id])).rejects.toMatchObject({
        code: "23514", // el motivo es un código, nunca un texto
      });
      for (const accion of ["solicitado", "borrador_descartado"]) {
        await app("insert into evento_auditoria (evento_id, accion, actor, fecha) values ($1, $2, 'editora', now())", [id, accion]);
      }
      await expect(app("insert into evento_auditoria (evento_id, accion, actor, fecha) values ($1, 'publicado', 'editora', now())", [id])).rejects.toMatchObject({ code: "23514" });
    });
  });

  describe("redacción (con el turno de la corrida, al final de la ingesta)", () => {
    let principal = "";

    it("redacta el evento: el modelo recibe los metadatos y el texto de la fuente con lectura_ia, y nada de la que no lo tiene", async () => {
      principal = await evento([
        { fuente: "prueba-a", titulo: "Comunicado de prueba 1 (ejemplo): decisión de tasa", url: `${P}/documentos/decision-tasa.html` },
        { fuente: "prueba-b", titulo: TITULO_B, url: `${O}/documentos/nota.html` },
      ]);
      const antes = anthropic.solicitudes.length;
      const pedidasAntes = fuentes.solicitudes.length;
      const r = await redactar();
      expect(r).toMatchObject({ estado: "ok", redactados: 1, llamadas: 1 });

      const recibidas = anthropic.solicitudes.slice(antes);
      expect(recibidas).toHaveLength(1);
      const mensaje: string = recibidas[0].cuerpo.messages[0].content;
      expect(mensaje).toContain("Comunicado de prueba 1 (ejemplo): decisión de tasa");
      expect(mensaje).toContain(TEXTO_A);
      expect(mensaje).not.toContain(TEXTO_B);
      expect(mensaje).not.toContain("TITULO-SIN-LECTURA-IA");
      expect(mensaje).not.toMatch(/window\.analitica|Menú|Pie del sitio/); // script, cabecera y pie fuera
      expect(Object.keys(recibidas[0].cuerpo)).not.toContain("tools");
      // A las fuentes solo se pidió lo de la que permite la lectura: su robots.txt y su documento.
      expect(fuentes.solicitudes.slice(pedidasAntes).map((s) => `${s.host}${s.ruta}`)).toEqual([
        "fuente-prueba.example.org/robots.txt",
        "fuente-prueba.example.org/documentos/decision-tasa.html",
      ]);

      const [b] = await dueño("select * from borradores where evento_id = $1", [principal]);
      expect(b).toMatchObject({ estado: "pendiente", modelo: "claude-haiku-5-5", documentos: 1, banderas: ["fuentes_sin_lectura"], entrada_tokens: 2400, salida_tokens: 420 });
      expect(Number(b.costo_micros)).toBe(450); // 2400 × 0,1 + 420 × 0,5
      expect(b.contenido.evento).toBe("Borrador de prueba del servidor falso (una fuente)");
      expect(await estado(principal)).toBe("con_borrador");
      expect(await dueño("select resultado, llamadas from borrador_intentos where evento_id = $1", [principal])).toEqual([{ resultado: "borrador", llamadas: 1 }]);
      expect(await dueño("select llamadas, costo_micros::text as costo from borradores_uso")).toEqual([{ llamadas: 1, costo: "450" }]);
      expect(eventos).toContainEqual({ tipo: "borrador", resultado: "redactado" });
    });

    it("ningún texto de una fuente queda en la base ni en los registros", async () => {
      const columnas = await dueño(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and data_type in ('text', 'jsonb', 'ARRAY', 'character varying')`,
      );
      for (const marca of [TEXTO_A, TEXTO_B, "inflación de fondo bajó"]) {
        for (const { table_name, column_name } of columnas) {
          const [{ n }] = await dueño(`select count(*)::int as n from "${table_name}" where "${column_name}"::text like $1`, [`%${marca}%`]);
          expect(n, `${table_name}.${column_name} ← ${marca}`).toBe(0);
        }
      }
      expect(JSON.stringify(eventos)).not.toMatch(new RegExp(`${TEXTO_A}|${TEXTO_B}|Borrador de prueba`));
    });

    it("una segunda corrida no vuelve a redactar el mismo evento (uno por evento)", async () => {
      const antes = anthropic.solicitudes.length;
      expect((await redactar()).llamadas).toBe(0);
      expect(anthropic.solicitudes.length).toBe(antes);
    });

    it("un evento solo de fuentes sin lectura_ia nunca llega al modelo; uno bajo el umbral espera a que la dueña lo pida", async () => {
      const soloB = await evento([{ fuente: "prueba-b", titulo: "Otra nota de prueba (ejemplo) sobre tasas", url: `${O}/documentos/nota.html` }]);
      const bajo = await evento([{ fuente: "prueba-a", titulo: "Aviso menor de prueba (ejemplo) sobre tasas", url: `${P}/documentos/decision-tasa.html` }], { puntaje: 30 });
      const antes = anthropic.solicitudes.length;
      expect((await redactar()).llamadas).toBe(0);
      expect(anthropic.solicitudes.length).toBe(antes);
      expect([await estado(soloB), await estado(bajo)]).toEqual(["abierto", "abierto"]);

      const sinLectura = await cola.obtener(soloB, new Date());
      expect(sinLectura).toMatchObject({ lecturaIa: false, sePuedePedir: false });
      expect(await cola.pedirBorrador(soloB, ctx(), new Date())).toMatchObject({ ok: false });

      expect(await cola.pedirBorrador(bajo, ctx(), new Date())).toEqual({ ok: true, valor: { id: bajo } });
      expect(await estado(bajo)).toBe("solicitado");
      expect(await dueño("select accion, actor from evento_auditoria where evento_id = $1", [bajo])).toEqual([{ accion: "solicitado", actor: "editora" }]);
      expect(await cola.pedirBorrador(bajo, ctx(), new Date())).toMatchObject({ ok: false }); // ya pedido
      expect((await redactar()).redactados).toBe(1);
      expect(await estado(bajo)).toBe("con_borrador");
    });

    it("un documento con una inyección de instrucciones no se manda: lectura manual, sin llamada ni gasto", async () => {
      const id = await evento([{ fuente: "prueba-a", titulo: "Nota de prueba (ejemplo) sobre el cobre", url: `${P}/documentos/inyeccion.html` }]);
      const antes = anthropic.solicitudes.length;
      const gasto = (await dueño("select coalesce(sum(llamadas), 0)::int as n from borradores_uso"))[0].n;
      await redactar();
      expect(anthropic.solicitudes.length).toBe(antes);
      expect((await dueño("select coalesce(sum(llamadas), 0)::int as n from borradores_uso"))[0].n).toBe(gasto);
      expect(await dueño("select resultado, motivo, banderas, llamadas from borrador_intentos where evento_id = $1", [id])).toEqual([
        { resultado: "lectura_manual", motivo: "posible_inyeccion", banderas: ["posible_inyeccion"], llamadas: 0 },
      ]);
      expect(await estado(id)).toBe("abierto");
      const detalle = await cola.obtener(id, new Date());
      expect(detalle).toMatchObject({ borrador: null, sePuedePedir: false, ultimoIntento: { resultado: "lectura_manual" } });
    });

    it("con el tope del mes agotado no se llama al modelo y el evento sigue en la cola manual", async () => {
      const id = await evento([{ fuente: "prueba-a", titulo: "Boletín de prueba (ejemplo) de tasas", url: `${P}/documentos/decision-tasa.html` }]);
      const antes = anthropic.solicitudes.length;
      const r = await redactar(1_000); // ya se gastó más que esto en el mes
      expect(r.estado).toBe("tope");
      expect(anthropic.solicitudes.length).toBe(antes);
      expect(await estado(id)).toBe("abierto");
      expect(await dueño("select count(*)::int as n from borrador_intentos where evento_id = $1", [id])).toEqual([{ n: 0 }]);
    });
  });

  describe("revisión en el panel (cola de /admin/eventos)", () => {
    const borradorDe = async (eventoId: string) => (await dueño("select id, estado from borradores where evento_id = $1", [eventoId]))[0];

    async function conBorrador(titulo: string): Promise<{ eventoId: string; borradorId: string; items: string[] }> {
      const eventoId = await evento([
        { fuente: "prueba-a", titulo, url: `${P}/documentos/decision-tasa.html` },
        { fuente: "prueba-b", titulo: `${titulo} · segunda fuente`, url: `${O}/documentos/nota.html` },
      ]);
      await redactar();
      const b = await borradorDe(eventoId);
      const items = (await dueño("select id from fuente_items where evento_id = $1 order by titulo", [eventoId])).map((f) => f.id as string);
      return { eventoId, borradorId: b.id, items };
    }

    it("la cola muestra el borrador con sus banderas, la anticopia y las dudas; el tablero cuenta los pendientes y el gasto", async () => {
      const { eventoId } = await conBorrador("Decisión de tasa de prueba para la cola (ejemplo)");
      const pendientes = await cola.pendientes(new Date());
      const e = pendientes.find((x) => x.id === eventoId)!;
      expect(e.borrador).toMatchObject({
        estado: "pendiente",
        modelo: "claude-haiku-5-5",
        banderas: ["fuentes_sin_lectura"],
        documentos: 1,
        contenido: { impacto_sugerido: "medio", dudas: ["Comprobar en el documento oficial la fecha de la decisión de prueba."] },
      });
      expect(e.borrador!.copiaProporcion).toBeGreaterThanOrEqual(0);
      expect(e.ultimoIntento).toMatchObject({ resultado: "borrador", llamadas: 1 });
      const t = await cola.tablero(new Date());
      expect(t.borradoresPendientes).toBeGreaterThanOrEqual(1);
      expect(t.gastoMes).toMatchObject({ topeMicros: 5_000_000 });
      expect(t.gastoMes.micros).toBeGreaterThan(0);
      expect(t.gastoTotalMicros).toBe(t.gastoMes.micros);
    });

    it("aceptar crea, en una transacción, la alerta en borrador (real) con sus fuentes, el borrador aceptado y el evento convertido", async () => {
      const { eventoId, borradorId, items } = await conBorrador("Decisión de tasa de prueba para aceptar (ejemplo)");
      const r = await cola.crearAlerta(alertas, eventoId, EDITADO, items, ctx(), { borradorId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const detalle = (await alertas.obtener(r.valor.id))!;
      expect(detalle.alerta).toMatchObject({ estado: "borrador", es_ejemplo: false, evento: EDITADO.evento, tema: "divisas" });
      expect(detalle.enlaces).toHaveLength(2);
      expect(detalle.auditoria.map((a) => a.accion)).toEqual(["creada", "editada", "editada"]);
      expect(detalle.auditoria[0]).toMatchObject({ actor: "editora", nota: `Desde borrador ${borradorId} · claude-haiku-5-5 · 2 fuentes` });
      expect(await dueño("select estado, alert_id from borradores where id = $1", [borradorId])).toEqual([{ estado: "aceptado", alert_id: r.valor.id }]);
      expect(await dueño("select estado, alert_id from eventos_candidatos where id = $1", [eventoId])).toEqual([{ estado: "convertido", alert_id: r.valor.id }]);
      const [audit] = await dueño("select accion, nota from evento_auditoria where evento_id = $1", [eventoId]);
      expect(audit.accion).toBe("convertido");
      expect(audit.nota).toContain(borradorId);
      // La confianza no la fija nadie: la calcula la vista con las fuentes (una primaria → alta).
      expect(detalle.vista.confianza).toBe("alta");
    });

    it("dos aceptaciones a la vez del mismo borrador: una sola alerta", async () => {
      const { eventoId, borradorId, items } = await conBorrador("Decisión de tasa de prueba en carrera (ejemplo)");
      const [a, b] = await Promise.all([
        cola.crearAlerta(alertas, eventoId, EDITADO, items, ctx(), { borradorId }),
        cola.crearAlerta(alertas, eventoId, EDITADO, items, ctx(), { borradorId }),
      ]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect(await dueño("select count(*)::int as n from alertas where id in (select alert_id from eventos_candidatos where id = $1)", [eventoId])).toEqual([{ n: 1 }]);
    });

    it("lo editado pasa por las reglas: con lenguaje de recomendación no se guarda nada y el borrador sigue pendiente", async () => {
      const { eventoId, borradorId, items } = await conBorrador("Decisión de tasa de prueba con error (ejemplo)");
      const r = await cola.crearAlerta(alertas, eventoId, { ...EDITADO, resumen: "Recomendamos comprar acciones de prueba." }, items, ctx(), { borradorId });
      expect(r.ok).toBe(false);
      expect((await borradorDe(eventoId)).estado).toBe("pendiente");
      expect(await estado(eventoId)).toBe("con_borrador");
      // Un borrador de otro evento no sirve.
      const otro = await conBorrador("Otra decisión de tasa de prueba (ejemplo)");
      expect(await cola.crearAlerta(alertas, eventoId, EDITADO, items, ctx(), { borradorId: otro.borradorId })).toMatchObject({ ok: false });
    });

    it("descartar exige un motivo, deja la auditoría y el evento sigue en la cola; no se descarta dos veces", async () => {
      const { eventoId, borradorId } = await conBorrador("Decisión de tasa de prueba para descartar (ejemplo)");
      expect(await cola.descartarBorrador(borradorId, "inventado", "", ctx())).toMatchObject({ ok: false });
      expect(await cola.descartarBorrador(borradorId, "impreciso", "Faltaba la fecha.", ctx())).toEqual({ ok: true, valor: { eventoId } });
      expect(await dueño("select estado, motivo_descarte from borradores where id = $1", [borradorId])).toEqual([{ estado: "descartado", motivo_descarte: "impreciso" }]);
      expect(await estado(eventoId)).toBe("con_borrador");
      const [audit] = await dueño("select accion, actor, nota from evento_auditoria where evento_id = $1", [eventoId]);
      expect(audit).toEqual({ accion: "borrador_descartado", actor: "editora", nota: `Borrador ${borradorId} · motivo: impreciso · Faltaba la fecha.` });
      expect(await cola.descartarBorrador(borradorId, "otro", "", ctx())).toMatchObject({ ok: false });
      expect(await cola.descartarBorrador("no-es-un-id", "otro", "", ctx())).toMatchObject({ ok: false });
      // Ya descartado: no se pide otro (la IA no vuelve a gastar en este evento) y se crea a mano.
      expect((await cola.obtener(eventoId, new Date()))?.sePuedePedir).toBe(false);
      const manual = await cola.crearAlerta(alertas, eventoId, EDITADO, [], ctx());
      expect(manual).toMatchObject({ ok: false }); // sin fuentes elegidas
    });

    it("una alerta a mano en un evento con borrador pendiente descarta el borrador («otro»)", async () => {
      const { eventoId, borradorId, items } = await conBorrador("Decisión de tasa de prueba a mano (ejemplo)");
      const r = await cola.crearAlerta(alertas, eventoId, EDITADO, items, ctx());
      expect(r.ok).toBe(true);
      expect(await dueño("select estado, motivo_descarte from borradores where id = $1", [borradorId])).toEqual([{ estado: "descartado", motivo_descarte: "otro" }]);
    });
  });
});
