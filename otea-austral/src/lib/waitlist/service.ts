import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import { SolicitudListaSchema, TokenConfirmacion, VERSION_CONSENTIMIENTO } from "./schema";
import type { WaitlistStore } from "./store";

export type ModoLista = "cerrada" | "memoria";

export type ResultadoLista =
  | { estado: "ok"; prueba: boolean }
  | { estado: "cerrada" }
  | { estado: "invalida"; errores: { correo?: string; acepta?: string } }
  | { estado: "limite" };

export type EntradaLista = {
  correo: unknown;
  acepta: unknown;
  /** Campo trampa: las personas lo dejan vacío; los bots suelen llenarlo. */
  sitio_web: unknown;
};

type Dependencias = {
  modo: ModoLista;
  store: WaitlistStore;
  /** Envía el enlace de confirmación (doble opt-in). */
  enviarConfirmacion: (correo: string, token: string) => Promise<void>;
  limiterPorCliente?: FixedWindowLimiter;
  limiterGlobal?: FixedWindowLimiter;
  generarToken?: () => string;
  ahora?: () => Date;
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
}: Dependencias) {
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

      if (typeof entrada.sitio_web === "string" && entrada.sitio_web.trim() !== "") {
        return { estado: "ok", prueba: modo === "memoria" };
      }

      if (modo === "cerrada") return { estado: "cerrada" };

      const token = generarToken();
      const resultado = await store.guardar({
        correo: validada.data.correo,
        tokenHash: await sha256Hex(token),
        creado: ahora().toISOString(),
        versionConsentimiento: VERSION_CONSENTIMIENTO,
      });
      if (resultado === "nuevo") await enviarConfirmacion(validada.data.correo, token);
      return { estado: "ok", prueba: modo === "memoria" };
    },

    async confirmar(token: unknown): Promise<boolean> {
      const t = TokenConfirmacion.safeParse(token);
      if (!t.success) return false;
      return store.confirmar(await sha256Hex(t.data));
    },
  };
}
