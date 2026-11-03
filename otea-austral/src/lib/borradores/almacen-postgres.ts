import { codigoError, type BaseDeDatos } from "@/lib/db/cliente";
import { UMBRAL_BORRADOR, CIERRE_MS, type TemaEvento } from "@/lib/ingesta/agrupar";
import { INTENTOS_FINALES, MAX_INTENTOS_CON_ERROR, type Bandera, type BorradorModelo, type ModeloBorrador, type ResultadoIntento } from "./esquema";

/**
 * Lo que la redacción necesita de la base (migración 0010): qué eventos redactar, guardar el borrador revisado y anotar
 * cada intento. Consultas parametrizadas; ninguna lleva texto de una fuente (no hay columna donde ponerlo).
 */

export type ItemDeRedaccion = {
  id: string;
  sourceId: string;
  organismo: string;
  tipo: "primaria" | "secundaria" | "prensa";
  titulo: string;
  url: string;
  /** `publicado` o, si falta, `visto`. */
  fecha: Date;
};

export type EventoParaRedactar = {
  id: string;
  tema: Exclude<TemaEvento, "sin_tema">;
  claveAgenda: string | null;
  primero: Date;
  ultimo: Date;
  solicitado: boolean;
  items: ItemDeRedaccion[];
};

export type BorradorParaGuardar = {
  eventoId: string;
  contenido: BorradorModelo;
  modelo: ModeloBorrador;
  entradaTokens: number;
  salidaTokens: number;
  cacheTokens: number;
  costoMicros: number;
  copiaProporcion: number;
  copiaTramo: number;
  documentos: number;
  banderas: readonly Bandera[];
  llamadas: number;
};

export type IntentoParaGuardar = {
  eventoId: string;
  resultado: Exclude<ResultadoIntento, "borrador">;
  motivo: string | null;
  banderas: readonly Bandera[];
  llamadas: number;
  costoMicros: number;
};

export interface AlmacenBorradores {
  /**
   * Eventos que se pueden redactar: pendientes, con tema, sobre el umbral o pedidos por la dueña, todavía abiertos (72 h),
   * sin borrador, sin un intento final y con alguna fuente cuyo id esté en `fuentesConLectura` (las de `lectura_ia`).
   * Primero los pedidos, después por puntaje.
   */
  elegibles(ahora: Date, limite: number, fuentesConLectura: readonly string[]): Promise<EventoParaRedactar[]>;
  /** Guarda el borrador y pasa el evento a `con_borrador` en una transacción; `false` si el evento ya no está pendiente. */
  guardarBorrador(b: BorradorParaGuardar): Promise<boolean>;
  registrarIntento(i: IntentoParaGuardar): Promise<void>;
}

const MAX_ITEMS = 12;

const SQL_ELEGIBLES = `select e.id, e.tema, e.clave_agenda, e.primero, e.ultimo, e.estado
  from eventos_candidatos e
  where e.estado in ('abierto', 'solicitado')
    and e.tema <> 'sin_tema'
    and (e.estado = 'solicitado' or e.puntaje >= $1::smallint)
    and e.primero > $2::timestamptz
    and not exists (select 1 from borradores b where b.evento_id = e.id)
    and not exists (select 1 from borrador_intentos i where i.evento_id = e.id and i.resultado = any($3::text[]))
    and (select count(*) from borrador_intentos i where i.evento_id = e.id and i.resultado = 'error') < $4::integer
    and exists (select 1 from fuente_items i where i.evento_id = e.id and i.source_id = any($5::text[]))
  order by (e.estado = 'solicitado') desc, e.puntaje desc, e.ultimo desc, e.id
  limit $6::integer`;

const SQL_ITEMS = `select i.id, i.evento_id, i.source_id, f.organismo, f.tipo, i.titulo, i.url, coalesce(i.publicado, i.visto) as fecha
  from fuente_items i join fuentes f on f.id = i.source_id
  where i.evento_id = any($1::uuid[])
  order by coalesce(i.publicado, i.visto), i.id`;

const SQL_GUARDAR = `insert into borradores (evento_id, contenido, modelo, entrada_tokens, salida_tokens, cache_tokens, costo_micros,
    copia_proporcion, copia_tramo, documentos, banderas)
  values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[])`;

const SQL_CON_BORRADOR = `update eventos_candidatos set estado = 'con_borrador'
  where id = $1 and estado in ('abierto', 'solicitado') returning 1`;

const SQL_INTENTO = `insert into borrador_intentos (evento_id, resultado, motivo, banderas, llamadas, costo_micros)
  values ($1, $2, $3, $4::text[], $5, $6)`;

/** El evento ya no está pendiente (lo resolvió la dueña mientras se redactaba): se revierte el borrador. */
class EventoResuelto extends Error {}

export function crearAlmacenBorradoresPostgres(db: BaseDeDatos): AlmacenBorradores {
  return {
    async elegibles(ahora, limite, fuentesConLectura) {
      if (fuentesConLectura.length === 0 || limite <= 0) return [];
      const eventos = await db.consulta<{
        id: string;
        tema: Exclude<TemaEvento, "sin_tema">;
        clave_agenda: string | null;
        primero: Date;
        ultimo: Date;
        estado: string;
      }>(SQL_ELEGIBLES, [
        UMBRAL_BORRADOR,
        new Date(ahora.getTime() - CIERRE_MS),
        INTENTOS_FINALES,
        MAX_INTENTOS_CON_ERROR,
        fuentesConLectura,
        limite,
      ]);
      if (eventos.length === 0) return [];
      const items = await db.consulta<{
        id: string;
        evento_id: string;
        source_id: string;
        organismo: string;
        tipo: ItemDeRedaccion["tipo"];
        titulo: string;
        url: string;
        fecha: Date;
      }>(SQL_ITEMS, [eventos.map((e) => e.id)]);
      return eventos.map((e) => ({
        id: e.id,
        tema: e.tema,
        claveAgenda: e.clave_agenda,
        primero: e.primero,
        ultimo: e.ultimo,
        solicitado: e.estado === "solicitado",
        items: items
          .filter((i) => i.evento_id === e.id)
          .slice(0, MAX_ITEMS)
          .map((i) => ({ id: i.id, sourceId: i.source_id, organismo: i.organismo, tipo: i.tipo, titulo: i.titulo, url: i.url, fecha: i.fecha })),
      }));
    },

    async guardarBorrador(b) {
      try {
        await db.transaccion(async (tx) => {
          await tx.consulta(SQL_GUARDAR, [
            b.eventoId,
            JSON.stringify(b.contenido),
            b.modelo,
            b.entradaTokens,
            b.salidaTokens,
            b.cacheTokens,
            b.costoMicros,
            b.copiaProporcion,
            b.copiaTramo,
            b.documentos,
            [...b.banderas],
          ]);
          const marcado = await tx.consulta(SQL_CON_BORRADOR, [b.eventoId]);
          if (marcado.length === 0) throw new EventoResuelto();
          await tx.consulta(SQL_INTENTO, [b.eventoId, "borrador", null, [...b.banderas], b.llamadas, b.costoMicros]);
        });
        return true;
      } catch (error) {
        // Ya tenía borrador (otra corrida) o la dueña lo resolvió entretanto: no queda nada.
        if (error instanceof EventoResuelto || codigoError(error) === "23505" || codigoError(error)?.startsWith("OT")) return false;
        throw error;
      }
    },

    async registrarIntento(i) {
      await db.consulta(SQL_INTENTO, [i.eventoId, i.resultado, i.motivo, [...i.banderas], i.llamadas, i.costoMicros]);
    },
  };
}
