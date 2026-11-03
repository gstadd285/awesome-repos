import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { borradoresActivos, env } from "@/lib/env";
import { dolaresAMicros } from "@/lib/ia/gasto";
import { agenteIngesta, crearDescargador } from "@/lib/ingesta/descarga";
import { REGISTRO_FUENTES } from "@/lib/sources/registry";
import { crearAlmacenBorradoresPostgres } from "./almacen-postgres";
import { crearPresupuestoBorradoresPostgres } from "./presupuesto-postgres";
import { crearProveedorBorrador } from "./proveedor-borrador";
import { redactarBorradores, type ResumenRedaccion } from "./servicio";

export type Redactor = (opciones: { senal?: AbortSignal; plazo?: number }) => Promise<ResumenRedaccion>;

/**
 * La redacción con su configuración real, o `null` si los borradores con IA no están activos (lo normal: apagados por
 * omisión). Solo existe en `otea-tareas` (`BORRADORES_MODO=ia` exige `TAREAS_MODO=activo`) y solo la llama la corrida de
 * `POST /api/tareas/ingesta`, con el turno tomado. El gasto se cuenta en la base; sin ella, no hay redacción.
 */
export function redactorBorradores(): Redactor | null {
  const db = baseDeDatos();
  if (!borradoresActivos(env) || !db || !env.INGESTA_CONTACTO) return null;
  const {
    BORRADORES_ANTHROPIC_API_KEY: apiKey,
    BORRADORES_MODELO: modelo,
    BORRADORES_PRECIO_ENTRADA: entrada,
    BORRADORES_PRECIO_SALIDA: salida,
    BORRADORES_TOPE_MENSUAL_USD: tope,
  } = env;
  if (!apiKey || !modelo || entrada === undefined || salida === undefined || tope === undefined) return null;

  const proveedor = crearProveedorBorrador({
    apiKey,
    modelo,
    baseURL: env.OTEA_E2E === "1" ? env.BORRADORES_URL_API_PRUEBA : undefined,
  });
  const presupuesto = crearPresupuestoBorradoresPostgres(db, {
    micros: dolaresAMicros(tope),
    llamadas: env.BORRADORES_LLAMADAS_MES,
    totalMicros: env.IA_TOPE_TOTAL_USD === undefined ? undefined : dolaresAMicros(env.IA_TOPE_TOTAL_USD),
  });
  // La misma salida a internet que la ingesta (`descarga.ts`): registro, dominio de la fuente, tiempo y tamaño.
  const descargar = crearDescargador({
    agente: agenteIngesta(env.NEXT_PUBLIC_SITE_URL, env.INGESTA_CONTACTO),
    origenPrueba: env.OTEA_E2E === "1" ? env.INGESTA_URL_PRUEBA : undefined,
  });

  return (opciones) =>
    redactarBorradores(
      {
        fuentes: REGISTRO_FUENTES,
        almacen: crearAlmacenBorradoresPostgres(db),
        descargar,
        proveedor,
        presupuesto,
        precios: { entrada, salida },
        modelo,
        porCorrida: env.BORRADORES_POR_CORRIDA,
      },
      opciones,
    );
}
