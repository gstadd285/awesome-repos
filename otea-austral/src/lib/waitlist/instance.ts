import "server-only";
import { randomBytes } from "node:crypto";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { derivarClave } from "./claves";
import { crearRemitenteResend } from "./correo";
import { crearServicioLista } from "./service";
import { createMemoryWaitlistStore } from "./store";
import { crearStorePostgres } from "./store-postgres";
import { crearMarcaDeTiempo, revisarMarcaDeTiempo } from "./tiempo";

type Servicio = ReturnType<typeof crearServicioLista>;
type Instancia = { servicio: Servicio; marca: () => string };
const global = globalThis as typeof globalThis & { __oteaLista?: Instancia };

function crear(): Instancia {
  const db = baseDeDatos();
  // La lista abierta exige WAITLIST_SECRETO (env.ts): es el mismo en todas las instancias, así una marca que
  // generó una la acepta otra. En memoria o cerrada hay una sola instancia y basta una clave al azar.
  const claveTiempo = derivarClave(env.WAITLIST_SECRETO ?? randomBytes(32).toString("base64url"), "tiempo");
  const marca = () => crearMarcaDeTiempo(claveTiempo, Date.now());
  const marcaValida = (valor: unknown, ahora: Date) =>
    revisarMarcaDeTiempo(claveTiempo, valor, ahora.getTime()) === "ok";

  if (env.WAITLIST_MODE === "abierta" && db && env.RESEND_API_KEY) {
    const servicio = crearServicioLista({
      modo: "abierta",
      store: crearStorePostgres(db),
      marcaValida,
      maximoEnviosDiarios: env.WAITLIST_ENVIOS_DIARIOS,
      enviarConfirmacion: crearRemitenteResend({
        apiKey: env.RESEND_API_KEY,
        remitente: env.EMAIL_REMITENTE,
        urlSitio: env.NEXT_PUBLIC_SITE_URL,
      }),
    });
    return { servicio, marca };
  }
  // `memoria`: no envía correos y muestra el enlace en la consola del
  // servidor (nunca el correo). `cerrada`: no guarda nada.
  const servicio = crearServicioLista({
    modo: env.WAITLIST_MODE === "memoria" ? "memoria" : "cerrada",
    store: createMemoryWaitlistStore(),
    marcaValida,
    enviarConfirmacion: async (_correo, token) => {
      console.info(`[lista de espera · modo de prueba] Confirmar: /lista-de-espera/confirmar?token=${token}`);
    },
    duracionMinimaMs: env.WAITLIST_MODE === "memoria" ? 0 : undefined,
  });
  return { servicio, marca };
}

function instancia(): Instancia {
  global.__oteaLista ??= crear();
  return global.__oteaLista;
}

/** Servicio único por proceso, según `WAITLIST_MODE` (validado en `env.ts`). */
export function servicioLista(): Servicio {
  return instancia().servicio;
}

/** Marca de tiempo firmada para el formulario que se está generando (trampa contra bots, ver `tiempo.ts`). */
export function marcaFormulario(): string {
  return instancia().marca();
}
