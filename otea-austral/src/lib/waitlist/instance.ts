import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { crearRemitenteResend } from "./correo";
import { crearServicioLista } from "./service";
import { createMemoryWaitlistStore } from "./store";
import { crearStorePostgres } from "./store-postgres";

type Servicio = ReturnType<typeof crearServicioLista>;
const global = globalThis as typeof globalThis & { __oteaLista?: Servicio };

function crear(): Servicio {
  const db = baseDeDatos();
  if (env.WAITLIST_MODE === "abierta" && db && env.RESEND_API_KEY) {
    return crearServicioLista({
      modo: "abierta",
      store: crearStorePostgres(db),
      enviarConfirmacion: crearRemitenteResend({
        apiKey: env.RESEND_API_KEY,
        remitente: env.EMAIL_REMITENTE,
        urlSitio: env.NEXT_PUBLIC_SITE_URL,
      }),
    });
  }
  // `memoria`: no envía correos y muestra el enlace en la consola del
  // servidor (nunca el correo). `cerrada`: no guarda nada.
  return crearServicioLista({
    modo: env.WAITLIST_MODE === "memoria" ? "memoria" : "cerrada",
    store: createMemoryWaitlistStore(),
    enviarConfirmacion: async (_correo, token) => {
      console.info(`[lista de espera · modo de prueba] Confirmar: /lista-de-espera/confirmar?token=${token}`);
    },
    duracionMinimaMs: env.WAITLIST_MODE === "memoria" ? 0 : undefined,
  });
}

/** Servicio único por proceso, según `WAITLIST_MODE` (validado en `env.ts`). */
export function servicioLista(): Servicio {
  global.__oteaLista ??= crear();
  return global.__oteaLista;
}
