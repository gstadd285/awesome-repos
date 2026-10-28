import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { env } from "@/lib/env";
import { REGISTRO_FUENTES } from "@/lib/sources/registry";
import { crearAlmacenIngestaPostgres } from "./almacen-postgres";
import { agenteIngesta, crearDescargador } from "./descarga";
import { agruparPendientes } from "./eventos-postgres";
import { correrIngesta, type DependenciasIngesta, type ResumenCorrida } from "./servicio";
import { crearTurnoPostgres } from "./turno";

/**
 * La ingesta con su configuración real: el registro de fuentes validado, la base y la identidad declarada; al final de
 * cada corrida, la agrupación en eventos candidatos (sin red ni IA) y, solo si la ruta la entrega (borradores con IA
 * activos), la redacción. Solo la llama `POST /api/tareas/ingesta` después de `exigirTarea`, así que aquí
 * `TAREAS_MODO=activo` ya está comprobado.
 */
export async function ejecutarIngesta(redactar?: DependenciasIngesta["redactar"]): Promise<ResumenCorrida> {
  const db = baseDeDatos();
  if (!db || !env.INGESTA_CONTACTO) throw new Error("La ingesta necesita DATABASE_URL e INGESTA_CONTACTO.");
  return correrIngesta({
    fuentes: REGISTRO_FUENTES,
    almacen: crearAlmacenIngestaPostgres(db),
    turno: crearTurnoPostgres(db, "ingesta"),
    descargar: crearDescargador({
      agente: agenteIngesta(env.NEXT_PUBLIC_SITE_URL, env.INGESTA_CONTACTO),
      origenPrueba: env.OTEA_E2E === "1" ? env.INGESTA_URL_PRUEBA : undefined,
    }),
    agrupar: (ahora) => agruparPendientes(db, { fuentes: REGISTRO_FUENTES, ahora }),
    ...(redactar ? { redactar } : {}),
  });
}
