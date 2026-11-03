import { codigoError, type BaseDeDatos, type Consultor } from "@/lib/db/cliente";
import type { Cambio, DatosEnlace, DatosNuevaAlerta, RepositorioAlertas } from "@/lib/alertas/repositorio";
import {
  BANDERAS,
  BorradorModeloSchema,
  INTENTOS_FINALES,
  MAX_INTENTOS_CON_ERROR,
  MOTIVOS_DESCARTE,
  RESULTADOS_INTENTO,
  type Bandera,
  type BorradorModelo,
  type MotivoDescarte,
  type ResultadoIntento,
} from "@/lib/borradores/esquema";
import { calcularConfianza, type Confianza } from "@/lib/domain/respaldo";
import type { Contexto, Resultado } from "@/lib/domain/rules";
import { permiteLecturaIa, TipoFuente, type Source } from "@/lib/domain/schemas";
import { hoyEnChile } from "@/lib/format";
import { SQL_LEER_GASTO_TOTAL } from "@/lib/ia/gasto-postgres";
import { eventoAbierto, senalesDeEvento, type FuenteAgrupable, type Senales, type TemaEvento } from "./agrupar";

/**
 * Cola de eventos candidatos en `/admin/eventos` (`docs/alertas-reales.md` §5): la dueña ve cada evento con sus fuentes
 * y, si la IA dejó uno, su borrador (banderas, cifras de la anticopia y dudas). Lo acepta (editado o no), lo descarta con
 * un motivo, pide un borrador para un evento bajo el umbral, descarta el evento o crea, a mano, una alerta en borrador con
 * las fuentes ya enlazadas. Las alertas nacen siempre con `es_ejemplo: false` y por el flujo de `rules.ts`; cada acción
 * deja su fila en `evento_auditoria` (solo agregar). Consultas parametrizadas; nada sale a internet y **nada de aquí
 * llama a un modelo** (lo hace solo la corrida de `otea-tareas`).
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

/** Fuentes del registro tal como las usa la cola (agrupar y saber si permiten la lectura con IA). */
export type FuenteDeCola = FuenteAgrupable & Partial<Pick<Source, "lectura_ia" | "activa">>;

export type BorradorEnCola = {
  id: string;
  estado: "pendiente" | "aceptado" | "descartado";
  /** Lo que escribió el modelo, ya revisado al guardarse (se vuelve a validar al leer); `null` si no valida. */
  contenido: BorradorModelo | null;
  modelo: string;
  costoMicros: number;
  copiaProporcion: number;
  copiaTramo: number;
  documentos: number;
  banderas: Bandera[];
  creado: string;
  motivoDescarte: MotivoDescarte | null;
  alertId: string | null;
};

export type IntentoEnCola = {
  resultado: ResultadoIntento;
  motivo: string | null;
  banderas: Bandera[];
  llamadas: number;
  costoMicros: number;
  creado: string;
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
  /** El borrador con IA del evento (uno como mucho), si lo hay. */
  borrador: BorradorEnCola | null;
  /** El último intento de la IA con este evento, si lo hubo. */
  ultimoIntento: IntentoEnCola | null;
  /** Alguna de sus fuentes permite la lectura con IA (`lectura_ia`): sin eso, el evento nunca llega al modelo. */
  lecturaIa: boolean;
  /** La dueña puede pedir un borrador: abierto, con tema, con `lectura_ia`, sin borrador, sin un intento final y abierto. */
  sePuedePedir: boolean;
};

export type AccionEvento = "descartado" | "convertido" | "solicitado" | "borrador_descartado";

export type FilaAuditoriaEvento = {
  accion: AccionEvento;
  actor: string;
  fecha: string;
  nota: string;
  alertId: string | null;
};

export type DetalleEvento = EventoEnCola & { auditoria: FilaAuditoriaEvento[]; intentos: IntentoEnCola[] };

/** Gasto de los borradores con IA en el mes de Chile en curso (lo cuenta la corrida de `otea-tareas`). */
export type GastoBorradores = { micros: number; llamadas: number; topeMicros: number | null };

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
  /** Feeds que respondieron alguna vez pero no traen ítems nuevos hace 14 días (`docs/alertas-reales.md` §8.3). */
  feedsSinNovedades: { feedUrl: string; organismo: string; ultimoItem: string | null }[];
  eventosPendientes: number;
  itemsSinEvento: number;
  borradoresPendientes: number;
  gastoMes: GastoBorradores;
  /** El resumen diario por correo (lo envía `otea-tareas`): su última corrida, lo de hoy y cuántas cuentas lo pidieron. */
  resumen: {
    ultimaCorrida: { inicio: string; resultado: string; cuentas: number; enviados: number; fallos: number } | null;
    enviadosHoy: number;
    fallidosHoy: number;
    suscritas: number;
  };
  /** Todo lo gastado en IA (asistente y borradores) desde el primer día, para el tope acumulado. */
  gastoTotalMicros: number;
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

type FilaBorrador = {
  id: string;
  evento_id: string;
  contenido: unknown;
  modelo: string;
  costo_micros: string;
  copia_proporcion: string;
  copia_tramo: number;
  documentos: number;
  banderas: string[];
  estado: BorradorEnCola["estado"];
  motivo_descarte: string | null;
  alert_id: string | null;
  creado: Date;
};

type FilaIntento = {
  evento_id: string;
  resultado: string;
  motivo: string | null;
  banderas: string[];
  llamadas: number;
  costo_micros: string;
  creado: Date;
};

const SQL_BORRADORES = `select id, evento_id, contenido, modelo, costo_micros::text, copia_proporcion::text, copia_tramo, documentos,
    banderas, estado, motivo_descarte, alert_id, creado
  from borradores`;
const SQL_INTENTOS = `select evento_id, resultado, motivo, banderas, llamadas, costo_micros::text, creado from borrador_intentos`;

const deLista = <T extends string>(lista: readonly T[], v: string): v is T => (lista as readonly string[]).includes(v);

function aBorrador(f: FilaBorrador): BorradorEnCola {
  const contenido = BorradorModeloSchema.safeParse(f.contenido);
  return {
    id: f.id,
    estado: f.estado,
    contenido: contenido.success ? contenido.data : null,
    modelo: f.modelo,
    costoMicros: Number(f.costo_micros),
    copiaProporcion: Number(f.copia_proporcion),
    copiaTramo: f.copia_tramo,
    documentos: f.documentos,
    banderas: f.banderas.filter((b): b is Bandera => deLista(BANDERAS, b)),
    creado: f.creado.toISOString(),
    motivoDescarte: f.motivo_descarte && deLista(MOTIVOS_DESCARTE, f.motivo_descarte) ? f.motivo_descarte : null,
    alertId: f.alert_id,
  };
}

function aIntento(f: FilaIntento): IntentoEnCola {
  return {
    resultado: deLista(RESULTADOS_INTENTO, f.resultado) ? f.resultado : "error",
    motivo: f.motivo,
    banderas: f.banderas.filter((b): b is Bandera => deLista(BANDERAS, b)),
    llamadas: f.llamadas,
    costoMicros: Number(f.costo_micros),
    creado: f.creado.toISOString(),
  };
}

/** Lo que la IA ya no va a intentar con un evento (un intento final o demasiados errores). */
function iaTermino(intentos: readonly IntentoEnCola[]): boolean {
  return (
    intentos.some((i) => INTENTOS_FINALES.includes(i.resultado)) ||
    intentos.filter((i) => i.resultado === "error").length >= MAX_INTENTOS_CON_ERROR
  );
}

type Extras = { borradores: readonly FilaBorrador[]; intentos: readonly FilaIntento[] };

function aEvento(
  e: FilaEvento,
  items: readonly FilaItem[],
  fuentes: readonly FuenteDeCola[],
  ahora: Date,
  extras: Extras,
): EventoEnCola {
  const propios = items.filter((i) => i.evento_id === e.id);
  const todas = propios.map(aFuente);
  const conLectura = new Set(fuentes.filter((f) => permiteLecturaIa({ lectura_ia: f.lectura_ia, activa: f.activa ?? false })).map((f) => f.id));
  const lecturaIa = propios.some((i) => conLectura.has(i.source_id));
  const fila = extras.borradores.find((b) => b.evento_id === e.id);
  const intentos = extras.intentos.filter((i) => i.evento_id === e.id).map(aIntento);
  const cerrado = !eventoAbierto(e, ahora);
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
    cerrado,
    fuentes: todas.slice(0, MAX_ITEMS_POR_EVENTO),
    fuentesOcultas: Math.max(0, todas.length - MAX_ITEMS_POR_EVENTO),
    confianzaPosible: calcularConfianza(todas),
    senales: senalesDeEvento(
      propios.map((i) => ({ sourceId: i.source_id, titulo: i.titulo, fecha: i.publicado ?? i.visto })),
      e.clave_agenda,
      fuentes,
      ahora,
    ),
    borrador: fila ? aBorrador(fila) : null,
    ultimoIntento: intentos.at(-1) ?? null,
    lecturaIa,
    sePuedePedir: e.estado === "abierto" && e.tema !== "sin_tema" && lecturaIa && !fila && !cerrado && !iaTermino(intentos),
  };
}

/** La fecha de publicación de un enlace: la del feed o la de la ingesta, nunca posterior a la consulta (hoy). */
export function fechaPublicacionEnlace(publicado: string | null, visto: string, hoy: string): string {
  const fecha = hoyEnChile(new Date(publicado ?? visto));
  return fecha > hoy ? hoy : fecha;
}

const NO_EXISTE = "El evento no existe.";
const YA_RESUELTO = "El evento ya se descartó o ya tiene una alerta: recarga la cola.";
const BORRADOR_NO_EXISTE = "El borrador no existe.";
const BORRADOR_RESUELTO = "El borrador ya se aceptó o se descartó: recarga la página.";

/** Origen de una alerta creada desde la cola: a mano, o aceptando el borrador con IA del evento. */
export type OrigenAlerta = { borradorId: string } | undefined;

export function crearColaEventos(db: BaseDeDatos, { fuentes }: { fuentes: readonly FuenteDeCola[] }) {
  /** Ítems de los eventos dados, con el organismo, el nombre y el tipo de su fuente en el registro de la base. */
  async function itemsDe(ids: readonly string[]): Promise<FilaItem[]> {
    if (ids.length === 0) return [];
    return db.consulta<FilaItem>(`${SQL_ITEMS} where i.evento_id = any($1::uuid[]) order by coalesce(i.publicado, i.visto), i.id`, [
      ids,
    ]);
  }

  /** Borradores e intentos de la IA de los eventos dados. */
  async function extrasDe(ids: readonly string[]): Promise<Extras> {
    if (ids.length === 0) return { borradores: [], intentos: [] };
    const [borradores, intentos] = await Promise.all([
      db.consulta<FilaBorrador>(`${SQL_BORRADORES} where evento_id = any($1::uuid[])`, [ids]),
      db.consulta<FilaIntento>(`${SQL_INTENTOS} where evento_id = any($1::uuid[]) order by orden`, [ids]),
    ]);
    return { borradores, intentos };
  }

  /**
   * Marca el evento como convertido y deja la fila de auditoría. Corre dentro de la transacción que crea la alerta: si
   * otra conversión o un descarte llegaron antes, devuelve el motivo y la alerta no se guarda.
   */
  async function vincular(
    tx: Consultor,
    eventoId: string,
    alertId: string,
    ctx: Contexto,
    nota: string,
    origen: OrigenAlerta,
  ): Promise<string[]> {
    const marcado = await tx.consulta(
      `update eventos_candidatos set estado = 'convertido', alert_id = $2
       where id = $1 and estado = any($3::text[]) returning 1`,
      [eventoId, alertId, PENDIENTES],
    );
    if (marcado.length === 0) return [YA_RESUELTO];
    if (origen) {
      // El borrador aceptado queda con su alerta; si otra acción lo resolvió antes, no se crea nada.
      const aceptado = await tx.consulta(
        `update borradores set estado = 'aceptado', alert_id = $3, resuelto = now()
         where id = $1 and evento_id = $2 and estado = 'pendiente' returning 1`,
        [origen.borradorId, eventoId, alertId],
      );
      if (aceptado.length === 0) return [BORRADOR_RESUELTO];
    } else {
      // Alerta a mano con un borrador pendiente: el borrador se descarta («otro») para que no quede colgado.
      await tx.consulta(
        `update borradores set estado = 'descartado', motivo_descarte = 'otro', resuelto = now()
         where evento_id = $1 and estado = 'pendiente'`,
        [eventoId],
      );
    }
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
      const ids = eventos.map((e) => e.id);
      const [items, extras] = await Promise.all([itemsDe(ids), extrasDe(ids)]);
      return eventos.map((e) => aEvento(e, items, fuentes, ahora, extras));
    },

    async obtener(id: string, ahora: Date): Promise<DetalleEvento | null> {
      if (!esUuid(id)) return null;
      const [evento] = await db.consulta<FilaEvento>(`${SQL_EVENTO} where id = $1`, [id]);
      if (!evento) return null;
      const [items, auditoria, extras] = await Promise.all([
        itemsDe([id]),
        db.consulta<{ accion: AccionEvento; actor: string; fecha: Date; nota: string; alert_id: string | null }>(
          "select accion, actor, fecha, nota, alert_id from evento_auditoria where evento_id = $1 order by orden",
          [id],
        ),
        extrasDe([id]),
      ]);
      return {
        ...aEvento(evento, items, fuentes, ahora, extras),
        auditoria: auditoria.map((f) => ({ accion: f.accion, actor: f.actor, fecha: iso(f.fecha), nota: f.nota, alertId: f.alert_id })),
        intentos: extras.intentos.map(aIntento),
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
      origen?: OrigenAlerta,
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
      const cuantas = `${enlaces.length} ${enlaces.length === 1 ? "fuente" : "fuentes"}`;
      let nota = `Desde el evento candidato ${eventoId} · ${cuantas}`;
      if (origen) {
        if (!esUuid(origen.borradorId)) return { ok: false, motivos: [BORRADOR_NO_EXISTE] };
        const [borrador] = await db.consulta<{ modelo: string; estado: string }>(
          "select modelo, estado from borradores where id = $1 and evento_id = $2",
          [origen.borradorId, eventoId],
        );
        if (!borrador) return { ok: false, motivos: [BORRADOR_NO_EXISTE] };
        if (borrador.estado !== "pendiente") return { ok: false, motivos: [BORRADOR_RESUELTO] };
        nota = `Desde borrador ${origen.borradorId} · ${borrador.modelo} · ${cuantas}`;
      }
      return alertas.crearConFuentes({ ...datos, es_ejemplo: false }, enlaces, ctx, {
        nota,
        vincular: (tx, alertId) =>
          vincular(tx, eventoId, alertId, ctx, `Alerta ${alertId} en borrador${origen ? `, desde el borrador ${origen.borradorId}` : ""}`, origen),
      });
    },

    /** Descarta el borrador con IA de un evento (motivo obligatorio, nota opcional); el evento sigue en la cola. */
    async descartarBorrador(borradorId: string, motivo: string, nota: string, ctx: Contexto): Promise<Resultado<{ eventoId: string }>> {
      if (!esUuid(borradorId)) return { ok: false, motivos: [BORRADOR_NO_EXISTE] };
      if (!deLista(MOTIVOS_DESCARTE, motivo)) return { ok: false, motivos: ["Elige el motivo del descarte."] };
      const texto = nota.trim();
      if (texto.length > 400) return { ok: false, motivos: ["La nota admite hasta 400 caracteres."] };
      try {
        return await db.transaccion(async (tx) => {
          const [fila] = await tx.consulta<{ evento_id: string }>(
            `update borradores set estado = 'descartado', motivo_descarte = $2, resuelto = now()
             where id = $1 and estado = 'pendiente' returning evento_id`,
            [borradorId, motivo],
          );
          if (!fila) {
            const [existe] = await tx.consulta("select 1 from borradores where id = $1", [borradorId]);
            return { ok: false, motivos: [existe ? BORRADOR_RESUELTO : BORRADOR_NO_EXISTE] };
          }
          await tx.consulta(
            "insert into evento_auditoria (evento_id, accion, actor, fecha, nota) values ($1, 'borrador_descartado', $2, $3, $4)",
            [fila.evento_id, ctx.actor, ctx.fecha, `Borrador ${borradorId} · motivo: ${motivo}${texto ? ` · ${texto}` : ""}`],
          );
          return { ok: true, valor: { eventoId: fila.evento_id } };
        });
      } catch (error) {
        if (codigoError(error)?.startsWith("OT")) return { ok: false, motivos: [BORRADOR_RESUELTO] };
        throw error;
      }
    },

    /**
     * Pide un borrador con IA para un evento abierto (p. ej. bajo el umbral): queda `solicitado` y lo redacta la próxima
     * corrida de `otea-tareas`, si allí la IA está activa (el sitio público no tiene la clave). Cuenta para el tope.
     */
    async pedirBorrador(eventoId: string, ctx: Contexto, ahora: Date): Promise<Resultado<{ id: string }>> {
      const detalle = await this.obtener(eventoId, ahora);
      if (!detalle) return { ok: false, motivos: [NO_EXISTE] };
      if (!detalle.sePuedePedir) {
        const motivo = !detalle.lecturaIa
          ? "Ninguna fuente de este evento permite la lectura con IA (lectura_ia): créala a mano."
          : detalle.tema === "sin_tema"
            ? "Un evento sin tema claro no va a la IA: créala a mano."
            : detalle.cerrado
              ? "El evento ya cerró (72 h): créala a mano."
              : detalle.borrador || detalle.estado !== "abierto"
                ? "El evento ya tiene un borrador pedido o listo."
                : "La IA ya lo intentó sin dejar borrador: créala a mano.";
        return { ok: false, motivos: [motivo] };
      }
      try {
        return await db.transaccion(async (tx) => {
          const marcado = await tx.consulta(
            `update eventos_candidatos set estado = 'solicitado' where id = $1 and estado = 'abierto' and tema <> 'sin_tema' returning 1`,
            [eventoId],
          );
          if (marcado.length === 0) return { ok: false, motivos: [YA_RESUELTO] };
          await tx.consulta(
            "insert into evento_auditoria (evento_id, accion, actor, fecha, nota) values ($1, 'solicitado', $2, $3, 'Borrador con IA pedido')",
            [eventoId, ctx.actor, ctx.fecha],
          );
          return { ok: true, valor: { id: eventoId } };
        });
      } catch (error) {
        if (codigoError(error)?.startsWith("OT")) return { ok: false, motivos: [YA_RESUELTO] };
        throw error;
      }
    },

    /** Lo que mira la dueña al entrar: la última corrida, los feeds con problemas y lo pendiente. */
    async tablero(ahora: Date): Promise<Tablero> {
      const [corridas, feeds, conteos, gasto, total, silenciosos, resumenes, hoy] = await Promise.all([
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
        db.consulta<{ eventos: number; items: number; borradores: number }>(
          `select (select count(*)::int from eventos_candidatos where estado = any($1::text[])) as eventos,
                  (select count(*)::int from fuente_items where evento_id is null) as items,
                  (select count(*)::int from borradores b join eventos_candidatos e on e.id = b.evento_id
                    where b.estado = 'pendiente' and e.estado = any($1::text[])) as borradores`,
          [PENDIENTES],
        ),
        db.consulta<{ llamadas: number; micros: string; tope: string }>(
          `select llamadas, costo_micros::text as micros, tope_micros::text as tope from borradores_uso
           where mes = date_trunc('month', now() at time zone 'America/Santiago')::date`,
        ),
        db.consulta<{ micros: string }>(SQL_LEER_GASTO_TOTAL),
        db.consulta<{ feed_url: string; organismo: string; ultimo_item: Date | null }>(
          `select g.feed_url, f.organismo, (select max(i.visto) from fuente_items i where i.feed_url = g.feed_url) as ultimo_item
           from ingesta_feeds g join fuentes f on f.id = g.source_id
           where g.ultimo_ok is not null
             and coalesce((select max(i.visto) from fuente_items i where i.feed_url = g.feed_url), '-infinity') < $1::timestamptz - interval '14 days'
           order by g.feed_url limit 50`,
          [ahora],
        ),
        db.consulta<{ inicio: Date; resultado: string; feeds: number; nuevos: number; fallos: number }>(
          "select inicio, resultado, feeds, nuevos, fallos from ingesta_corridas where tarea = 'resumen' order by orden desc limit 1",
        ),
        db.consulta<{ enviados: number; fallidos: number; suscritas: number }>(
          `select (select count(*)::int from resumen_envios where dia = ($1::timestamptz at time zone 'America/Santiago')::date and estado = 'enviado') as enviados,
                  (select count(*)::int from resumen_envios where dia = ($1::timestamptz at time zone 'America/Santiago')::date and estado = 'fallido') as fallidos,
                  (select count(*)::int from cuentas where resumen_previo) as suscritas`,
          [ahora],
        ),
      ]);
      const rc = resumenes[0];
      const g = gasto[0];
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
        feedsSinNovedades: silenciosos.map((f) => ({ feedUrl: f.feed_url, organismo: f.organismo, ultimoItem: f.ultimo_item ? iso(f.ultimo_item) : null })),
        eventosPendientes: conteos[0]?.eventos ?? 0,
        itemsSinEvento: conteos[0]?.items ?? 0,
        borradoresPendientes: conteos[0]?.borradores ?? 0,
        gastoMes: g ? { micros: Number(g.micros), llamadas: g.llamadas, topeMicros: Number(g.tope) } : { micros: 0, llamadas: 0, topeMicros: null },
        gastoTotalMicros: Number(total[0]?.micros ?? 0),
        resumen: {
          // En las corridas del resumen, `feeds` son las cuentas revisadas y `nuevos` los resúmenes enviados (migración 0011).
          ultimaCorrida: rc ? { inicio: iso(rc.inicio), resultado: rc.resultado, cuentas: rc.feeds, enviados: rc.nuevos, fallos: rc.fallos } : null,
          enviadosHoy: hoy[0]?.enviados ?? 0,
          fallidosHoy: hoy[0]?.fallidos ?? 0,
          suscritas: hoy[0]?.suscritas ?? 0,
        },
      };
    },
  };
}

export type ColaEventos = ReturnType<typeof crearColaEventos>;
