import { env } from "@/lib/env";
import { bajaResumen } from "@/lib/resumen/instancia";
import { crearManejadorBaja } from "@/lib/resumen/manejador-baja";

/**
 * Baja de un clic del resumen diario (`docs/alertas-reales.md` §7): `POST /api/resumen/baja?t=…`, con el token de un solo
 * uso que trae cada correo. `GET` solo lleva a la página que pide confirmar. Puertas en `src/lib/resumen/manejador-baja.ts`.
 * Sin base de datos responde 404.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Se arma con la primera solicitud (no al importar): así el build no abre la base y los límites duran lo que el proceso.
let manejador: ReturnType<typeof crearManejadorBaja> | undefined;
const manejar = (request: Request) =>
  (manejador ??= crearManejadorBaja({ darDeBaja: bajaResumen(), proxiesConfiables: env.IP_PROXIES_CONFIABLES }))(request);

export const GET = manejar;
export const HEAD = manejar;
export const POST = manejar;
