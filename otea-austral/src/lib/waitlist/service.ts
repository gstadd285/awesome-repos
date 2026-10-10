import { logSecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import { SolicitudListaSchema, TokenConfirmacion, VERSION_CONSENTIMIENTO } from "./schema";
import type { WaitlistStore } from "./store";

/**
 * `cerrada`: no guarda correos. `memoria`: desarrollo y pruebas, sin correo
 * real. `abierta`: Postgres y envío del enlace de confirmación.
 */
export type ModoLista = "cerrada" | "memoria" | "abierta";

export type ResultadoLista =
  | { estado: "ok"; prueba: boolean }
  | { estado: "cerrada" }
  | { estado: "invalida"; errores: { correo?: string; acepta?: string } }
  | { estado: "limite" }
  /** No se pudo guardar o enviar el correo: se puede intentar de nuevo enseguida. */
  | { estado: "reintentar" };

export type EntradaLista = {
  correo: unknown;
  acepta: unknown;
  /** Campo trampa: las personas lo dejan vacío; los bots suelen llenarlo. */
  sitio_web: unknown;
};

/** Un enlace de confirmación vale 72 horas. */
export const VIGENCIA_ENLACE_MS = 72 * 60 * 60_000;
/** Si no llegó el correo, se puede pedir otro enlace después de 10 minutos. */
export const ESPERA_REENVIO_MS = 10 * 60_000;
/** Las inscripciones sin confirmar se borran a los 30 días. */
export const PLAZO_PENDIENTES_MS = 30 * 24 * 60 * 60_000;
const INTERVALO_PURGA_MS = 60 * 60_000;

type Dependencias = {
  modo: ModoLista;
  store: WaitlistStore;
  /** Envía el enlace de confirmación (doble opt-in). Lanza si no pudo. */
  enviarConfirmacion: (correo: string, token: string) => Promise<void>;
  limiterPorCliente?: FixedWindowLimiter;
  limiterGlobal?: FixedWindowLimiter;
  generarToken?: () => string;
  ahora?: () => Date;
  /**
   * Toda respuesta que pasa por el almacenamiento tarda al menos esto, para
   * que el tiempo no delate si el correo ya estaba inscrito.
   */
  duracionMinimaMs?: number;
};

export function generarTokenSeguro(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const antesDe = (fecha: Date, ms: number) => new Date(fecha.getTime() - ms).toISOString();

/**
 * Inscripción con doble opt-in. Responde lo mismo si el correo es nuevo,
 * si ya estaba o si el envío parece de un bot, para no revelar quién está
 * inscrito ni enseñarle al bot que fue detectado.
 */
export function crearServicioLista({
  modo,
  store,
  enviarConfirmacion,
  limiterPorCliente = createFixedWindowLimiter({ limite: 5, ventanaMs: 10 * 60_000 }),
  limiterGlobal = createFixedWindowLimiter({ limite: 300, ventanaMs: 10 * 60_000 }),
  generarToken = generarTokenSeguro,
  ahora = () => new Date(),
  duracionMinimaMs = 1200,
}: Dependencias) {
  const ok: ResultadoLista = { estado: "ok", prueba: modo === "memoria" };
  let ultimaPurga = 0;

  async function conDuracionMinima(fn: () => Promise<ResultadoLista>): Promise<ResultadoLista> {
    const inicio = performance.now();
    try {
      return await fn();
    } finally {
      const resto = duracionMinimaMs - (performance.now() - inicio);
      if (resto > 0) await new Promise((r) => setTimeout(r, resto));
    }
  }

  /** Borra pendientes vencidos como mucho una vez por hora; si falla, ya habrá otra ocasión. */
  async function purgar(instante: Date) {
    if (instante.getTime() - ultimaPurga < INTERVALO_PURGA_MS) return;
    ultimaPurga = instante.getTime();
    await store.purgarPendientes(antesDe(instante, PLAZO_PENDIENTES_MS)).catch(() => {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "purga" });
    });
  }

  return {
    async registrar(entrada: EntradaLista, claveCliente: string): Promise<ResultadoLista> {
      if (!limiterPorCliente.tryConsume(claveCliente) || !limiterGlobal.tryConsume()) {
        return { estado: "limite" };
      }

      const validada = SolicitudListaSchema.safeParse({ correo: entrada.correo, acepta: entrada.acepta });
      if (!validada.success) {
        const errores: { correo?: string; acepta?: string } = {};
        for (const issue of validada.error.issues) {
          const campo = issue.path[0];
          if ((campo === "correo" || campo === "acepta") && !errores[campo]) errores[campo] = issue.message;
        }
        return { estado: "invalida", errores };
      }

      const trampa = typeof entrada.sitio_web === "string" && entrada.sitio_web.trim() !== "";
      if (modo === "cerrada" && !trampa) return { estado: "cerrada" };

      return conDuracionMinima(async () => {
        if (trampa) return ok;
        const instante = ahora();
        const correo = validada.data.correo;
        const token = generarToken();
        let resultado: "nuevo" | "renovado" | "existente";
        try {
          resultado = await store.guardar(
            {
              correo,
              tokenHash: await sha256Hex(token),
              ahora: instante.toISOString(),
              versionConsentimiento: VERSION_CONSENTIMIENTO,
            },
            antesDe(instante, ESPERA_REENVIO_MS),
          );
        } catch {
          logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "lista_guardar" });
          return { estado: "reintentar" };
        }

        if (resultado !== "existente") {
          try {
            await enviarConfirmacion(correo, token);
          } catch {
            // El remitente ya registró la falla (sin datos personales).
            await store.liberarReenvio(correo).catch(() => {});
            return { estado: "reintentar" };
          }
        }
        await purgar(instante);
        return ok;
      });
    },

    async confirmar(token: unknown): Promise<boolean> {
      const t = TokenConfirmacion.safeParse(token);
      if (!t.success) return false;
      const instante = ahora();
      return store.confirmar(await sha256Hex(t.data), instante.toISOString(), antesDe(instante, VIGENCIA_ENLACE_MS));
    },
  };
}
