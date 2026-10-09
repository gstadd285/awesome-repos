import "server-only";
import { env } from "@/lib/env";
import { crearServicioLista } from "./service";
import { createMemoryWaitlistStore } from "./store";

type Servicio = ReturnType<typeof crearServicioLista>;
const global = globalThis as typeof globalThis & { __oteaLista?: Servicio };

/**
 * Servicio único por proceso. Con `WAITLIST_MODE=cerrada` (por defecto) no
 * guarda nada; `memoria` es solo para desarrollo y pruebas: no envía
 * correos y muestra el enlace de confirmación en la consola del servidor
 * (nunca el correo). La base de datos y el proveedor de correo llegan en el
 * tercio 3.
 */
export function servicioLista(): Servicio {
  global.__oteaLista ??= crearServicioLista({
    modo: env.WAITLIST_MODE,
    store: createMemoryWaitlistStore(),
    enviarConfirmacion: async (_correo, token) => {
      console.info(`[lista de espera · modo de prueba] Confirmar: /lista-de-espera/confirmar?token=${token}`);
    },
  });
  return global.__oteaLista;
}
