import semilla from "../../../data/sources.seed.json";
import { SourceSchema, type Source } from "@/lib/domain/schemas";

/**
 * Registro de fuentes (semilla en `data/sources.seed.json`). Se valida al
 * cargar: una entrada inválida rompe el build en vez de publicarse.
 * Las direcciones de feeds no se incluyen hasta verificarlas
 * (`docs/fuentes-pendientes.md`).
 */
export const REGISTRO_FUENTES: readonly Source[] = Object.freeze(
  semilla.map((fuente) => SourceSchema.parse(fuente)),
);

export function fuentesActivas(): Source[] {
  return REGISTRO_FUENTES.filter((f) => f.activa);
}

export type GrupoFuentes = { titulo: string; fuentes: Source[] };

const CHILE = new Set(["bcch", "cmf", "ine", "cochilco", "hacienda"]);
const EEUU = new Set(["fed", "bls", "sec-edgar", "tesoro-eeuu", "eia"]);

/** Agrupa las fuentes activas por ámbito, para mostrarlas en /fuentes. */
export function fuentesPorAmbito(): GrupoFuentes[] {
  const activas = fuentesActivas();
  return [
    { titulo: "Chile", fuentes: activas.filter((f) => CHILE.has(f.id)) },
    { titulo: "Estados Unidos", fuentes: activas.filter((f) => EEUU.has(f.id)) },
    { titulo: "Global", fuentes: activas.filter((f) => !CHILE.has(f.id) && !EEUU.has(f.id)) },
  ];
}
