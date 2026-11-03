import { exigirSesionCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";

export const dynamic = "force-dynamic";

const SIN_GUARDAR = { "Cache-Control": "no-store" } as const;

/**
 * Descarga de los datos de la cuenta (JSON). Exige la sesión de la cookie (sin ella, al formulario de entrada) y rechaza lo
 * que el navegador marca como iniciado desde otro sitio: la respuesta no la puede leer otro origen, pero tampoco hay por
 * qué dejar que una página ajena dispare la descarga. Nunca se guarda en cachés.
 */
export async function GET(request: Request) {
  const origen = request.headers.get("sec-fetch-site");
  if (origen !== null && origen !== "same-origin" && origen !== "none") {
    return new Response(null, { status: 403, headers: SIN_GUARDAR });
  }
  const sesion = await exigirSesionCuenta();
  const datos = await servicioCuentas().exportar(sesion);
  if (!datos) return new Response(null, { status: 503, headers: { ...SIN_GUARDAR, "Retry-After": "30" } });
  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      ...SIN_GUARDAR,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="otea-austral-mis-datos.json"',
    },
  });
}
