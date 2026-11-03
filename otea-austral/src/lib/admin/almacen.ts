import type { Consultor } from "@/lib/db/cliente";

/**
 * Estado del panel que debe vivir en el servidor (migración 0002): qué
 * sesiones siguen vigentes y qué códigos TOTP ya se gastaron. Está en la base
 * y no en memoria para que valga en todas las instancias y sobreviva a los
 * reinicios: cerrar sesión revoca de verdad, y un código no se reutiliza.
 */
export type AlmacenSesiones = {
  /** Registra una sesión nueva que vence en `expira`. */
  crear(sid: string, expira: Date): Promise<void>;
  /** `true` si la sesión existe, no está revocada y no venció (según el reloj de la base). */
  vigente(sid: string): Promise<boolean>;
  /** Revoca la sesión; no hace nada si ya estaba revocada o no existe. */
  revocar(sid: string): Promise<void>;
  /** Gasta el paso TOTP: `true` la primera vez, `false` si ya se había usado. */
  gastarCodigo(paso: number): Promise<boolean>;
};

export function crearAlmacenSesiones(db: Consultor): AlmacenSesiones {
  return {
    async crear(sid, expira) {
      await db.consulta("insert into admin_sesiones (sid, expira) values ($1, $2)", [sid, expira.toISOString()]);
    },

    async vigente(sid) {
      const filas = await db.consulta(
        "select 1 from admin_sesiones where sid = $1 and revocada is null and expira > now()",
        [sid],
      );
      return filas.length === 1;
    },

    async revocar(sid) {
      await db.consulta("update admin_sesiones set revocada = now() where sid = $1 and revocada is null", [sid]);
    },

    async gastarCodigo(paso) {
      const filas = await db.consulta(
        "insert into admin_codigos_usados (paso) values ($1) on conflict do nothing returning 1",
        [paso],
      );
      return filas.length === 1;
    },
  };
}
