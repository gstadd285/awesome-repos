import { codigoError, type BaseDeDatos, type Consultor } from "@/lib/db/cliente";
import type { Cambio, DatosEnlace, DatosNuevaAlerta, RepositorioAlertas } from "@/lib/alertas/repositorio";
import { calcularConfianza, type Confianza } from "@/lib/domain/respaldo";
import type { Contexto, Resultado } from "@/lib/domain/rules";
import { TipoFuente } from "@/lib/domain/schemas";
import { hoyEnChile } from "@/lib/format";
import { eventoAbierto, senalesDeEvento, type FuenteAgrupable, type Senales, type TemaEvento } from "./agrupar";

/**
 * Cola manual de eventos candidatos en `/admin/eventos` (`docs/alertas-reales.md` §5, sin IA): la dueña ve cada evento
 * con sus fuentes, lo descarta o crea con él, a mano, una alerta en borrador con las fuentes ya enlazadas. Las alertas
 * nacen siempre con `es_ejemplo: false` y por el flujo de `rules.ts`; cada acción deja su fila en `evento_auditoria`
 * (solo agregar). Consultas parametrizadas; nada sale a internet.
 */

export type EstadoEvento = "abierto" | "solicitado" | "con_borrador" | "descartado" | "convertido";
const PENDIENTES: readonly EstadoEvento[] = ["abierto", "solicitado", "con_borrador"];

/** Fuentes que se enlazan como máximo al crear una alerta desde un evento. */
export const MAX_FUENTES_POR_ALERTA = 12;
/** Eventos que muestra la cola y fuentes que se muestran por evento. */
const MAX_EVENTOS_COLA = 100;
const MAX_ITEMS_POR_EVENTO = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const esUuid = (v: string): boolean => UUID.test(v);

export type FuenteDeEvento = {
  id: string;
  sourceId: string;
  organismo: string;
  nombreFuente: string;
  tipo: TipoFuente;
  titulo: string;
  url: string;
  identificador: string | null;
  publicado: string | null;
  visto: string;
};

export type EventoEnCola = {
  id: string;
  tema: TemaEvento;
  claveAgenda: string | null;
  tituloReferencia: string;
  primero: string;
  ultimo: string;
  puntaje: number;
  estado: EstadoEvento;
  alertId: string | null;
  /** Ya no recibe ítems (72 h desde el primero). */
  cerrado: boolean;
  fuentes: FuenteDeEvento[];
  /** Fuentes que no caben en la vista (más de 50). */
  fuentesOcultas: number;
  /** Lo que daría `rules.ts` con estas fuentes: la confianza que tendría la alerta. */
  confianzaPosible: Confianza;
  senales: Senales;
};

export type FilaAuditoriaEvento = {
  accion: "descartado" | "convertido";
  actor: string;
  fecha: string;
  nota: string;
  alertId: string | null;
};

export type DetalleEvento = EventoEnCola & { auditoria: FilaAuditoriaEvento[] };

export type Tablero = {
  ultimaCorrida: { inicio: string; fin: string; resultado: string; feeds: number; nuevos: number; fallos: number } | null;
  feedsConProblemas: {
    feedUrl: string;
    sourceId: string;
    organismo: string;
    fallosSeguidos: number;
    pausadoHasta: string | null;
    ultimoError: string | null;
  }[];
  eventosPendientes: number;
  itemsSinEvento: number;
};

const SQL_EVENTO = `select id, tema, clave_agenda, titulo_referencia, primero, ultimo, puntaje, estado, alert_id
  from eventos_candidatos`;

const SQL_ITEMS = `select i.id, i.evento_id, i.source_id, f.organismo, f.nombre, f.tipo, i.titulo, i.url, i.identificador,
    i.publicado, i.visto
  from fuente_items i join fuentes f on f.id = i.source_id`;

type FilaEvento = {
  id: string;
  tema: TemaEvento;
  clave_agenda: string | null;
  titulo_referencia: string;
  primero: Date;
  ultimo: Date;
  puntaje: number;
  estado: EstadoEvento;
  alert_id: string | null;
};

type FilaItem = {
  id: string;
  evento_id: string;
  source_id: string;
  organismo: string;
  nombre: string;
  tipo: string;
  titulo: string;
  url: string;
  identificador: string | null;
  publicado: Date | null;
  visto: Date;
};

const iso = (d: Date) => d.toISOString();

function aFuente(f: FilaItem): FuenteDeEvento {
  return {
    id: f.id,
    sourceId: f.source_id,
    organismo: f.organismo,
    nombreFuente: f.nombre,
    tipo: TipoFuente.parse(f.tipo),
    titulo: f.titulo,
    url: f.url,
    identificador: f.identificador,
    publicado: f.publicado ? iso(f.publicado) : null,
    visto: iso(f.visto),
  };
}

function aEvento(e: FilaEvento, items: readonly FilaItem[], fuentes: readonly FuenteAgrupable[], ahora: Date): EventoEnCola {
  const propios = items.filter((i) => i.evento_id === e.id);
  const todas = propios.map(aFuente);
  return {
    id: e.id,
    tema: e.tema,
    claveAgenda: e.clave_agenda,
    tituloReferencia: e.titulo_referencia,
    primero: iso(e.primero),
    ultimo: iso(e.ultimo),
    puntaje: e.puntaje,
    estado: e.estado,
    alertId: e.alert_id,
    cerrado: !eventoAbierto(e, ahora),
    fuentes: todas.slice(0, MAX_ITEMS_POR_EVENTO),
    fuentesOcultas: Math.max(0, todas.length - MAX_ITEMS_POR_EVENTO),
    confianzaPosible: calcularConfianza(todas),
    senales: senalesDeEvento(
      propios.map((i) => ({ sourceId: i.source_id, titulo: i.titulo, fecha: i.publicado ?? i.visto })),
      e.clave_agenda,
      fuentes,
      ahora,
    ),
  };
}

/** La fecha de publicación de un enlace: la del feed o la de la ingesta, nunca posterior a la consulta (hoy). */
export function fechaPublicacionEnlace(publicado: string | null, visto: string, hoy: string): string {
  const fecha = hoyEnChile(new Date(publicado ?? visto));
  return fecha > hoy ? hoy : fecha;
}

const NO_EXISTE = "El evento no existe.";
const YA_RESUELTO = "El evento ya se descartó o ya tiene una alerta: recarga la cola.";

export function crearColaEventos(db: BaseDeDatos, { fuentes }: { fuentes: readonly FuenteAgrupable[] }) {
  /** Ítems de los eventos dados, con el organismo, el nombre y el tipo de su fuente en el registro de la base. */
  async function itemsDe(ids: readonly string[]): Promise<FilaItem[]> {
    if (ids.length === 0) return [];
    return db.consulta<FilaItem>(`${SQL_ITEMS} where i.evento_id = any($1::uuid[]) order by coalesce(i.publicado, i.visto), i.id`, [
      ids,
    ]);
  }

  /**
   * Marca el evento como convertido y deja la fila de auditoría. Corre dentro de la transacción que crea la alerta: si
   * otra conversión o un descarte llegaron antes, devuelve el motivo y la alerta no se guarda.
   */
  async function vincular(tx: Consultor, eventoId: string, alertId: string, ctx: Contexto, nota: string): Promise<string[]> {
    const marcado = await tx.consulta(
      `update eventos_candidatos set estado = 'convertido', alert_id = $2
       where id = $1 and estado = any($3::text[]) returning 1`,
      [eventoId, alertId, PENDIENTES],
    );
    if (marcado.length === 0) return [YA_RESUELTO];
    await tx.consulta(
      "insert into evento_auditoria (evento_id, accion, actor, fecha, nota, alert_id) values ($1, 'convertido', $2, $3, $4, $5)",
      [eventoId, ctx.actor, ctx.fecha, nota, alertId],
    );
    return [];
  }

  return {
    /** Eventos sin resolver, por puntaje y hora (la cola muestra todos, estén o no sobre el umbral de la IA). */
    async pendientes(ahora: Date): Promise<EventoEnCola[]> {
      const eventos = await db.consulta<FilaEvento>(
        `${SQL_EVENTO} where estado = any($1::text[]) order by puntaje desc, ultimo desc, id limit $2`,
        [PENDIENTES, MAX_EVENTOS_COLA],
      );
      const items = await itemsDe(eventos.map((e) => e.id));
      return eventos.map((e) => aEvento(e, items, fuentes, ahora));
    },

    async obtener(id: string, ahora: Date): Promise<DetalleEvento | null> {
      if (!esUuid(id)) return null;
      const [evento] = await db.consulta<FilaEvento>(`${SQL_EVENTO} where id = $1`, [id]);
      if (!evento) return null;
      const [items, auditoria] = await Promise.all([
        itemsDe([id]),
        db.consulta<{ accion: "descartado" | "convertido"; actor: string; fecha: Date; nota: string; alert_id: string | null }>(
          "select accion, actor, fecha, nota, alert_id from evento_auditoria where evento_id = $1 order by orden",
          [id],
        ),
      ]);
      return {
        ...aEvento(evento, items, fuentes, ahora),
        auditoria: auditoria.map((f) => ({ accion: f.accion, actor: f.actor, fecha: iso(f.fecha), nota: f.nota, alertId: f.alert_id })),
      };
    },

    /** Descarta un evento sin resolver y lo deja en la auditoría (con una nota opcional, para calibrar el umbral). */
    async descartar(id: string, ctx: Contexto, nota: string): Promise<Resultado<{ id: string }>> {
      if (!esUuid(id)) return { ok: false, motivos: [NO_EXISTE] };
      const texto = nota.trim();
      if (texto.length > 500) return { ok: false, motivos: ["La nota admite hasta 500 caracteres."] };
      try {
        return await db.transaccion(async (tx) => {
          const marcado = await tx.consulta(
            `update eventos_candidatos set estado = 'descartado' where id = $1 and estado = any($2::text[]) returning 1`,
            [id, PENDIENTES],
          );
          if (marcado.length === 0) {
            const [existe] = await tx.consulta("select 1 from eventos_candidatos where id = $1", [id]);
            return { ok: false, motivos: [existe ? YA_RESUELTO : NO_EXISTE] };
          }
          await tx.consulta(
            "insert into evento_auditoria (evento_id, accion, actor, fecha, nota) values ($1, 'descartado', $2, $3, $4)",
            [id, ctx.actor, ctx.fecha, texto],
          );
          return { ok: true, valor: { id } };
        });
      } catch (error) {
        if (codigoError(error)?.startsWith("OT")) return { ok: false, motivos: [YA_RESUELTO] };
        throw error;
      }
    },

    /**
     * Crea a mano una alerta en borrador desde un evento, con las fuentes elegidas ya enlazadas, en una transacción
     * (`crearConFuentes` de `repositorio.ts`, con las reglas de siempre). La alerta **no es de ejemplo** y los datos de
     * cada fuente salen de la base, nunca del formulario: de él solo llegan los ids de los ítems elegidos.
     */
    async crearAlerta(
      alertas: RepositorioAlertas,
      eventoId: string,
      datos: Omit<DatosNuevaAlerta, "es_ejemplo">,
      itemIds: readonly string[],
      ctx: Contexto,
    ): Promise<Cambio> {
      if (!esUuid(eventoId)) return { ok: false, motivos: [NO_EXISTE] };
      const elegidos = [...new Set(itemIds)].filter(esUuid);
      if (elegidos.length === 0) return { ok: false, motivos: ["Elige al menos una fuente del evento."] };
      if (elegidos.length > MAX_FUENTES_POR_ALERTA) {
        return { ok: false, motivos: [`Elige como máximo ${MAX_FUENTES_POR_ALERTA} fuentes.`] };
      }
      const [evento] = await db.consulta<{ estado: EstadoEvento }>("select estado from eventos_candidatos where id = $1", [eventoId]);
      if (!evento) return { ok: false, motivos: [NO_EXISTE] };
      if (!PENDIENTES.includes(evento.estado)) return { ok: false, motivos: [YA_RESUELTO] };

      const items = await db.consulta<FilaItem>(
        `${SQL_ITEMS} where i.evento_id = $1 and i.id = any($2::uuid[]) order by coalesce(i.publicado, i.visto), i.id`,
        [eventoId, elegidos],
      );
      if (items.length !== elegidos.length) return { ok: false, motivos: ["Alguna fuente elegida no pertenece al evento."] };

      const hoy = hoyEnChile(new Date(ctx.fecha));
      const porUrl = new Map<string, DatosEnlace>();
      for (const i of items) {
        if (porUrl.has(i.url)) continue;
        const f = aFuente(i);
        porUrl.set(i.url, {
          source_id: f.sourceId,
          titulo_documento: f.titulo,
          url: f.url,
          fecha_publicacion: fechaPublicacionEnlace(f.publicado, f.visto, hoy),
          fecha_consulta: hoy,
          ...(f.identificador ? { identificador: f.identificador } : {}),
        });
      }
      const enlaces = [...porUrl.values()];
      const nota = `Desde el evento candidato ${eventoId} · ${enlaces.length} ${enlaces.length === 1 ? "fuente" : "fuentes"}`;
      return alertas.crearConFuentes({ ...datos, es_ejemplo: false }, enlaces, ctx, {
        nota,
        vincular: (tx, alertId) => vincular(tx, eventoId, alertId, ctx, `Alerta ${alertId} en borrador`),
      });
    },

    /** Lo que mira la dueña al entrar: la última corrida, los feeds con problemas y lo pendiente. */
    async tablero(ahora: Date): Promise<Tablero> {
      const [corridas, feeds, conteos] = await Promise.all([
        db.consulta<{ inicio: Date; fin: Date; resultado: string; feeds: number; nuevos: number; fallos: number }>(
          "select inicio, fin, resultado, feeds, nuevos, fallos from ingesta_corridas where tarea = 'ingesta' order by orden desc limit 1",
        ),
        db.consulta<{
          feed_url: string;
          source_id: string;
          organismo: string;
          fallos_seguidos: number;
          pausado_hasta: Date | null;
          ultimo_error: string | null;
        }>(
          `select g.feed_url, g.source_id, f.organismo, g.fallos_seguidos, g.pausado_hasta, g.ultimo_error
           from ingesta_feeds g join fuentes f on f.id = g.source_id
           where g.fallos_seguidos > 0 or g.pausado_hasta > $1
           order by g.source_id, g.feed_url limit 50`,
          [ahora],
        ),
        db.consulta<{ eventos: number; items: number }>(
          `select (select count(*)::int from eventos_candidatos where estado = any($1::text[])) as eventos,
                  (select count(*)::int from fuente_items where evento_id is null) as items`,
          [PENDIENTES],
        ),
      ]);
      const c = corridas[0];
      return {
        ultimaCorrida: c
          ? { inicio: iso(c.inicio), fin: iso(c.fin), resultado: c.resultado, feeds: c.feeds, nuevos: c.nuevos, fallos: c.fallos }
          : null,
        feedsConProblemas: feeds.map((f) => ({
          feedUrl: f.feed_url,
          sourceId: f.source_id,
          organismo: f.organismo,
          fallosSeguidos: f.fallos_seguidos,
          pausadoHasta: f.pausado_hasta ? iso(f.pausado_hasta) : null,
          ultimoError: f.ultimo_error,
        })),
        eventosPendientes: conteos[0]?.eventos ?? 0,
        itemsSinEvento: conteos[0]?.items ?? 0,
      };
    },
  };
}

export type ColaEventos = ReturnType<typeof crearColaEventos>;
