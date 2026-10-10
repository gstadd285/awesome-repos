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
  | { estado: "reintentar" }
  /** Se alcanzó el tope diario de correos de confirmación: volver a intentar otro día. */
  | { estado: "saturada" }
  /** La marca de tiempo del formulario falta, venció o se envió demasiado rápido: esperar y reenviar. */
  | { estado: "espera" };

export type ResultadoConfirmacion = "confirmada" | "invalida" | "limite";

export type EntradaLista = {
  correo: unknown;
  acepta: unknown;
  /** Campo trampa: las personas lo dejan vacío; los bots suelen llenarlo. */
  sitio_web: unknown;
  /** Marca de tiempo firmada que puso el servidor al generar el formulario (ver `tiempo.ts`). */
  tiempo?: unknown;
};

/** Un enlace de confirmación vale 72 horas. */
export const VIGENCIA_ENLACE_MS = 72 * 60 * 60_000;
/** Si no llegó el correo, se puede pedir otro enlace después de 10 minutos. */
export const ESPERA_REENVIO_MS = 10 * 60_000;
/**
 * Tope de enlaces de confirmación por día. Protege la cuota del proveedor de
 * correo (Resend gratuito: 100 al día) y el buzón de terceros de quien use el
 * formulario para enviar correo no pedido. Se cuenta en la base, así que vale
 * para todas las instancias y sobrevive a los reinicios.
 */
export const MAXIMO_ENVIOS_DIARIOS = 80;
const DIA_MS = 24 * 60 * 60_000;
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
  /** Límite de intentos de confirmación por cliente (frena a quien prueba tokens o satura la base). */
  limiterConfirmar?: FixedWindowLimiter;
  /**
   * Trampa de tiempo: `true` si la marca del formulario es válida y no llegó demasiado rápido. Sin esta
   * función no se exige marca (pruebas y modo cerrado).
   */
  marcaValida?: (marca: unknown, ahora: Date) => boolean;
  generarToken?: () => string;
  /** Tope diario de correos de confirmación (por defecto {@link MAXIMO_ENVIOS_DIARIOS}). */
  maximoEnviosDiarios?: number;
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
  limiterConfirmar = createFixedWindowLimiter({ limite: 20, ventanaMs: 10 * 60_000 }),
  marcaValida,
  generarToken = generarTokenSeguro,
  maximoEnviosDiarios = MAXIMO_ENVIOS_DIARIOS,
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
        if (marcaValida && !marcaValida(entrada.tiempo, instante)) {
          logSecurityEvent({ tipo: "limite_excedido", recurso: "lista_marca_de_tiempo" });
          return { estado: "espera" };
        }
        const correo = validada.data.correo;
        const token = generarToken();
        let resultado: "nuevo" | "renovado" | "existente";
        try {
          // Con el tope alcanzado no se guarda ni se envía nada, ni siquiera a un correo ya inscrito:
          // así la respuesta no distingue si el correo estaba y el servicio nunca excede la cuota.
          if ((await store.enviosDesde(antesDe(instante, DIA_MS))) >= maximoEnviosDiarios) {
            logSecurityEvent({ tipo: "limite_excedido", recurso: "lista_envios_diarios" });
            return { estado: "saturada" };
          }
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

    async confirmar(token: unknown, claveCliente = "global"): Promise<ResultadoConfirmacion> {
      if (!limiterConfirmar.tryConsume(claveCliente)) {
        logSecurityEvent({ tipo: "limite_excedido", recurso: "lista_confirmar" });
        return "limite";
      }
      const t = TokenConfirmacion.safeParse(token);
      if (!t.success) return "invalida";
      const instante = ahora();
      const confirmada = await store.confirmar(
        await sha256Hex(t.data),
        instante.toISOString(),
        antesDe(instante, VIGENCIA_ENLACE_MS),
      );
      return confirmada ? "confirmada" : "invalida";
    },
  };
}
