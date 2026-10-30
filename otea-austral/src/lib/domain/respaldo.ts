/**
 * Respaldo y confianza de una alerta (reglas 1, 2, 3 y 6 de `CLAUDE.md`): funciones puras **sin dependencias**.
 *
 * Viven aparte de `rules.ts` para que un componente de cliente (el simulador de /metodologia) calcule con las reglas
 * reales sin llevar Zod al navegador. Las uniones de tipos son locales y una prueba exige que coincidan con los enums
 * de `schemas.ts`; `rules.ts` reexporta estas mismas funciones (no copias).
 */

export type Confianza = "baja" | "media" | "alta";
export type NivelVerificacion = "sin_verificar" | "una_fuente" | "dos_fuentes" | "fuente_oficial";
export type TipoFuente = "primaria" | "secundaria" | "prensa";

/** Lo mínimo de una fuente que importa para calcular el respaldo. */
export type FuenteRespaldo = { tipo: TipoFuente; organismo: string };

const ORDEN_CONFIANZA: Record<Confianza, number> = { baja: 0, media: 1, alta: 2 };

/** "Banco Central de Chile " y "banco central de chile" son el mismo organismo. */
export function normalizarOrganismo(organismo: string): string {
  return organismo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function contarOrganismosDistintos(fuentes: readonly FuenteRespaldo[]): number {
  return new Set(fuentes.map((f) => normalizarOrganismo(f.organismo))).size;
}

/**
 * Regla 1: `alta` exige al menos una fuente primaria.
 * Regla 2: con solo prensa, el máximo es `media` (y requiere dos organismos).
 * Regla 6: es el único camino para obtener la confianza; no se edita a mano.
 */
export function calcularConfianza(fuentes: readonly FuenteRespaldo[]): Confianza {
  if (fuentes.length === 0) return "baja";
  if (fuentes.some((f) => f.tipo === "primaria")) return "alta";
  if (fuentes.some((f) => f.tipo === "secundaria")) return "media";
  // Solo prensa: sirve para detectar, no para confirmar.
  return contarOrganismosDistintos(fuentes) >= 2 ? "media" : "baja";
}

export function calcularNivelVerificacion(fuentes: readonly FuenteRespaldo[]): NivelVerificacion {
  if (fuentes.length === 0) return "sin_verificar";
  if (fuentes.some((f) => f.tipo === "primaria")) return "fuente_oficial";
  if (contarOrganismosDistintos(fuentes) >= 2) return "dos_fuentes";
  return "una_fuente";
}

/** La confianza de una fila nunca supera la que respaldan las fuentes. */
export function acotarConfianza(declarada: Confianza, maxima: Confianza): Confianza {
  return ORDEN_CONFIANZA[declarada] <= ORDEN_CONFIANZA[maxima] ? declarada : maxima;
}
