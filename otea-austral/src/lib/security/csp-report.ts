/**
 * Receptor de reportes de violación de la CSP (NIST CSF DE.CM-09).
 * Acepta el formato clásico (`report-uri`) y el de la Reporting API
 * (`report-to`), limita tamaño y volumen, y registra solo lo necesario:
 * directiva, origen y ruta de lo bloqueado y ruta del documento. Nunca
 * parámetros de URL, referer, muestras de código ni agente de usuario.
 */
import { z } from "zod";
import { logSecurityEvent, type SecurityEvent } from "./log";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "./rate-limit";

export const MAX_BYTES_REPORTE = 16 * 1024;

const TIPOS_ACEPTADOS = new Set([
  "application/csp-report",
  "application/reports+json",
  "application/json",
]);

const InformeClasico = z.object({
  "csp-report": z.object({
    "document-uri": z.string().optional(),
    "violated-directive": z.string().optional(),
    "effective-directive": z.string().optional(),
    "blocked-uri": z.string().optional(),
    disposition: z.string().optional(),
    "source-file": z.string().optional(),
    "line-number": z.number().optional(),
    "column-number": z.number().optional(),
  }),
});

const InformesReportingApi = z
  .array(
    z.object({
      type: z.string(),
      body: z
        .object({
          documentURL: z.string().optional(),
          effectiveDirective: z.string().optional(),
          blockedURL: z.string().optional(),
          disposition: z.string().optional(),
          sourceFile: z.string().optional(),
          lineNumber: z.number().optional(),
          columnNumber: z.number().optional(),
        })
        .optional(),
    }),
  )
  .min(1)
  .max(20);

const PALABRAS_CLAVE = new Set([
  "inline",
  "eval",
  "wasm-eval",
  "self",
  "data",
  "blob",
  "trusted-types-policy",
  "trusted-types-sink",
]);

/** Origen y ruta de una URL (sin parámetros); el esquema si no es http(s). */
export function resumirUrl(valor: string | undefined): string {
  if (!valor) return "[vacío]";
  const v = valor.trim();
  if (PALABRAS_CLAVE.has(v.toLowerCase())) return v.toLowerCase();
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname}`;
    return url.protocol;
  } catch {
    return "[desconocido]";
  }
}

function soloRuta(valor: string | undefined): string {
  if (!valor) return "[vacío]";
  try {
    return new URL(valor).pathname;
  } catch {
    return "[desconocido]";
  }
}

function directiva(valor: string | undefined): string {
  // En CSP nivel 2, `violated-directive` trae la directiva completa: basta el nombre.
  const nombre = valor?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z-]{1,40}$/.test(nombre) ? nombre : "[desconocida]";
}

function entero(valor: number | undefined): number | undefined {
  return valor !== undefined && Number.isInteger(valor) && valor >= 0 && valor <= 10_000_000
    ? valor
    : undefined;
}

function evento(datos: {
  directiva?: string;
  bloqueado?: string;
  documento?: string;
  disposicion?: string;
  fuente?: string;
  linea?: number;
  columna?: number;
}): SecurityEvent {
  const fuente = datos.fuente ? resumirUrl(datos.fuente) : undefined;
  return {
    tipo: "csp_violation",
    directiva: directiva(datos.directiva),
    bloqueado: resumirUrl(datos.bloqueado),
    documento: soloRuta(datos.documento),
    disposicion: datos.disposicion === "report" ? "report" : "enforce",
    ...(fuente ? { fuente } : {}),
    ...(entero(datos.linea) !== undefined ? { linea: entero(datos.linea) } : {}),
    ...(entero(datos.columna) !== undefined ? { columna: entero(datos.columna) } : {}),
  };
}

/** Convierte un cuerpo de reporte en eventos; `null` si no tiene un formato conocido. */
export function normalizarReportes(datos: unknown): SecurityEvent[] | null {
  const clasico = InformeClasico.safeParse(datos);
  if (clasico.success) {
    const r = clasico.data["csp-report"];
    return [
      evento({
        directiva: r["effective-directive"] ?? r["violated-directive"],
        bloqueado: r["blocked-uri"],
        documento: r["document-uri"],
        disposicion: r.disposition,
        fuente: r["source-file"],
        linea: r["line-number"],
        columna: r["column-number"],
      }),
    ];
  }
  const moderno = InformesReportingApi.safeParse(datos);
  if (moderno.success) {
    return moderno.data.flatMap((informe) =>
      informe.type === "csp-violation" && informe.body
        ? [
            evento({
              directiva: informe.body.effectiveDirective,
              bloqueado: informe.body.blockedURL,
              documento: informe.body.documentURL,
              disposicion: informe.body.disposition,
              fuente: informe.body.sourceFile,
              linea: informe.body.lineNumber,
              columna: informe.body.columnNumber,
            }),
          ]
        : [],
    );
  }
  return null;
}

/** Lee el cuerpo sin pasar de `max` bytes; `null` si es más grande. */
export async function leerCuerpoLimitado(request: Request, max: number): Promise<string | null> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!request.body) return "";
  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      return null;
    }
    partes.push(value);
  }
  const unido = new Uint8Array(total);
  let desplazamiento = 0;
  for (const parte of partes) {
    unido.set(parte, desplazamiento);
    desplazamiento += parte.byteLength;
  }
  return new TextDecoder().decode(unido);
}

type Dependencias = {
  limiter?: FixedWindowLimiter;
  registrar?: (evento: SecurityEvent) => void;
};

export function crearManejadorReportesCsp({
  limiter = createFixedWindowLimiter({ limite: 60, ventanaMs: 60_000 }),
  registrar = logSecurityEvent,
}: Dependencias = {}) {
  // A lo más un aviso de "límite excedido" por minuto, para no inundar el registro.
  const avisos = createFixedWindowLimiter({ limite: 1, ventanaMs: 60_000 });

  return async function POST(request: Request): Promise<Response> {
    const tipo = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TIPOS_ACEPTADOS.has(tipo)) return new Response(null, { status: 415 });

    if (!limiter.tryConsume()) {
      if (avisos.tryConsume()) registrar({ tipo: "limite_excedido", recurso: "csp-report" });
      return new Response(null, { status: 429 });
    }

    const texto = await leerCuerpoLimitado(request, MAX_BYTES_REPORTE);
    if (texto === null) return new Response(null, { status: 413 });

    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      return new Response(null, { status: 400 });
    }

    const eventos = normalizarReportes(datos);
    if (eventos === null) return new Response(null, { status: 400 });
    for (const e of eventos) registrar(e);
    return new Response(null, { status: 204 });
  };
}
