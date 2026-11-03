import "server-only";
import { baseDeDatos } from "@/lib/db/instancia";
import { REGISTRO_FUENTES } from "@/lib/sources/registry";
import { crearColaEventos, type ColaEventos } from "./cola-postgres";

/** La cola de eventos candidatos sobre la base configurada, o `null` si no hay `DATABASE_URL` (el panel responde 404). */
export function colaEventos(): ColaEventos | null {
  const db = baseDeDatos();
  return db ? crearColaEventos(db, { fuentes: REGISTRO_FUENTES }) : null;
}
