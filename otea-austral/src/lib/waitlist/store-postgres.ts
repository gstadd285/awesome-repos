import type { BaseDeDatos } from "@/lib/db/cliente";
import type { CifradorCorreo } from "./cifrado";
import type { WaitlistStore } from "./store";

/**
 * Lista de espera en Postgres (tabla `lista_espera`, migraciones 0001 y 0004). Cada operación es una sola
 * sentencia atómica y parametrizada.
 *
 * El correo nunca llega en claro a la base: se guarda cifrado (`correo_cifrado`) y la fila se identifica por
 * un índice ciego (`correo_indice`). La aplicación puede escribir ambos, pero el usuario de la base no tiene
 * permiso para leer `correo_cifrado`: un compromiso de la aplicación no permite volcar la lista. Los
 * correos solo los descifra el dueño, con `npm run lista:exportar`.
 */
export function crearStorePostgres(db: BaseDeDatos, cifrador: CifradorCorreo): WaitlistStore {
  return {
    async guardar(r, reenviarSiAnteriorA) {
      const { indice, cifrado } = cifrador.cifrar(r.correo);
      // Inserta; si el correo ya estaba sin confirmar y su enlace es viejo, lo renueva (con el texto cifrado
      // original, que no cambia). Al insertar, `creado` es el instante de ahora; al renovar conserva el
      // original, que siempre es anterior.
      const filas = await db.consulta<{ nuevo: boolean }>(
        `insert into lista_espera (correo_indice, correo_cifrado, token_hash, token_emitido, creado, version_consentimiento)
         values ($1, $2, $3, $4, $4, $5)
         on conflict (correo_indice) do update set
           token_hash = excluded.token_hash,
           token_emitido = excluded.token_emitido,
           version_consentimiento = excluded.version_consentimiento
         where lista_espera.confirmado is null and lista_espera.token_emitido < $6
         returning creado = $4::timestamptz as nuevo`,
        [indice, cifrado, r.tokenHash, r.ahora, r.versionConsentimiento, reenviarSiAnteriorA],
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
        "update lista_espera set token_emitido = 'epoch' where correo_indice = $1 and confirmado is null",
        [cifrador.indice(correo)],
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
