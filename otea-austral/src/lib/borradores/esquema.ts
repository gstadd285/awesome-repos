import { z } from "zod";

/**
 * Lo que el modelo puede escribir en un borrador (`docs/alertas-reales.md` §4.2) y las listas cerradas de la tabla
 * `borradores` (migración 0010). Sin red, sin base y sin el SDK: lo comparten el proveedor, la revisión y el panel.
 *
 * El modelo **no** fija confianza, tema, fuentes, enlaces ni estado: el esquema es estricto (un campo de más se rechaza) y
 * esos datos los pone el código al aceptar el borrador.
 */

const texto = (max: number) => z.string().trim().min(1).max(max);

export const FilaModeloSchema = z.strictObject({
  sector: texto(80),
  direccion: z.enum(["gana", "condicionado", "pierde"]),
  condicion: texto(240),
});

export const BorradorModeloSchema = z.strictObject({
  evento: texto(160),
  resumen: texto(600),
  filas: z.array(FilaModeloSchema).min(1).max(6),
  /** Nunca `alto`: solo la dueña lo decide, y `rules.ts` exige dos organismos y una aprobación. */
  impacto_sugerido: z.enum(["bajo", "medio"]),
  /** Lo que la dueña debería comprobar en las fuentes antes de aceptar. */
  dudas: z.array(texto(200)).max(3),
});
export type BorradorModelo = z.infer<typeof BorradorModeloSchema>;

/**
 * Modelos con los que se probó la redacción (`docs/alertas-reales.md` §4.1): el único que cabe en el tope mensual con
 * margen. Lista cerrada a propósito; la usa `env.ts` y la repite la restricción de la base.
 */
export const MODELOS_BORRADOR = ["claude-haiku-5-5"] as const;
export type ModeloBorrador = (typeof MODELOS_BORRADOR)[number];

/**
 * Banderas de un borrador o de un intento:
 * - `lectura_parcial`: un documento se cortó en los 12.000 caracteres.
 * - `lectura_manual`: algún documento no se pudo leer solo (PDF, otro tipo, error, `robots.txt`): la dueña debe leerlo.
 * - `sin_condicion`: alguna condición no tiene un marcador condicional («si», «podría»…).
 * - `fuentes_sin_lectura`: el evento tiene fuentes sin `lectura_ia`, que el modelo no vio.
 * - `reintento`: hizo falta el único reintento.
 * - `posible_inyeccion` (solo intentos): el texto traía marcas de inyección; no se llamó al modelo.
 */
export const BANDERAS = [
  "lectura_parcial",
  "lectura_manual",
  "sin_condicion",
  "fuentes_sin_lectura",
  "reintento",
  "posible_inyeccion",
] as const;
export type Bandera = (typeof BANDERAS)[number];

export const MOTIVOS_DESCARTE = ["irrelevante", "duplicado", "impreciso", "copia", "otro"] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

export const RESULTADOS_INTENTO = ["borrador", "lectura_manual", "rechazo", "revision", "error"] as const;
export type ResultadoIntento = (typeof RESULTADOS_INTENTO)[number];

/** Un intento que no se repite: la IA ya dejó su borrador o no pudo con este evento (queda para la cola manual). */
export const INTENTOS_FINALES: readonly ResultadoIntento[] = ["borrador", "lectura_manual", "rechazo", "revision"];
/** Fallos del servicio (red, tiempo, límite de tasa): se reintenta en otra corrida, hasta este número de veces. */
export const MAX_INTENTOS_CON_ERROR = 3;

/** Tamaño máximo del contenido guardado (la base lo vuelve a comprobar). */
export const MAX_BYTES_CONTENIDO = 8 * 1024;

/** Contenido de una alerta a partir de un borrador: tema del evento y, en cada fila, la confianza calculada de las fuentes. */
export function aContenidoAlerta<T extends string, C extends string>(
  borrador: BorradorModelo,
  tema: T,
  confianza: C,
): {
  tema: T;
  evento: string;
  resumen: string;
  impacto: BorradorModelo["impacto_sugerido"];
  filas: { sector: string; direccion: BorradorModelo["filas"][number]["direccion"]; condicion: string; confianza: C }[];
} {
  return {
    tema,
    evento: borrador.evento,
    resumen: borrador.resumen,
    impacto: borrador.impacto_sugerido,
    filas: borrador.filas.map((f) => ({ sector: f.sector, direccion: f.direccion, condicion: f.condicion, confianza })),
  };
}
