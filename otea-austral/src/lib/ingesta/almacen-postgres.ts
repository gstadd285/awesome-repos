import type { Consultor } from "@/lib/db/cliente";
import type { AlmacenIngesta, Corrida, EstadoFeed, EstadoRobots, ItemParaGuardar } from "./servicio";

/**
 * Estado de la ingesta en Postgres (migración `0007`). La aplicación solo puede: agregar ítems (`fuente_items`, sin
 * cambios ni borrados), crear y actualizar el estado de un feed y agregar corridas. Ninguna columna guarda texto de
 * las fuentes.
 */

const SQL_ASEGURAR = `insert into ingesta_feeds (feed_url, source_id) values ($1, $2) on conflict (feed_url) do nothing`;

const SQL_ESTADO = `select feed_url, source_id, etag, ultima_modificacion, ultimo_intento, ultimo_ok, fallos_seguidos,
    pausado_hasta, robots, robots_revisado, ultimo_error
  from ingesta_feeds where feed_url = $1`;

const SQL_GUARDAR = `update ingesta_feeds
  set etag = $2, ultima_modificacion = $3, ultimo_intento = $4, ultimo_ok = $5, fallos_seguidos = $6,
      pausado_hasta = $7, robots = $8, robots_revisado = $9, ultimo_error = $10
  where feed_url = $1`;

// Un solo `insert` por feed; los repetidos (misma fuente y clave) se ignoran en la base.
const SQL_ITEMS = `insert into fuente_items (source_id, feed_url, clave, titulo, url, identificador, publicado)
  select source_id, feed_url, clave, titulo, url, identificador, publicado
  from jsonb_to_recordset($1::jsonb) as i(
    source_id text, feed_url text, clave text, titulo text, url text, identificador text, publicado timestamptz
  )
  on conflict (source_id, clave) do nothing
  returning 1`;

const SQL_CORRIDA = `insert into ingesta_corridas (tarea, inicio, fin, feeds, nuevos, fallos, resultado)
  values ($1, $2, $3, $4, $5, $6, $7)`;

type FilaFeed = {
  feed_url: string;
  source_id: string;
  etag: string | null;
  ultima_modificacion: string | null;
  ultimo_intento: Date | null;
  ultimo_ok: Date | null;
  fallos_seguidos: number;
  pausado_hasta: Date | null;
  robots: EstadoRobots;
  robots_revisado: Date | null;
  ultimo_error: string | null;
};

export function crearAlmacenIngestaPostgres(db: Consultor): AlmacenIngesta {
  return {
    async estadoFeed(feedUrl, sourceId) {
      await db.consulta(SQL_ASEGURAR, [feedUrl, sourceId]);
      const [fila] = await db.consulta<FilaFeed>(SQL_ESTADO, [feedUrl]);
      if (!fila) throw new Error("ingesta_feeds: estado no encontrado");
      return {
        feedUrl: fila.feed_url,
        sourceId: fila.source_id,
        etag: fila.etag,
        ultimaModificacion: fila.ultima_modificacion,
        ultimoIntento: fila.ultimo_intento,
        ultimoOk: fila.ultimo_ok,
        fallosSeguidos: fila.fallos_seguidos,
        pausadoHasta: fila.pausado_hasta,
        robots: fila.robots,
        robotsRevisado: fila.robots_revisado,
        ultimoError: fila.ultimo_error,
      } satisfies EstadoFeed;
    },

    async guardarEstado(e) {
      await db.consulta(SQL_GUARDAR, [
        e.feedUrl,
        e.etag,
        e.ultimaModificacion,
        e.ultimoIntento,
        e.ultimoOk,
        e.fallosSeguidos,
        e.pausadoHasta,
        e.robots,
        e.robotsRevisado,
        e.ultimoError,
      ]);
    },

    async guardarItems(items: readonly ItemParaGuardar[]) {
      if (items.length === 0) return 0;
      const filas = items.map((i) => ({
        source_id: i.sourceId,
        feed_url: i.feedUrl,
        clave: i.clave,
        titulo: i.titulo,
        url: i.url,
        identificador: i.identificador,
        publicado: i.publicado?.toISOString() ?? null,
      }));
      return (await db.consulta(SQL_ITEMS, [JSON.stringify(filas)])).length;
    },

    async registrarCorrida(c: Corrida) {
      await db.consulta(SQL_CORRIDA, [c.tarea, c.inicio, c.fin, c.feeds, c.nuevos, c.fallos, c.resultado]);
    },
  };
}
