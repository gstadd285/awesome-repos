import { z } from "zod";
import { TEMAS } from "./temas";
import { httpsUrl } from "./url";

export { TEMA_ETIQUETA } from "./temas";

// ── Enumeraciones ──────────────────────────────────────────────────────────

export const Tema = z.enum(TEMAS);
export type Tema = z.infer<typeof Tema>;

export const Direccion = z.enum(["gana", "condicionado", "pierde"]);
export type Direccion = z.infer<typeof Direccion>;

export const Confianza = z.enum(["baja", "media", "alta"]);
export type Confianza = z.infer<typeof Confianza>;

export const NivelVerificacion = z.enum([
  "sin_verificar",
  "una_fuente",
  "dos_fuentes",
  "fuente_oficial",
]);
export type NivelVerificacion = z.infer<typeof NivelVerificacion>;

export const EstadoAlerta = z.enum([
  "borrador",
  "en_revision",
  "publicada",
  "corregida",
  "retractada",
]);
export type EstadoAlerta = z.infer<typeof EstadoAlerta>;

export const Impacto = z.enum(["bajo", "medio", "alto"]);
export type Impacto = z.infer<typeof Impacto>;

export const TipoFuente = z.enum(["primaria", "secundaria", "prensa"]);
export type TipoFuente = z.infer<typeof TipoFuente>;

export const AccesoFuente = z.enum(["rss", "api", "manual"]);
export const PrioridadFuente = z.enum(["A", "B", "C"]);

export const AccionAuditoria = z.enum([
  "creada",
  "editada",
  "aprobada",
  "publicada",
  "corregida",
  "retractada",
]);
export type AccionAuditoria = z.infer<typeof AccionAuditoria>;

export const TipoCorreccion = z.enum(["correccion", "retractacion"]);

// ── Primitivas ─────────────────────────────────────────────────────────────

export const Id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Identificador inválido");

/** Identificador del equipo interno. No admite correos ni datos personales. */
export const Actor = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,39}$/, "Actor inválido (usa un alias interno)");

const texto = (max: number) => z.string().trim().min(1).max(max);

/** Fecha de calendario `AAAA-MM-DD` (valida días y años bisiestos). */
export const Fecha = z.iso.date();
/** Instante ISO 8601 con zona horaria. */
export const FechaHora = z.iso.datetime({ offset: true });

// ── Entidades ──────────────────────────────────────────────────────────────

export const SourceSchema = z.strictObject({
  id: Id,
  nombre: texto(120),
  organismo: texto(120),
  /** Vacía si aún no se verificó la dirección oficial: nunca se inventa. */
  url_base: z.union([httpsUrl, z.literal("")]),
  tipo: TipoFuente,
  temas: z.array(Tema).max(Tema.options.length),
  acceso: AccesoFuente,
  condiciones_reutilizacion: texto(500),
  prioridad: PrioridadFuente,
  activa: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Enlace de una alerta a un documento concreto. Se guarda la referencia
 * (título, enlace, fecha, identificador), nunca el texto de la fuente.
 */
export const AlertSourceSchema = z
  .strictObject({
    alert_id: Id,
    source_id: Id,
    titulo_documento: texto(300),
    url: httpsUrl,
    fecha_publicacion: Fecha,
    fecha_consulta: Fecha,
    identificador: texto(120).optional(),
  })
  .refine((s) => s.fecha_consulta >= s.fecha_publicacion, {
    message: "La fecha de consulta no puede ser anterior a la de publicación",
    path: ["fecha_consulta"],
  });
export type AlertSource = z.infer<typeof AlertSourceSchema>;

/**
 * Fila de ganadores y perdedores. `confianza` es la que declara el analista
 * para esa fila; al mostrarse se acota a la confianza calculada de la alerta.
 */
export const AlertRowSchema = z.strictObject({
  sector: texto(80),
  direccion: Direccion,
  condicion: texto(240),
  confianza: Confianza,
});
export type AlertRow = z.infer<typeof AlertRowSchema>;

/**
 * Alerta tal como se guarda. No tiene `confianza` ni `nivel_verificacion`:
 * ambos se calculan a partir de las fuentes (ver `rules.ts`) y un objeto
 * que intente traerlos se rechaza.
 */
export const AlertSchema = z.strictObject({
  id: Id,
  tema: Tema,
  evento: texto(160),
  /** Resumen redactado por Otea con sus propias palabras. */
  resumen: texto(600),
  filas: z.array(AlertRowSchema).min(1).max(8),
  fecha: FechaHora,
  revisor: texto(80),
  impacto: Impacto,
  estado: EstadoAlerta,
  /** Contenido de muestra: la interfaz lo marca como "Datos de ejemplo". */
  es_ejemplo: z.boolean(),
});
export type Alert = z.infer<typeof AlertSchema>;

/** Registro de auditoría: solo se agregan filas. Sin datos personales. */
export const AlertAuditSchema = z.strictObject({
  id: Id,
  alert_id: Id,
  accion: AccionAuditoria,
  actor: Actor,
  fecha: FechaHora,
  nota: z.string().trim().max(500),
});
export type AlertAudit = z.infer<typeof AlertAuditSchema>;

export const CorrectionSchema = z.strictObject({
  id: Id,
  alert_id: Id,
  fecha: FechaHora,
  texto_publico: texto(600),
  tipo: TipoCorreccion,
});
export type Correction = z.infer<typeof CorrectionSchema>;
