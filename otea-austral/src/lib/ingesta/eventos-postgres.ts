import { randomUUID } from "node:crypto";
import type { BaseDeDatos } from "@/lib/db/cliente";
import { agrupar, CIERRE_MS, type EventoAbierto, type FuenteAgrupable, type ItemNuevo, type TemaEvento } from "./agrupar";
import type { ResumenAgrupacion } from "./servicio";

/**
 * Agrupación de los ítems pendientes en eventos candidatos (migración `0008`). Corre al final de cada corrida de la
 * ingesta, con el turno tomado: lee los ítems sin evento y los eventos abiertos, aplica `agrupar` (pura) y lo guarda en
 * una transacción. Si otra corrida asignó un ítem entretanto, se revierte todo y la siguiente vuelve a intentarlo.
 */

/** Ítems por corrida: lo que no alcanza queda para la siguiente. */
export const MAX_ITEMS_POR_CORRIDA = 500;

const SQL_PENDIENTES = `select id, source_id, titulo, publicado, visto from fuente_items
  where evento_id is null order by coalesce(publicado, visto), id limit $1`;

const SQL_ABIERTOS = `select id, tema, clave_agenda, primero, ultimo from eventos_candidatos where primero >= $1`;

const SQL_ITEMS_DE_EVENTOS = `select evento_id, source_id, titulo, publicado, visto from fuente_items
  where evento_id = any($1::uuid[])`;

const SQL_NUEVOS = `insert into eventos_candidatos (id, tema, clave_agenda, titulo_referencia, primero, ultimo, puntaje)
  select id, tema, clave_agenda, titulo_referencia, primero, ultimo, puntaje
  from jsonb_to_recordset($1::jsonb) as e(
    id uuid, tema text, clave_agenda text, titulo_referencia text, primero timestamptz, ultimo timestamptz, puntaje smallint
  )`;

// La ventana solo se ensancha y la clave de agenda se fija una vez (lo exige también el disparador de la base).
const SQL_CAMBIADOS = `update eventos_candidatos as c
  set clave_agenda = coalesce(c.clave_agenda, e.clave_agenda), primero = least(c.primero, e.primero),
      ultimo = greatest(c.ultimo, e.ultimo), puntaje = e.puntaje
  from jsonb_to_recordset($1::jsonb) as e(id uuid, clave_agenda text, primero timestamptz, ultimo timestamptz, puntaje smallint)
  where c.id = e.id`;

const SQL_ASIGNAR = `update fuente_items as i set evento_id = a.evento_id
  from jsonb_to_recordset($1::jsonb) as a(item_id uuid, evento_id uuid)
  where i.id = a.item_id and i.evento_id is null
  returning 1`;

type FilaItem = { id: string; source_id: string; titulo: string; publicado: Date | null; visto: Date };
type FilaAbierto = { id: string; tema: TemaEvento; clave_agenda: string | null; primero: Date; ultimo: Date };

class AsignacionConcurrente extends Error {}

export async function agruparPendientes(
  db: BaseDeDatos,
  { fuentes, ahora, generarId = randomUUID }: { fuentes: readonly FuenteAgrupable[]; ahora: Date; generarId?: () => string },
): Promise<ResumenAgrupacion> {
  const pendientes = await db.consulta<FilaItem>(SQL_PENDIENTES, [MAX_ITEMS_POR_CORRIDA]);
  if (pendientes.length === 0) return { asignados: 0, eventosNuevos: 0 };

  const filasAbiertas = await db.consulta<FilaAbierto>(SQL_ABIERTOS, [new Date(ahora.getTime() - CIERRE_MS)]);
  const deEventos =
    filasAbiertas.length > 0
      ? await db.consulta<FilaItem & { evento_id: string }>(SQL_ITEMS_DE_EVENTOS, [filasAbiertas.map((e) => e.id)])
      : [];
  const abiertos: EventoAbierto[] = filasAbiertas.map((e) => ({
    id: e.id,
    tema: e.tema,
    claveAgenda: e.clave_agenda,
    primero: e.primero,
    ultimo: e.ultimo,
    items: deEventos
      .filter((i) => i.evento_id === e.id)
      .map((i) => ({ sourceId: i.source_id, titulo: i.titulo, fecha: i.publicado ?? i.visto })),
  }));
  const items: ItemNuevo[] = pendientes.map((i) => ({
    id: i.id,
    sourceId: i.source_id,
    titulo: i.titulo,
    publicado: i.publicado,
    visto: i.visto,
  }));

  const r = agrupar({ items, abiertos, fuentes, ahora, generarId });
  const nuevos = r.eventos.filter((e) => e.nuevo);
  const cambiados = r.eventos.filter((e) => !e.nuevo);

  await db.transaccion(async (tx) => {
    if (nuevos.length > 0) {
      await tx.consulta(SQL_NUEVOS, [
        JSON.stringify(
          nuevos.map((e) => ({
            id: e.id,
            tema: e.tema,
            clave_agenda: e.claveAgenda,
            titulo_referencia: e.tituloReferencia,
            primero: e.primero.toISOString(),
            ultimo: e.ultimo.toISOString(),
            puntaje: e.puntaje,
          })),
        ),
      ]);
    }
    if (cambiados.length > 0) {
      const filas = cambiados.map((e) => ({
        id: e.id,
        clave_agenda: e.claveAgenda,
        primero: e.primero.toISOString(),
        ultimo: e.ultimo.toISOString(),
        puntaje: e.puntaje,
      }));
      await tx.consulta(SQL_CAMBIADOS, [JSON.stringify(filas)]);
    }
    const asignados = await tx.consulta(SQL_ASIGNAR, [
      JSON.stringify(r.asignaciones.map((a) => ({ item_id: a.itemId, evento_id: a.eventoId }))),
    ]);
    if (asignados.length !== r.asignaciones.length) throw new AsignacionConcurrente("fuente_items: asignación concurrente");
  });

  return { asignados: r.asignaciones.length, eventosNuevos: nuevos.length };
}
