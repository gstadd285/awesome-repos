/**
 * Reglas de negocio de verificación y ciclo de vida de alertas.
 * Funciones puras: no leen reloj, red ni base de datos; el llamador entrega
 * el contexto (actor, fecha, generador de identificadores).
 */
import {
  AlertAuditSchema,
  AlertSchema,
  CorrectionSchema,
  type Alert,
  type AlertAudit,
  type Confianza,
  type Correction,
  type EstadoAlerta,
  type NivelVerificacion,
  type TipoFuente,
} from "./schemas";

/** Lo mínimo de una fuente que importa para calcular el respaldo. */
export type FuenteRespaldo = { tipo: TipoFuente; organismo: string };

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; motivos: string[] };

export type Contexto = {
  /** Alias interno de quien ejecuta la acción. */
  actor: string;
  /** Instante ISO 8601 de la acción. */
  fecha: string;
  generarId: () => string;
};

export type Transicion = {
  alerta: Alert;
  auditoria: AlertAudit[];
  correccion?: Correction;
};

const ORDEN_CONFIANZA: Record<Confianza, number> = { baja: 0, media: 1, alta: 2 };

const ESTADOS_PUBLICADOS: readonly EstadoAlerta[] = ["publicada", "corregida"];

// ── Respaldo y confianza ───────────────────────────────────────────────────

/** "Banco Central de Chile " y "banco central de chile" son el mismo organismo. */
export function normalizarOrganismo(organismo: string): string {
  return organismo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function contarOrganismosDistintos(fuentes: readonly FuenteRespaldo[]): number {
  return new Set(fuentes.map((f) => normalizarOrganismo(f.organismo))).size;
}

/**
 * Regla 1: `alta` exige al menos una fuente primaria.
 * Regla 2: con solo prensa, el máximo es `media` (y requiere dos organismos).
 * Regla 6: es el único camino para obtener la confianza; no se edita a mano.
 */
export function calcularConfianza(fuentes: readonly FuenteRespaldo[]): Confianza {
  if (fuentes.length === 0) return "baja";
  if (fuentes.some((f) => f.tipo === "primaria")) return "alta";
  if (fuentes.some((f) => f.tipo === "secundaria")) return "media";
  // Solo prensa: sirve para detectar, no para confirmar.
  return contarOrganismosDistintos(fuentes) >= 2 ? "media" : "baja";
}

export function calcularNivelVerificacion(
  fuentes: readonly FuenteRespaldo[],
): NivelVerificacion {
  if (fuentes.length === 0) return "sin_verificar";
  if (fuentes.some((f) => f.tipo === "primaria")) return "fuente_oficial";
  if (contarOrganismosDistintos(fuentes) >= 2) return "dos_fuentes";
  return "una_fuente";
}

/** La confianza de una fila nunca supera la que respaldan las fuentes. */
export function acotarConfianza(declarada: Confianza, maxima: Confianza): Confianza {
  return ORDEN_CONFIANZA[declarada] <= ORDEN_CONFIANZA[maxima] ? declarada : maxima;
}

// ── Publicación ────────────────────────────────────────────────────────────

/**
 * Hay aprobación vigente si la última fila `aprobada` de la alerta es
 * posterior a su última creación o edición. `auditoria` llega en orden de
 * inserción (el registro es de solo agregar).
 */
export function tieneAprobacionVigente(
  alertId: string,
  auditoria: readonly AlertAudit[],
): boolean {
  let ultimaAprobacion = -1;
  let ultimoCambio = -1;
  auditoria.forEach((fila, i) => {
    if (fila.alert_id !== alertId) return;
    if (fila.accion === "aprobada") ultimaAprobacion = i;
    if (fila.accion === "creada" || fila.accion === "editada") ultimoCambio = i;
  });
  return ultimaAprobacion > ultimoCambio;
}

/** Devuelve los motivos que impiden publicar; vacío si se puede. */
export function motivosParaNoPublicar(
  alerta: Alert,
  fuentes: readonly FuenteRespaldo[],
  auditoria: readonly AlertAudit[],
): string[] {
  const motivos: string[] = [];
  if (alerta.estado !== "borrador" && alerta.estado !== "en_revision") {
    motivos.push("Solo se publica una alerta en borrador o en revisión.");
  }
  if (fuentes.length === 0) {
    motivos.push("Toda alerta necesita al menos una fuente.");
  }
  if (alerta.impacto === "alto") {
    if (contarOrganismosDistintos(fuentes) < 2) {
      motivos.push("Impacto alto exige dos fuentes de organismos distintos.");
    }
    if (!tieneAprobacionVigente(alerta.id, auditoria)) {
      motivos.push(
        "Impacto alto exige una aprobación humana registrada después de la última edición.",
      );
    }
  }
  return motivos;
}

// ── Transiciones ───────────────────────────────────────────────────────────

/** Lanza si el contexto es inválido (p. ej. un correo como actor): es un error de programación. */
function filaAuditoria(
  alerta: Alert,
  accion: AlertAudit["accion"],
  ctx: Contexto,
  nota = "",
): AlertAudit {
  return AlertAuditSchema.parse({
    id: ctx.generarId(),
    alert_id: alerta.id,
    accion,
    actor: ctx.actor,
    fecha: ctx.fecha,
    nota,
  });
}

function correccionPublica(
  alerta: Alert,
  tipo: Correction["tipo"],
  texto: string,
  ctx: Contexto,
): Resultado<Correction> {
  const r = CorrectionSchema.safeParse({
    id: ctx.generarId(),
    alert_id: alerta.id,
    fecha: ctx.fecha,
    texto_publico: texto,
    tipo,
  });
  return r.success
    ? { ok: true, valor: r.data }
    : { ok: false, motivos: r.error.issues.map((i) => `texto_publico: ${i.message}`) };
}

function validar(alerta: Alert): Resultado<Alert> {
  const r = AlertSchema.safeParse(alerta);
  return r.success
    ? { ok: true, valor: r.data }
    : { ok: false, motivos: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

export function crearAlerta(
  datos: Omit<Alert, "estado">,
  ctx: Contexto,
): Resultado<Transicion> {
  const v = validar({ ...datos, estado: "borrador" });
  if (!v.ok) return v;
  return {
    ok: true,
    valor: { alerta: v.valor, auditoria: [filaAuditoria(v.valor, "creada", ctx)] },
  };
}

export function enviarARevision(alerta: Alert, ctx: Contexto): Resultado<Transicion> {
  if (alerta.estado !== "borrador") {
    return { ok: false, motivos: ["Solo un borrador puede enviarse a revisión."] };
  }
  const nueva: Alert = { ...alerta, estado: "en_revision" };
  return {
    ok: true,
    valor: { alerta: nueva, auditoria: [filaAuditoria(nueva, "editada", ctx, "Enviada a revisión")] },
  };
}

export function aprobar(alerta: Alert, ctx: Contexto, nota = ""): Resultado<Transicion> {
  if (alerta.estado !== "en_revision") {
    return { ok: false, motivos: ["Solo se aprueba una alerta en revisión."] };
  }
  return {
    ok: true,
    valor: { alerta, auditoria: [filaAuditoria(alerta, "aprobada", ctx, nota)] },
  };
}

export function publicar(
  alerta: Alert,
  fuentes: readonly FuenteRespaldo[],
  auditoria: readonly AlertAudit[],
  ctx: Contexto,
): Resultado<Transicion> {
  const motivos = motivosParaNoPublicar(alerta, fuentes, auditoria);
  if (motivos.length > 0) return { ok: false, motivos };
  const nueva: Alert = { ...alerta, estado: "publicada" };
  return {
    ok: true,
    valor: { alerta: nueva, auditoria: [filaAuditoria(nueva, "publicada", ctx)] },
  };
}

/** Campos que forman el contenido de una alerta. */
export type ContenidoEditable = Pick<Alert, "tema" | "evento" | "resumen" | "filas" | "impacto">;

/** Solo toma los campos editables, aunque `cambios` traiga otros en tiempo de ejecución. */
function aplicarCambios(alerta: Alert, cambios: Partial<ContenidoEditable>): Alert {
  return {
    ...alerta,
    tema: cambios.tema ?? alerta.tema,
    evento: cambios.evento ?? alerta.evento,
    resumen: cambios.resumen ?? alerta.resumen,
    filas: cambios.filas ?? alerta.filas,
    impacto: cambios.impacto ?? alerta.impacto,
  };
}

function huellaContenido(c: ContenidoEditable): string {
  return JSON.stringify([
    c.tema,
    c.evento,
    c.resumen,
    c.impacto,
    c.filas.map((f) => [f.sector, f.direccion, f.condicion, f.confianza]),
  ]);
}

/**
 * Regla 4: una alerta publicada no se edita en silencio. Cualquier cambio de
 * contenido la pasa a `corregida`, crea una corrección pública y deja huella
 * en la auditoría. En borrador o revisión basta la fila `editada`.
 */
export function editar(
  alerta: Alert,
  cambios: Partial<ContenidoEditable>,
  ctx: Contexto,
  textoCorreccion?: string,
): Resultado<Transicion> {
  if (alerta.estado === "retractada") {
    return { ok: false, motivos: ["Una alerta retractada no se edita."] };
  }
  const candidata = aplicarCambios(alerta, cambios);
  if (huellaContenido(candidata) === huellaContenido(alerta)) {
    return { ok: false, motivos: ["No hay cambios de contenido."] };
  }

  if (!ESTADOS_PUBLICADOS.includes(alerta.estado)) {
    const v = validar(candidata);
    if (!v.ok) return v;
    return {
      ok: true,
      valor: { alerta: v.valor, auditoria: [filaAuditoria(v.valor, "editada", ctx)] },
    };
  }

  const texto = textoCorreccion?.trim() ?? "";
  if (texto.length === 0) {
    return {
      ok: false,
      motivos: ["Editar una alerta publicada exige un texto público de corrección."],
    };
  }
  const v = validar({ ...candidata, estado: "corregida" });
  if (!v.ok) return v;
  const c = correccionPublica(v.valor, "correccion", texto, ctx);
  if (!c.ok) return c;
  return {
    ok: true,
    valor: {
      alerta: v.valor,
      auditoria: [filaAuditoria(v.valor, "corregida", ctx, `Corrección ${c.valor.id}`)],
      correccion: c.valor,
    },
  };
}

/** Regla 5: la retractación no borra; la alerta queda visible y tachada. */
export function retractar(
  alerta: Alert,
  ctx: Contexto,
  textoPublico: string,
): Resultado<Transicion> {
  if (!ESTADOS_PUBLICADOS.includes(alerta.estado)) {
    return { ok: false, motivos: ["Solo se retracta una alerta publicada o corregida."] };
  }
  const texto = textoPublico.trim();
  if (texto.length === 0) {
    return { ok: false, motivos: ["La retractación exige un texto público."] };
  }
  const nueva: Alert = { ...alerta, estado: "retractada" };
  const c = correccionPublica(nueva, "retractacion", texto, ctx);
  if (!c.ok) return c;
  return {
    ok: true,
    valor: {
      alerta: nueva,
      auditoria: [filaAuditoria(nueva, "retractada", ctx, `Retractación ${c.valor.id}`)],
      correccion: c.valor,
    },
  };
}
