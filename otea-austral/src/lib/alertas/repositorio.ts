/**
 * Alertas en Postgres. Cada cambio corre en una transacción que bloquea la
 * fila de la alerta, comprueba la versión que vio quien edita (bloqueo
 * optimista) y aplica las reglas puras de `rules.ts`. Si una regla rechaza
 * el cambio, se revierte todo. Consultas siempre parametrizadas.
 */
import { codigoError, type BaseDeDatos, type Consultor } from "@/lib/db/cliente";
import {
  aprobar,
  cambiarFuentes,
  crearAlerta,
  editar,
  enviarARevision,
  motivosInvariantesPublicada,
  motivosParaNoPublicar,
  publicar,
  retractar,
  type ContenidoEditable,
  type Contexto,
  type Resultado,
  type Transicion,
} from "@/lib/domain/rules";
import {
  AlertAuditSchema,
  AlertSchema,
  AlertSourceSchema,
  CorrectionSchema,
  Id,
  TipoFuente,
  type Alert,
  type AlertAudit,
  type Correction,
} from "@/lib/domain/schemas";
import { vistaConFuentes, type AlertView, type FuenteVista } from "@/lib/domain/view";

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type EnlaceFuente = {
  id: string;
  source_id: string;
  /** Copiados del registro al enlazar (ver la migración 0001). */
  organismo: string;
  nombre_fuente: string;
  tipo: TipoFuente;
  titulo_documento: string;
  url: string;
  fecha_publicacion: string;
  fecha_consulta: string;
  identificador?: string;
  agregada: string;
  retirada: string | null;
};

export type ResumenAlerta = Pick<Alert, "id" | "tema" | "evento" | "estado" | "impacto" | "fecha" | "es_ejemplo"> & {
  version: number;
  actualizada: string;
  fuentes_activas: number;
};

export type DetalleAlerta = {
  alerta: Alert;
  version: number;
  creada: string;
  actualizada: string;
  /** Activos y retirados, del más antiguo al más reciente. */
  enlaces: EnlaceFuente[];
  /** En orden de inserción. */
  auditoria: AlertAudit[];
  correcciones: Correction[];
  /** La alerta como la vería el público, con sus fuentes activas. */
  vista: AlertView;
  /** Vacío si hoy se podría publicar. */
  motivosParaNoPublicar: string[];
};

export type FuenteRegistro = { id: string; nombre: string; organismo: string; tipo: TipoFuente };

export type DatosNuevaAlerta = Pick<
  Alert,
  "tema" | "evento" | "resumen" | "filas" | "impacto" | "revisor" | "es_ejemplo"
>;

export type DatosEnlace = {
  source_id: string;
  titulo_documento: string;
  url: string;
  fecha_publicacion: string;
  fecha_consulta: string;
  identificador?: string;
};

/** Resultado de un cambio: la nueva versión de la alerta. */
export type Cambio = Resultado<{ id: string; version: number }>;

// ── Filas de la base ────────────────────────────────────────────────────────

type FilaAlerta = {
  id: string;
  tema: string;
  evento: string;
  resumen: string;
  filas: unknown;
  fecha: Date;
  revisor: string;
  impacto: string;
  estado: string;
  es_ejemplo: boolean;
  version: number;
  creada: Date;
  actualizada: Date;
};

type FilaEnlace = {
  id: string;
  alert_id: string;
  source_id: string;
  organismo: string;
  nombre_fuente: string;
  tipo: string;
  titulo_documento: string;
  url: string;
  fecha_publicacion: string;
  fecha_consulta: string;
  identificador: string | null;
  agregada: Date;
  retirada: Date | null;
};

type FilaAuditoria = { id: string; alert_id: string; accion: string; actor: string; fecha: Date; nota: string };
type FilaCorreccion = { id: string; alert_id: string; fecha: Date; texto_publico: string; tipo: string };

const SQL_ALERTA = `select id, tema, evento, resumen, filas, fecha, revisor, impacto, estado, es_ejemplo,
  version, creada, actualizada from alertas`;
const SQL_ENLACES = `select id, alert_id, source_id, organismo, nombre_fuente, tipo, titulo_documento, url,
  fecha_publicacion, fecha_consulta, identificador, agregada, retirada from alerta_fuentes`;
const SQL_AUDITORIA = "select id, alert_id, accion, actor, fecha, nota from alerta_auditoria";
const SQL_CORRECCIONES = "select id, alert_id, fecha, texto_publico, tipo from correcciones";

const iso = (fecha: Date) => fecha.toISOString();

function aAlerta(f: FilaAlerta): Alert {
  return AlertSchema.parse({
    id: f.id,
    tema: f.tema,
    evento: f.evento,
    resumen: f.resumen,
    filas: f.filas,
    fecha: iso(f.fecha),
    revisor: f.revisor,
    impacto: f.impacto,
    estado: f.estado,
    es_ejemplo: f.es_ejemplo,
  });
}

function aEnlace(f: FilaEnlace): EnlaceFuente {
  return {
    id: f.id,
    source_id: f.source_id,
    organismo: f.organismo,
    nombre_fuente: f.nombre_fuente,
    tipo: TipoFuente.parse(f.tipo),
    titulo_documento: f.titulo_documento,
    url: f.url,
    fecha_publicacion: f.fecha_publicacion,
    fecha_consulta: f.fecha_consulta,
    ...(f.identificador ? { identificador: f.identificador } : {}),
    agregada: iso(f.agregada),
    retirada: f.retirada ? iso(f.retirada) : null,
  };
}

function aFuenteVista(e: EnlaceFuente): FuenteVista {
  return {
    organismo: e.organismo,
    nombre_fuente: e.nombre_fuente,
    tipo: e.tipo,
    titulo: e.titulo_documento,
    url: e.url,
    fecha_publicacion: e.fecha_publicacion,
    ...(e.identificador ? { identificador: e.identificador } : {}),
  };
}

const aAuditoria = (f: FilaAuditoria): AlertAudit => AlertAuditSchema.parse({ ...f, fecha: iso(f.fecha) });
const aCorreccion = (f: FilaCorreccion): Correction => CorrectionSchema.parse({ ...f, fecha: iso(f.fecha) });

// ── Errores ─────────────────────────────────────────────────────────────────

const VERSION_DISTINTA = "La alerta cambió mientras la mirabas. Recarga la página y vuelve a intentarlo.";

/** Una regla rechazó el cambio: se lanza para revertir la transacción. */
class Rechazo extends Error {
  constructor(readonly motivos: string[]) {
    super(motivos.join(" "));
  }
}

function traducirError(error: unknown): Resultado<never> {
  if (error instanceof Rechazo) return { ok: false, motivos: error.motivos };
  const codigo = codigoError(error);
  const restriccion =
    typeof error === "object" && error !== null && "constraint" in error ? String(error.constraint) : "";
  if (codigo === "23505" && restriccion === "alerta_fuentes_sin_duplicados") {
    return { ok: false, motivos: ["Ese documento ya está enlazado a la alerta."] };
  }
  if (codigo === "OT006") return { ok: false, motivos: ["La fuente no está activa en el registro."] };
  if (codigo?.startsWith("OT")) {
    return { ok: false, motivos: ["La base de datos rechazó el cambio en el estado actual de la alerta."] };
  }
  if (codigo === "23514" || codigo === "22001" || codigo === "22007" || codigo === "22008") {
    return { ok: false, motivos: ["Algún dato no cumple el formato permitido."] };
  }
  throw error;
}

// ── Escritura ───────────────────────────────────────────────────────────────

type Bloqueada = { alerta: Alert; version: number; activos: EnlaceFuente[]; auditoria: AlertAudit[] };

async function bloquear(tx: Consultor, id: string, version: number): Promise<Bloqueada> {
  const [fila] = await tx.consulta<FilaAlerta>(`${SQL_ALERTA} where id = $1 for update`, [id]);
  if (!fila) throw new Rechazo(["La alerta no existe."]);
  if (fila.version !== version) throw new Rechazo([VERSION_DISTINTA]);
  const enlaces = await tx.consulta<FilaEnlace>(
    `${SQL_ENLACES} where alert_id = $1 and retirada is null order by agregada, id`,
    [id],
  );
  const auditoria = await tx.consulta<FilaAuditoria>(`${SQL_AUDITORIA} where alert_id = $1 order by orden`, [id]);
  return { alerta: aAlerta(fila), version: fila.version, activos: enlaces.map(aEnlace), auditoria: auditoria.map(aAuditoria) };
}

async function insertarAuditoria(tx: Consultor, filas: readonly AlertAudit[]) {
  for (const f of filas) {
    await tx.consulta(
      "insert into alerta_auditoria (id, alert_id, accion, actor, fecha, nota) values ($1, $2, $3, $4, $5, $6)",
      [f.id, f.alert_id, f.accion, f.actor, f.fecha, f.nota],
    );
  }
}

/** Guarda el estado y el contenido que deja la transición, más su auditoría y corrección. */
async function guardar(tx: Consultor, anterior: Bloqueada, t: Transicion): Promise<number> {
  const a = t.alerta;
  const [fila] = await tx.consulta<{ version: number }>(
    `update alertas set tema = $2, evento = $3, resumen = $4, filas = $5::jsonb,
       fecha = coalesce($6::timestamptz, fecha), impacto = $7, estado = $8, version = version + 1
     where id = $1 and version = $9
     returning version`,
    [
      a.id,
      a.tema,
      a.evento,
      a.resumen,
      JSON.stringify(a.filas),
      a.fecha === anterior.alerta.fecha ? null : a.fecha,
      a.impacto,
      a.estado,
      anterior.version,
    ],
  );
  if (!fila) throw new Rechazo([VERSION_DISTINTA]);
  await insertarAuditoria(tx, t.auditoria);
  if (t.correccion) {
    const c = t.correccion;
    await tx.consulta(
      "insert into correcciones (id, alert_id, fecha, texto_publico, tipo) values ($1, $2, $3, $4, $5)",
      [c.id, c.alert_id, c.fecha, c.texto_publico, c.tipo],
    );
  }
  return fila.version;
}

function exigir<T>(r: Resultado<T>): T {
  if (!r.ok) throw new Rechazo(r.motivos);
  return r.valor;
}

// ── Repositorio ─────────────────────────────────────────────────────────────

export function crearRepositorioAlertas(db: BaseDeDatos) {
  /** Ejecuta un cambio sobre una alerta bloqueada; cualquier rechazo revierte todo. */
  async function cambiar(
    id: string,
    version: number,
    paso: (b: Bloqueada, tx: Consultor) => Promise<number>,
  ): Promise<Cambio> {
    if (!Id.safeParse(id).success) return { ok: false, motivos: ["La alerta no existe."] };
    try {
      const nueva = await db.transaccion(async (tx) => paso(await bloquear(tx, id, version), tx));
      return { ok: true, valor: { id, version: nueva } };
    } catch (error) {
      return traducirError(error);
    }
  }

  return {
    async listar(): Promise<ResumenAlerta[]> {
      const filas = await db.consulta<FilaAlerta & { fuentes_activas: number }>(
        `select a.id, a.tema, a.evento, a.resumen, a.filas, a.fecha, a.revisor, a.impacto, a.estado,
                a.es_ejemplo, a.version, a.creada, a.actualizada,
                (select count(*)::int from alerta_fuentes f where f.alert_id = a.id and f.retirada is null)
                  as fuentes_activas
         from alertas a order by a.actualizada desc limit 200`,
      );
      return filas.map((f) => {
        const a = aAlerta(f);
        return {
          id: a.id,
          tema: a.tema,
          evento: a.evento,
          estado: a.estado,
          impacto: a.impacto,
          fecha: a.fecha,
          es_ejemplo: a.es_ejemplo,
          version: f.version,
          actualizada: iso(f.actualizada),
          fuentes_activas: f.fuentes_activas,
        };
      });
    },

    async obtener(id: string): Promise<DetalleAlerta | null> {
      if (!Id.safeParse(id).success) return null;
      const [fila] = await db.consulta<FilaAlerta>(`${SQL_ALERTA} where id = $1`, [id]);
      if (!fila) return null;
      const [enlaces, auditoria, correcciones] = await Promise.all([
        db.consulta<FilaEnlace>(`${SQL_ENLACES} where alert_id = $1 order by agregada, id`, [id]),
        db.consulta<FilaAuditoria>(`${SQL_AUDITORIA} where alert_id = $1 order by orden`, [id]),
        db.consulta<FilaCorreccion>(`${SQL_CORRECCIONES} where alert_id = $1 order by orden`, [id]),
      ]);
      const alerta = aAlerta(fila);
      const todos = enlaces.map(aEnlace);
      const activos = todos.filter((e) => e.retirada === null);
      const filasAuditoria = auditoria.map(aAuditoria);
      const filasCorreccion = correcciones.map(aCorreccion);
      return {
        alerta,
        version: fila.version,
        creada: iso(fila.creada),
        actualizada: iso(fila.actualizada),
        enlaces: todos,
        auditoria: filasAuditoria,
        correcciones: filasCorreccion,
        vista: vistaConFuentes(alerta, activos.map(aFuenteVista), filasCorreccion),
        motivosParaNoPublicar: motivosParaNoPublicar(alerta, activos, filasAuditoria),
      };
    },

    /** Alertas visibles para el público: publicadas, corregidas y retractadas. */
    async publicas(limite = 50): Promise<AlertView[]> {
      const filas = await db.consulta<FilaAlerta>(
        `${SQL_ALERTA} where estado in ('publicada', 'corregida', 'retractada') order by fecha desc, id limit $1`,
        [limite],
      );
      if (filas.length === 0) return [];
      const ids = filas.map((f) => f.id);
      const [enlaces, correcciones] = await Promise.all([
        db.consulta<FilaEnlace>(
          `${SQL_ENLACES} where alert_id = any($1::text[]) and retirada is null order by agregada, id`,
          [ids],
        ),
        db.consulta<FilaCorreccion>(`${SQL_CORRECCIONES} where alert_id = any($1::text[]) order by orden`, [ids]),
      ]);
      const filasCorreccion = correcciones.map(aCorreccion);
      return filas.map((f) =>
        vistaConFuentes(
          aAlerta(f),
          enlaces.filter((e) => e.alert_id === f.id).map((e) => aFuenteVista(aEnlace(e))),
          filasCorreccion,
        ),
      );
    },

    /** Fuentes activas del registro, para elegir al enlazar. */
    async fuentesDelRegistro(): Promise<FuenteRegistro[]> {
      const filas = await db.consulta<{ id: string; nombre: string; organismo: string; tipo: string }>(
        "select id, nombre, organismo, tipo from fuentes where activa order by organismo, nombre",
      );
      return filas.map((f) => ({ ...f, tipo: TipoFuente.parse(f.tipo) }));
    },

    async crear(datos: DatosNuevaAlerta, ctx: Contexto): Promise<Cambio> {
      const id = ctx.generarId();
      const r = crearAlerta({ ...datos, id, fecha: ctx.fecha }, ctx);
      if (!r.ok) return r;
      const a = r.valor.alerta;
      try {
        await db.transaccion(async (tx) => {
          await tx.consulta(
            `insert into alertas (id, tema, evento, resumen, filas, fecha, revisor, impacto, es_ejemplo)
             values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
            [a.id, a.tema, a.evento, a.resumen, JSON.stringify(a.filas), a.fecha, a.revisor, a.impacto, a.es_ejemplo],
          );
          await insertarAuditoria(tx, r.valor.auditoria);
        });
        return { ok: true, valor: { id, version: 1 } };
      } catch (error) {
        return traducirError(error);
      }
    },

    enviarARevision(id: string, version: number, ctx: Contexto): Promise<Cambio> {
      return cambiar(id, version, (b, tx) => guardar(tx, b, exigir(enviarARevision(b.alerta, ctx))));
    },

    aprobar(id: string, version: number, ctx: Contexto, nota = ""): Promise<Cambio> {
      return cambiar(id, version, (b, tx) => guardar(tx, b, exigir(aprobar(b.alerta, ctx, nota))));
    },

    publicar(id: string, version: number, ctx: Contexto): Promise<Cambio> {
      return cambiar(id, version, (b, tx) => guardar(tx, b, exigir(publicar(b.alerta, b.activos, b.auditoria, ctx))));
    },

    editar(
      id: string,
      version: number,
      cambios: Partial<ContenidoEditable>,
      ctx: Contexto,
      textoCorreccion?: string,
    ): Promise<Cambio> {
      return cambiar(id, version, (b, tx) => {
        const t = exigir(editar(b.alerta, cambios, ctx, textoCorreccion));
        const motivos = motivosInvariantesPublicada(t.alerta, b.activos);
        if (motivos.length > 0) throw new Rechazo(motivos);
        return guardar(tx, b, t);
      });
    },

    retractar(id: string, version: number, ctx: Contexto, textoPublico: string): Promise<Cambio> {
      return cambiar(id, version, (b, tx) => guardar(tx, b, exigir(retractar(b.alerta, ctx, textoPublico))));
    },

    /** Enlaza un documento de una fuente del registro (regla 4 si ya está publicada). */
    agregarFuente(
      id: string,
      version: number,
      enlace: DatosEnlace,
      ctx: Contexto,
      textoCorreccion?: string,
    ): Promise<Cambio> {
      return cambiar(id, version, async (b, tx) => {
        const validado = AlertSourceSchema.safeParse({ ...enlace, alert_id: id });
        if (!validado.success) {
          throw new Rechazo(validado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
        }
        const e = validado.data;
        const [fuente] = await tx.consulta<{ organismo: string }>(
          "select organismo from fuentes where id = $1 and activa",
          [e.source_id],
        );
        if (!fuente) throw new Rechazo(["La fuente no está activa en el registro."]);
        if (b.activos.some((a) => a.url === e.url)) {
          throw new Rechazo(["Ese documento ya está enlazado a la alerta."]);
        }
        const t = exigir(
          cambiarFuentes(b.alerta, `Fuente agregada: ${fuente.organismo} · ${e.titulo_documento}`, ctx, textoCorreccion),
        );
        await tx.consulta(
          `insert into alerta_fuentes (id, alert_id, source_id, titulo_documento, url, fecha_publicacion,
             fecha_consulta, identificador)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ctx.generarId(),
            id,
            e.source_id,
            e.titulo_documento,
            e.url,
            e.fecha_publicacion,
            e.fecha_consulta,
            e.identificador ?? null,
          ],
        );
        return guardar(tx, b, t);
      });
    },

    /** Retira un enlace: queda en el historial, deja de contar para la confianza. */
    retirarFuente(
      id: string,
      version: number,
      enlaceId: string,
      ctx: Contexto,
      textoCorreccion?: string,
    ): Promise<Cambio> {
      return cambiar(id, version, async (b, tx) => {
        const enlace = b.activos.find((e) => e.id === enlaceId);
        if (!enlace) throw new Rechazo(["Ese enlace no está activo en la alerta."]);
        const restantes = b.activos.filter((e) => e.id !== enlaceId);
        const t = exigir(
          cambiarFuentes(b.alerta, `Fuente retirada: ${enlace.organismo} · ${enlace.titulo_documento}`, ctx, textoCorreccion),
        );
        const motivos = motivosInvariantesPublicada(t.alerta, restantes);
        if (motivos.length > 0) {
          throw new Rechazo([...motivos, "Si la alerta ya no se sostiene, retráctala."]);
        }
        await tx.consulta("update alerta_fuentes set retirada = now() where id = $1 and alert_id = $2", [
          enlaceId,
          id,
        ]);
        return guardar(tx, b, t);
      });
    },
  };
}

export type RepositorioAlertas = ReturnType<typeof crearRepositorioAlertas>;
