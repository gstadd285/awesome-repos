import "server-only";
import { env } from "@/lib/env";
import { crearBaseDeDatos, type BaseDeDatos } from "./cliente";

const global = globalThis as typeof globalThis & { __oteaDb?: BaseDeDatos };

/** Pool único por proceso, o `null` si no hay `DATABASE_URL`. */
export function baseDeDatos(): BaseDeDatos | null {
  if (!env.DATABASE_URL) return null;
  global.__oteaDb ??= crearBaseDeDatos(env.DATABASE_URL);
  return global.__oteaDb;
}
