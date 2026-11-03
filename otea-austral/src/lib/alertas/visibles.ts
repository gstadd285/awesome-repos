import { vistasEjemplo } from "@/data/ejemplo";
import type { AlertView } from "@/lib/domain/view";
import { logSecurityEvent } from "@/lib/security/log";
import type { RepositorioAlertas } from "./repositorio";

/**
 * Qué alertas ve quien abre /alertas (acceso privado, `docs/alertas-reales.md` §6). Es el **único** lugar que pide al
 * repositorio lo publicado (`arquitectura.test.ts` lo vigila), y decide con la sesión de la cuenta:
 *
 *   · **Con sesión** (cuentas por invitación o abiertas): lo publicado **real** (`es_ejemplo = false`), nada de ejemplo.
 *   · **Sin sesión**: solo ejemplos rotulados. Los publicados de ejemplo de la base o, si no hay, los del sitio
 *     (`src/data/ejemplo.ts`). Ningún dato real: ni en el HTML ni en los metadatos (la página no los usa para su título).
 *
 * Cada lista se filtra otra vez aquí, además de en la consulta: un error en una de las dos no basta para mezclar.
 */
export type AlertasVisibles =
  | { acceso: "privado"; alertas: AlertView[]; error: boolean }
  | { acceso: "publico"; alertas: AlertView[]; origen: "base" | "sitio" };

export async function alertasVisibles(
  sesion: { cuentaId: string } | null,
  repo: Pick<RepositorioAlertas, "publicas"> | null,
): Promise<AlertasVisibles> {
  if (sesion) {
    if (!repo) return { acceso: "privado", alertas: [], error: false };
    try {
      const reales = await repo.publicas({ ejemplo: false });
      return { acceso: "privado", alertas: reales.filter((a) => !a.es_ejemplo), error: false };
    } catch {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "alertas_publicas" });
      return { acceso: "privado", alertas: [], error: true };
    }
  }

  let deLaBase: AlertView[] = [];
  if (repo) {
    try {
      deLaBase = (await repo.publicas({ ejemplo: true })).filter((a) => a.es_ejemplo);
    } catch {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "alertas_publicas" });
    }
  }
  if (deLaBase.length > 0) return { acceso: "publico", alertas: deLaBase, origen: "base" };
  return { acceso: "publico", alertas: vistasEjemplo.filter((a) => a.es_ejemplo), origen: "sitio" };
}
