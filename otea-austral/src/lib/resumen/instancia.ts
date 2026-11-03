import "server-only";
import { crearEnviadorResend } from "@/lib/correo/resend";
import { crearCifradorCuentas } from "@/lib/cuentas/cifrado";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { crearTurnoPostgres } from "@/lib/ingesta/turno";
import { logSecurityEvent } from "@/lib/security/log";
import { crearAlmacenResumenPostgres } from "./almacen-postgres";
import { darDeBaja, type ResultadoBaja } from "./baja";
import { correrResumen, type ResumenDeLaCorrida } from "./servicio";

/**
 * El resumen diario con su configuración real. Solo lo llama `POST /api/tareas/resumen` después de `exigirTarea` y de
 * `resumenActivo()`, así que aquí la base, la clave de Resend y el secreto de las cuentas ya están comprobados.
 */
export async function ejecutarResumen(): Promise<ResumenDeLaCorrida> {
  const db = baseDeDatos();
  if (!db || !env.RESEND_API_KEY || !env.CUENTAS_SECRETO) throw new Error("El resumen necesita DATABASE_URL, RESEND_API_KEY y CUENTAS_SECRETO.");
  const cifrador = crearCifradorCuentas(env.CUENTAS_SECRETO);
  return correrResumen({
    almacen: crearAlmacenResumenPostgres(db),
    turno: crearTurnoPostgres(db, "resumen"),
    enviar: crearEnviadorResend({ apiKey: env.RESEND_API_KEY, remitente: env.EMAIL_REMITENTE, url: env.RESEND_URL_API_PRUEBA }),
    descifrarCorreo: (s) => {
      try {
        return cifrador.descifrarCorreo(s.correoCifrado, s.correoIndice);
      } catch {
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_descifrar" });
        return null;
      }
    },
    urlSitio: env.NEXT_PUBLIC_SITE_URL,
    topeDiario: env.RESUMEN_ENVIOS_DIARIOS,
  });
}

/** La baja de un clic sobre la base configurada; `null` si no hay base (la ruta responde 404). */
export function bajaResumen(): ((token: unknown) => Promise<ResultadoBaja>) | null {
  const db = baseDeDatos();
  if (!db) return null;
  const almacen = crearAlmacenResumenPostgres(db);
  return (token) => darDeBaja(token, almacen);
}
