import type { BaseDeDatos } from "@/lib/db/cliente";
import type { WaitlistStore } from "./store";

/**
 * Lista de espera en Postgres (tabla `lista_espera`, migración 0001). Cada
 * operación es una sola sentencia atómica y parametrizada.
 */
export function crearStorePostgres(db: BaseDeDatos): WaitlistStore {
  return {
    async guardar(r, reenviarSiAnteriorA) {
      // Inserta; si el correo ya estaba sin confirmar y su enlace es viejo, lo
      // renueva. Al insertar, `creado` es el instante de ahora; al renovar
      // conserva el original, que siempre es anterior.
      const filas = await db.consulta<{ nuevo: boolean }>(
        `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento)
         values ($1, $2, $3, $3, $4)
         on conflict (correo) do update set
           token_hash = excluded.token_hash,
           token_emitido = excluded.token_emitido,
           version_consentimiento = excluded.version_consentimiento
         where lista_espera.confirmado is null and lista_espera.token_emitido < $5
         returning creado = $3::timestamptz as nuevo`,
        [r.correo, r.tokenHash, r.ahora, r.versionConsentimiento, reenviarSiAnteriorA],
      );
      if (filas.length === 0) return "existente";
      return filas[0].nuevo ? "nuevo" : "renovado";
    },

    async confirmar(tokenHash, ahora, vigenteDesde) {
      const filas = await db.consulta(
        `update lista_espera set confirmado = $2, token_hash = null
         where token_hash = $1 and confirmado is null and token_emitido >= $3
         returning 1`,
        [tokenHash, ahora, vigenteDesde],
      );
      return filas.length === 1;
    },

    async liberarReenvio(correo) {
      await db.consulta(
        "update lista_espera set token_emitido = 'epoch' where correo = $1 and confirmado is null",
        [correo],
      );
    },

    async purgarPendientes(antesDe) {
      const filas = await db.consulta(
        "delete from lista_espera where confirmado is null and token_emitido < $1 returning 1",
        [antesDe],
      );
      return filas.length;
    },

    async enviosDesde(desde) {
      const [fila] = await db.consulta<{ n: number }>(
        "select count(*)::int as n from lista_espera where token_emitido >= $1",
        [desde],
      );
      return fila.n;
    },
  };
}
