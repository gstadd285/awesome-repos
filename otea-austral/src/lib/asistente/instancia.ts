import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { logSecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter } from "@/lib/security/rate-limit";
import { crearManejadorAsistente } from "./manejador";
import { crearPresupuestoMemoria, dolaresAMicros } from "./presupuesto";
import { crearPresupuestoPostgres } from "./presupuesto-postgres";
import { crearProveedorAnthropic } from "./proveedor-anthropic";
import { responder, type ConfiguracionIa, type Registro } from "./servicio";

type Manejador = (request: Request) => Promise<Response>;
const global = globalThis as typeof globalThis & { __oteaAsistente?: Manejador };

const DIA_MS = 24 * 60 * 60_000;

/** Solo lo que no es rutina: las respuestas de la base no se anotan. */
function registrar(registro: Registro): void {
  if (registro.resultado === "base") return;
  logSecurityEvent({
    tipo: "asistente",
    resultado: registro.resultado,
    ...(registro.motivo ? { motivo: registro.motivo } : {}),
  });
}

/** La IA solo existe si la persona responsable la activó con todo lo que exige `env.ts`; si no, `undefined`. */
function configuracionIa(): ConfiguracionIa | undefined {
  const { ASISTENTE_MODO: modo, ANTHROPIC_API_KEY: apiKey, ASISTENTE_MODELO: modelo } = env;
  const { ASISTENTE_PRECIO_ENTRADA: entrada, ASISTENTE_PRECIO_SALIDA: salida, ASISTENTE_TOPE_DIARIO_USD: tope } = env;
  const total = env.IA_TOPE_TOTAL_USD;
  if (modo !== "ia" || !apiKey || !modelo || entrada === undefined || salida === undefined || tope === undefined) {
    return undefined;
  }
  const topes = { micros: dolaresAMicros(tope), llamadas: env.ASISTENTE_LLAMADAS_DIARIAS };
  // En producción la base es obligatoria (`env.ts`); sin ella (desarrollo y pruebas) el tope vale por proceso.
  const db = baseDeDatos();
  const cupo = createFixedWindowLimiter({ limite: env.ASISTENTE_IA_POR_PERSONA_DIA, ventanaMs: DIA_MS });
  return {
    proveedor: crearProveedorAnthropic({ apiKey, modelo, baseURL: env.ASISTENTE_URL_API_PRUEBA }),
    // El tope acumulado de toda la IA (opcional) solo se puede contar en la base: sin ella no hay IA con ese tope.
    presupuesto: db
      ? crearPresupuestoPostgres(db, topes, { totalMicros: total === undefined ? undefined : dolaresAMicros(total) })
      : total === undefined
        ? crearPresupuestoMemoria(topes)
        : { reservar: async () => false, ajustar: async () => undefined },
    precios: { entrada, salida },
    cupoPersona: (clave) => cupo.tryConsume(clave),
  };
}

/** El endpoint del asistente, único por proceso. */
export function manejadorAsistente(): Manejador {
  if (!global.__oteaAsistente) {
    // Una sola vez: el cupo por persona y el presupuesto en memoria deben sobrevivir entre preguntas.
    const ia = configuracionIa();
    global.__oteaAsistente = crearManejadorAsistente({
      responder: (consulta, senal) => responder(consulta, { ia, registrar }, senal),
      proxiesConfiables: env.IP_PROXIES_CONFIABLES,
    });
  }
  return global.__oteaAsistente;
}
