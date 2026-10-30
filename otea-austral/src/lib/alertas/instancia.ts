import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { crearRepositorioAlertas, type RepositorioAlertas } from "./repositorio";

/** Repositorio sobre la base configurada, o `null` si no hay `DATABASE_URL`. */
export function repositorioAlertas(): RepositorioAlertas | null {
  const db = baseDeDatos();
  return db ? crearRepositorioAlertas(db) : null;
}
