import "server-only";
import { randomBytes } from "node:crypto";
import { crearEnviadorResend, type EnviarCorreo } from "@/lib/correo/resend";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { crearMarcaDeTiempo, revisarMarcaDeTiempo } from "@/lib/waitlist/tiempo";
import { crearAlmacenMemoria } from "./almacen-memoria";
import { crearAlmacenPostgres } from "./almacen-postgres";
import { hashearClave, necesitaRehash, verificarClave, verificarContraSenuelo } from "./clave";
import { crearCifradorCuentas } from "./cifrado";
import { crearServicioCuentas, type ServicioCuentas } from "./servicio";

type Instancia = { servicio: ServicioCuentas; marca: () => string };
const global = globalThis as typeof globalThis & { __oteaCuentas?: Instancia };

/** Lo que se hace sin correo real (modo de prueba): el enlace queda en el registro del servidor, nunca el correo. */
const enviarAlRegistro: EnviarCorreo = async ({ asunto, texto }) => {
  const enlace = /https?:\/\/\S+/.exec(texto)?.[0] ?? "(sin enlace)";
  console.info(`[cuentas · modo de prueba] ${asunto}: ${enlace}`);
};

function crear(): Instancia {
  const db = baseDeDatos();
  // Con las cuentas abiertas el secreto es obligatorio (env.ts) y el mismo en todas las instancias. En memoria o
  // cerradas hay una sola instancia y basta una clave al azar.
  const cifrador = crearCifradorCuentas(env.CUENTAS_SECRETO ?? randomBytes(32).toString("base64url"));
  const marca = () => crearMarcaDeTiempo(cifrador.claveTiempo, Date.now());
  const marcaValida = (valor: unknown, ahora: Date) => revisarMarcaDeTiempo(cifrador.claveTiempo, valor, ahora.getTime()) === "ok";
  const clave = { hashear: hashearClave, verificar: verificarClave, necesitaRehash, senuelo: verificarContraSenuelo };

  if (env.CUENTAS_MODO === "abiertas" && db && env.RESEND_API_KEY && env.CUENTAS_SECRETO) {
    return {
      servicio: crearServicioCuentas({
        modo: "abiertas",
        almacen: crearAlmacenPostgres(db),
        cifrador,
        urlSitio: env.NEXT_PUBLIC_SITE_URL,
        enviar: crearEnviadorResend({ apiKey: env.RESEND_API_KEY, remitente: env.EMAIL_REMITENTE, url: env.RESEND_URL_API_PRUEBA }),
        clave,
        marcaValida,
        maximoEnviosDiarios: env.CUENTAS_ENVIOS_DIARIOS,
      }),
      marca,
    };
  }
  return {
    servicio: crearServicioCuentas({
      modo: env.CUENTAS_MODO === "memoria" ? "memoria" : "cerradas",
      almacen: crearAlmacenMemoria(),
      cifrador,
      urlSitio: env.NEXT_PUBLIC_SITE_URL,
      enviar: enviarAlRegistro,
      clave,
      marcaValida,
      duracionMinimaMs: env.CUENTAS_MODO === "memoria" ? 0 : undefined,
    }),
    marca,
  };
}

function instancia(): Instancia {
  global.__oteaCuentas ??= crear();
  return global.__oteaCuentas;
}

/** Servicio único por proceso, según `CUENTAS_MODO` (validado en `env.ts`). */
export function servicioCuentas(): ServicioCuentas {
  return instancia().servicio;
}

/** Marca de tiempo firmada para los formularios que envían correo (trampa contra bots, ver `waitlist/tiempo.ts`). */
export function marcaFormularioCuentas(): string {
  return instancia().marca();
}
