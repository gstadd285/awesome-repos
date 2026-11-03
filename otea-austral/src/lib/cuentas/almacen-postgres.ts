import { codigoError, type BaseDeDatos, type Consultor } from "@/lib/db/cliente";
import type {
  AlmacenCuentas,
  AuditoriaInvitacion,
  CuentaGuardada,
  EventoGuardado,
  SesionLeida,
  SesionListada,
  SesionNueva,
  TipoEvento,
} from "./almacen";
import { MAX_SESIONES_POR_CUENTA, PLAZO_ALTAS_SIN_CONFIRMAR_MS, RETENCION_EVENTOS_MS, SESION_INACTIVA_MS } from "./constantes";

/**
 * Cuentas en Postgres (migración 0006). Cada operación es una sola sentencia parametrizada o una transacción corta. Las
 * fechas las decide quien llama (`ahora`), no el reloj de la base: así las pruebas controlan el tiempo y todas las
 * instancias aplican la misma regla. El texto SQL no lleva datos: todo va en `$1`, `$2`…
 */
const VIOLACION_UNICA = "23505";

/** Para deshacer la transacción del alta cuando la invitación ya no vale (ver `activarAlta`). */
class InvitacionNoVale extends Error {}

type FilaInvitacion = {
  id: string;
  alias: string;
  emitida: Date;
  vence: Date;
  envios: number;
  usada: Date | null;
  revocada: Date | null;
};

type FilaCuenta = {
  id: string;
  correo_indice: string;
  correo_cifrado: string;
  nombre: string | null;
  clave_hash: string;
  clave_cambiada: Date;
  fallos: number;
  fallos_desde: Date | null;
  totp_secreto_cifrado: string | null;
  totp_pendiente_cifrado: string | null;
  totp_activado: Date | null;
  totp_ultimo_paso: string | null;
  version_textos: string;
  aceptado: Date;
  temas: string[];
  resumen_previo: boolean;
  resumen_alta: Date | null;
  creada: Date;
};

const iso = (d: Date) => d.toISOString();

function aCuenta(f: FilaCuenta): CuentaGuardada {
  return {
    id: f.id,
    correoIndice: f.correo_indice,
    correoCifrado: f.correo_cifrado,
    nombre: f.nombre,
    claveHash: f.clave_hash,
    claveCambiada: iso(f.clave_cambiada),
    fallos: f.fallos,
    fallosDesde: f.fallos_desde ? iso(f.fallos_desde) : null,
    totpSecretoCifrado: f.totp_secreto_cifrado,
    totpPendienteCifrado: f.totp_pendiente_cifrado,
    totpActivado: f.totp_activado ? iso(f.totp_activado) : null,
    // `bigint` llega como texto: los pasos de 30 s caben de sobra en un número.
    totpUltimoPaso: f.totp_ultimo_paso === null ? null : Number(f.totp_ultimo_paso),
    versionTextos: f.version_textos,
    aceptado: iso(f.aceptado),
    temas: f.temas,
    resumenPrevio: f.resumen_previo,
    resumenDesde: f.resumen_alta ? iso(f.resumen_alta) : null,
    creada: iso(f.creada),
  };
}

const SQL_COLUMNAS_CUENTA = `id, correo_indice, correo_cifrado, nombre, clave_hash, clave_cambiada, fallos, fallos_desde,
  totp_secreto_cifrado, totp_pendiente_cifrado, totp_activado, totp_ultimo_paso, version_textos, aceptado, temas,
  resumen_previo, resumen_alta, creada`;

const antes = (iso_: string, ms: number) => new Date(Date.parse(iso_) - ms).toISOString();

async function evento(tx: Consultor, cuentaId: string, tipo: TipoEvento, fecha: string) {
  await tx.consulta("insert into cuenta_eventos (cuenta_id, tipo, fecha) values ($1, $2, $3::timestamptz)", [cuentaId, tipo, fecha]);
}

/** Abre una sesión dentro de una transacción; si ya hay `maximo` activas, cierra las más antiguas. */
async function abrirSesion(
  tx: Consultor,
  cuentaId: string,
  s: Pick<SesionNueva, "tokenHash" | "fase" | "ahora" | "expira" | "dispositivo">,
  maximo: number,
): Promise<{ id: string }> {
  if (s.fase === "activa") {
    await tx.consulta(
      `update cuenta_sesiones set revocada = $2::timestamptz
        where token_hash in (
          select token_hash from cuenta_sesiones
           where cuenta_id = $1 and fase = 'activa' and revocada is null and expira > $2::timestamptz
           order by creada desc offset greatest($3::int - 1, 0))`,
      [cuentaId, s.ahora, maximo],
    );
  }
  const [fila] = await tx.consulta<{ id: string }>(
    `insert into cuenta_sesiones (token_hash, cuenta_id, fase, creada, ultimo_uso, expira, dispositivo)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz, $5::timestamptz, $6) returning id`,
    [s.tokenHash, cuentaId, s.fase, s.ahora, s.expira, s.dispositivo],
  );
  if (s.fase === "activa") await evento(tx, cuentaId, "acceso", s.ahora);
  return { id: fila.id };
}

export function crearAlmacenPostgres(db: BaseDeDatos): AlmacenCuentas {
  /** Deja un enlace pendiente (alta o restablecer) o lo renueva si el anterior es más viejo que el plazo de reenvío. */
  async function emitirEnlace(
    tx: Consultor,
    clavePendiente: { sql: string; valor: string },
    insercion: { sql: string; parametros: unknown[] },
    renovacion: { sql: string; parametros: unknown[] },
  ): Promise<"nuevo" | "renovado" | "reciente"> {
    if ((await tx.consulta(renovacion.sql, renovacion.parametros)).length === 1) return "renovado";
    const hay = await tx.consulta(clavePendiente.sql, [clavePendiente.valor]);
    if (hay.length === 1) return "reciente";
    await tx.consulta(insercion.sql, insercion.parametros);
    return "nuevo";
  }

  return {
    async emitirAlta(e) {
      try {
        return await db.transaccion(async (tx) => {
          if ((await tx.consulta("select 1 as ok from cuentas where correo_indice = $1", [e.correoIndice])).length === 1) {
            return "existente" as const;
          }
          return emitirEnlace(
            tx,
            {
              sql: "select 1 as ok from cuenta_tokens where proposito = 'alta' and correo_indice = $1 and usado is null",
              valor: e.correoIndice,
            },
            {
              sql: `insert into cuenta_tokens (token_hash, proposito, correo_indice, correo_cifrado, version_textos, aceptado, emitido, invitacion_id)
                    values ($1, 'alta', $2, $3, $4, $5::timestamptz, $5::timestamptz, $6::uuid)`,
              parametros: [e.tokenHash, e.correoIndice, e.correoCifrado, e.versionTextos, e.ahora, e.invitacionId ?? null],
            },
            {
              sql: `update cuenta_tokens set token_hash = $1, version_textos = $3, aceptado = $4::timestamptz, emitido = $4::timestamptz,
                           invitacion_id = $6::uuid
                     where proposito = 'alta' and correo_indice = $2 and usado is null and emitido < $5::timestamptz
                     returning 1 as ok`,
              parametros: [e.tokenHash, e.correoIndice, e.versionTextos, e.ahora, e.reenviarSiAnteriorA, e.invitacionId ?? null],
            },
          );
        });
      } catch (error) {
        // Dos solicitudes a la vez para el mismo correo: gana una, la otra ve un enlace reciente.
        if (codigoError(error) === VIOLACION_UNICA) return "reciente";
        throw error;
      }
    },

    async leerAlta(tokenHash, vigenteDesde) {
      const [f] = await db.consulta<{ correo_indice: string; correo_cifrado: string; version_textos: string; aceptado: Date }>(
        `select correo_indice, correo_cifrado, version_textos, aceptado from cuenta_tokens
          where token_hash = $1 and proposito = 'alta' and usado is null and emitido >= $2::timestamptz`,
        [tokenHash, vigenteDesde],
      );
      return f
        ? { correoIndice: f.correo_indice, correoCifrado: f.correo_cifrado, versionTextos: f.version_textos, aceptado: iso(f.aceptado) }
        : null;
    },

    async activarAlta({ tokenHash, vigenteDesde, claveHash, ahora, sesion, exigirInvitacion = false }) {
      try {
        return await db.transaccion(async (tx) => {
          const [t] = await tx.consulta<{
            correo_indice: string;
            correo_cifrado: string;
            version_textos: string;
            aceptado: Date;
            invitacion_id: string | null;
          }>(
            `update cuenta_tokens set usado = $2::timestamptz
              where token_hash = $1 and proposito = 'alta' and usado is null and emitido >= $3::timestamptz
              returning correo_indice, correo_cifrado, version_textos, aceptado, invitacion_id`,
            [tokenHash, ahora, vigenteDesde],
          );
          if (!t) return "invalido" as const;
          if (exigirInvitacion && !t.invitacion_id) throw new InvitacionNoVale();
          const [cuenta] = await tx.consulta<{ id: string }>(
            `insert into cuentas (correo_indice, correo_cifrado, clave_hash, clave_cambiada, version_textos, aceptado, creada)
             values ($1, $2, $3, $4::timestamptz, $5, $6::timestamptz, $4::timestamptz) returning id`,
            [t.correo_indice, t.correo_cifrado, claveHash, ahora, t.version_textos, iso(t.aceptado)],
          );
          if (exigirInvitacion) {
            // Una sola sentencia gasta la invitación si sigue valiendo. Con dos altas a la vez, la segunda espera el candado
            // de la fila, vuelve a evaluar `usada is null` y no encuentra nada: se deshace entera.
            const gastada = await tx.consulta(
              `update invitaciones set usada = $2::timestamptz, cuenta_id = $3
                where id = $1 and usada is null and revocada is null and vence > $2::timestamptz
                returning 1 as ok`,
              [t.invitacion_id, ahora, cuenta.id],
            );
            if (gastada.length !== 1) throw new InvitacionNoVale();
            await tx.consulta(
              "insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'usada', null, $2::timestamptz)",
              [t.invitacion_id, ahora],
            );
          }
          await evento(tx, cuenta.id, "alta", ahora);
          const { id } = await abrirSesion(tx, cuenta.id, { ...sesion, fase: "activa", ahora }, MAX_SESIONES_POR_CUENTA);
          return { cuentaId: cuenta.id, sesionId: id };
        });
      } catch (error) {
        if (error instanceof InvitacionNoVale) return "invitacion";
        if (codigoError(error) === VIOLACION_UNICA) return "duplicado";
        throw error;
      }
    },

    async descartarEnlace(tokenHash) {
      await db.consulta("delete from cuenta_tokens where token_hash = $1 and usado is null", [tokenHash]);
    },

    async buscarPorCorreo(correoIndice) {
      const [f] = await db.consulta<FilaCuenta>(`select ${SQL_COLUMNAS_CUENTA} from cuentas where correo_indice = $1`, [correoIndice]);
      return f ? aCuenta(f) : null;
    },

    async buscarPorId(id) {
      const [f] = await db.consulta<FilaCuenta>(`select ${SQL_COLUMNAS_CUENTA} from cuentas where id = $1`, [id]);
      return f ? aCuenta(f) : null;
    },

    async registrarFallo(cuentaId, ahora, ventanaDesde, puntos) {
      const [f] = await db.consulta<{ fallos: number }>(
        `update cuentas set
           fallos = case when fallos_desde is null or fallos_desde <= $3::timestamptz then $4::integer else fallos + $4::integer end,
           fallos_desde = case when fallos_desde is null or fallos_desde <= $3::timestamptz then $2::timestamptz else fallos_desde end
         where id = $1 returning fallos`,
        [cuentaId, ahora, ventanaDesde, puntos],
      );
      return f?.fallos ?? 0;
    },

    async limpiarFallos(cuentaId) {
      await db.consulta("update cuentas set fallos = 0, fallos_desde = null where id = $1", [cuentaId]);
    },

    async actualizarPerfil(cuentaId, perfil, ahora) {
      await db.consulta(
        `update cuentas set nombre = $2, temas = $3::text[], resumen_previo = $4,
           resumen_alta = case when $4 then coalesce(resumen_alta, $5::timestamptz) else null end, actualizada = $5::timestamptz
         where id = $1`,
        [cuentaId, perfil.nombre, perfil.temas, perfil.resumenPrevio, ahora],
      );
    },

    async actualizarTemas(cuentaId, temas, ahora) {
      await db.consulta("update cuentas set temas = $2::text[], actualizada = $3::timestamptz where id = $1", [cuentaId, temas, ahora]);
    },

    async cambiarClave({ cuentaId, claveHash, ahora, conservarSesion }) {
      await db.transaccion(async (tx) => {
        await tx.consulta(
          `update cuentas set clave_hash = $2, clave_cambiada = $3::timestamptz, actualizada = $3::timestamptz, fallos = 0, fallos_desde = null
            where id = $1`,
          [cuentaId, claveHash, ahora],
        );
        await tx.consulta(
          `update cuenta_sesiones set revocada = $2::timestamptz
            where cuenta_id = $1 and revocada is null and ($3::text is null or token_hash <> $3::text)`,
          [cuentaId, ahora, conservarSesion ?? null],
        );
        await evento(tx, cuentaId, "clave_cambiada", ahora);
      });
    },

    async renovarHashClave(cuentaId, claveHashAnterior, claveHashNueva) {
      await db.consulta("update cuentas set clave_hash = $3 where id = $1 and clave_hash = $2", [cuentaId, claveHashAnterior, claveHashNueva]);
    },

    async eliminarCuenta(cuentaId) {
      await db.consulta("delete from cuentas where id = $1", [cuentaId]);
    },

    async emitirRestablecer(e) {
      try {
        return await db.transaccion((tx) =>
          emitirEnlace(
            tx,
            {
              sql: "select 1 as ok from cuenta_tokens where proposito = 'restablecer' and cuenta_id = $1 and usado is null",
              valor: e.cuentaId,
            },
            {
              sql: `insert into cuenta_tokens (token_hash, proposito, cuenta_id, emitido)
                    values ($1, 'restablecer', $2, $3::timestamptz)`,
              parametros: [e.tokenHash, e.cuentaId, e.ahora],
            },
            {
              sql: `update cuenta_tokens set token_hash = $1, emitido = $3::timestamptz
                     where proposito = 'restablecer' and cuenta_id = $2 and usado is null and emitido < $4::timestamptz
                     returning 1 as ok`,
              parametros: [e.tokenHash, e.cuentaId, e.ahora, e.reenviarSiAnteriorA],
            },
          ),
        );
      } catch (error) {
        if (codigoError(error) === VIOLACION_UNICA) return "reciente";
        throw error;
      }
    },

    async leerRestablecer(tokenHash, vigenteDesde) {
      const [f] = await db.consulta<{ cuenta_id: string }>(
        `select cuenta_id from cuenta_tokens
          where token_hash = $1 and proposito = 'restablecer' and usado is null and emitido >= $2::timestamptz`,
        [tokenHash, vigenteDesde],
      );
      return f ? { cuentaId: f.cuenta_id } : null;
    },

    async usarRestablecer({ tokenHash, vigenteDesde, claveHash, ahora }) {
      return db.transaccion(async (tx) => {
        const [t] = await tx.consulta<{ cuenta_id: string }>(
          `update cuenta_tokens set usado = $2::timestamptz
            where token_hash = $1 and proposito = 'restablecer' and usado is null and emitido >= $3::timestamptz
            returning cuenta_id`,
          [tokenHash, ahora, vigenteDesde],
        );
        if (!t) return null;
        await tx.consulta(
          `update cuentas set clave_hash = $2, clave_cambiada = $3::timestamptz, actualizada = $3::timestamptz, fallos = 0, fallos_desde = null
            where id = $1`,
          [t.cuenta_id, claveHash, ahora],
        );
        await tx.consulta("update cuenta_sesiones set revocada = $2::timestamptz where cuenta_id = $1 and revocada is null", [t.cuenta_id, ahora]);
        await evento(tx, t.cuenta_id, "clave_restablecida", ahora);
        return { cuentaId: t.cuenta_id };
      });
    },

    async guardarTotpPendiente(cuentaId, cifrado) {
      await db.consulta("update cuentas set totp_pendiente_cifrado = $2 where id = $1 and totp_activado is null", [cuentaId, cifrado]);
    },

    async activarTotp({ cuentaId, ahora, paso, codigosHash }) {
      return db.transaccion(async (tx) => {
        const filas = await tx.consulta(
          `update cuentas set totp_secreto_cifrado = totp_pendiente_cifrado, totp_pendiente_cifrado = null,
                  totp_activado = $2::timestamptz, totp_ultimo_paso = $3::bigint, actualizada = $2::timestamptz
            where id = $1 and totp_pendiente_cifrado is not null and totp_activado is null returning 1 as ok`,
          [cuentaId, ahora, paso],
        );
        if (filas.length === 0) return false;
        await tx.consulta("delete from cuenta_codigos where cuenta_id = $1", [cuentaId]);
        await tx.consulta("insert into cuenta_codigos (cuenta_id, codigo_hash) select $1::uuid, unnest($2::text[])", [cuentaId, codigosHash]);
        await evento(tx, cuentaId, "dos_pasos_activados", ahora);
        return true;
      });
    },

    async desactivarTotp(cuentaId, ahora) {
      await db.transaccion(async (tx) => {
        await tx.consulta(
          `update cuentas set totp_secreto_cifrado = null, totp_pendiente_cifrado = null, totp_activado = null,
                  totp_ultimo_paso = null, actualizada = $2::timestamptz where id = $1`,
          [cuentaId, ahora],
        );
        await tx.consulta("delete from cuenta_codigos where cuenta_id = $1", [cuentaId]);
        await evento(tx, cuentaId, "dos_pasos_desactivados", ahora);
      });
    },

    async gastarPasoTotp(cuentaId, paso) {
      const filas = await db.consulta(
        `update cuentas set totp_ultimo_paso = $2::bigint
          where id = $1 and (totp_ultimo_paso is null or totp_ultimo_paso < $2::bigint) returning 1 as ok`,
        [cuentaId, paso],
      );
      return filas.length === 1;
    },

    async gastarCodigoRecuperacion(cuentaId, codigoHash, ahora) {
      const filas = await db.consulta(
        `update cuenta_codigos set usado = $3::timestamptz
          where cuenta_id = $1 and codigo_hash = $2 and usado is null returning 1 as ok`,
        [cuentaId, codigoHash, ahora],
      );
      return filas.length === 1;
    },

    async reemplazarCodigos(cuentaId, codigosHash, ahora) {
      await db.transaccion(async (tx) => {
        await tx.consulta("delete from cuenta_codigos where cuenta_id = $1", [cuentaId]);
        await tx.consulta("insert into cuenta_codigos (cuenta_id, codigo_hash) select $1::uuid, unnest($2::text[])", [cuentaId, codigosHash]);
        await evento(tx, cuentaId, "codigos_regenerados", ahora);
      });
    },

    async contarCodigosLibres(cuentaId) {
      const [f] = await db.consulta<{ n: number }>(
        "select count(*)::int as n from cuenta_codigos where cuenta_id = $1 and usado is null",
        [cuentaId],
      );
      return f.n;
    },

    async crearSesion(cuentaId, s, maximo) {
      return db.transaccion((tx) => abrirSesion(tx, cuentaId, s, maximo));
    },

    async leerSesion(tokenHash, ahora, usadaDesde) {
      const [f] = await db.consulta<{
        id: string;
        cuenta_id: string;
        fase: "pendiente" | "activa";
        creada: Date;
        expira: Date;
        nombre: string | null;
        dos_pasos: boolean;
      }>(
        `select s.id, s.cuenta_id, s.fase, s.creada, s.expira, c.nombre, (c.totp_activado is not null) as dos_pasos
           from cuenta_sesiones s join cuentas c on c.id = s.cuenta_id
          where s.token_hash = $1 and s.revocada is null and s.expira > $2::timestamptz and s.ultimo_uso > $3::timestamptz`,
        [tokenHash, ahora, usadaDesde],
      );
      if (!f) return null;
      const leida: SesionLeida = {
        id: f.id,
        cuentaId: f.cuenta_id,
        fase: f.fase,
        creada: iso(f.creada),
        expira: iso(f.expira),
        nombre: f.nombre,
        dosPasos: f.dos_pasos,
      };
      return leida;
    },

    async tocarSesion(tokenHash, ahora, anteriorA) {
      await db.consulta(
        "update cuenta_sesiones set ultimo_uso = $2::timestamptz where token_hash = $1 and ultimo_uso < $3::timestamptz",
        [tokenHash, ahora, anteriorA],
      );
    },

    async ascenderSesion({ tokenHashPendiente, sesion, maximo }) {
      return db.transaccion(async (tx) => {
        const [previa] = await tx.consulta<{ cuenta_id: string }>(
          `update cuenta_sesiones set revocada = $2::timestamptz
            where token_hash = $1 and fase = 'pendiente' and revocada is null and expira > $2::timestamptz returning cuenta_id`,
          [tokenHashPendiente, sesion.ahora],
        );
        if (!previa) return null;
        const { id } = await abrirSesion(tx, previa.cuenta_id, { ...sesion, fase: "activa" }, maximo);
        return { id, cuentaId: previa.cuenta_id };
      });
    },

    async revocarSesion(tokenHash, ahora) {
      await db.consulta("update cuenta_sesiones set revocada = $2::timestamptz where token_hash = $1 and revocada is null", [tokenHash, ahora]);
    },

    async revocarSesionPorId(cuentaId, id, ahora) {
      const filas = await db.consulta(
        `update cuenta_sesiones set revocada = $3::timestamptz
          where id = $2 and cuenta_id = $1 and fase = 'activa' and revocada is null and expira > $3::timestamptz returning 1 as ok`,
        [cuentaId, id, ahora],
      );
      return filas.length === 1;
    },

    async revocarOtras(cuentaId, conservarTokenHash, ahora) {
      return db.transaccion(async (tx) => {
        const filas = await tx.consulta(
          `update cuenta_sesiones set revocada = $3::timestamptz
            where cuenta_id = $1 and revocada is null and token_hash <> $2 returning 1 as ok`,
          [cuentaId, conservarTokenHash, ahora],
        );
        if (filas.length > 0) await evento(tx, cuentaId, "sesiones_cerradas", ahora);
        return filas.length;
      });
    },

    async listarSesiones(cuentaId, ahora, usadaDesde, actualTokenHash) {
      const filas = await db.consulta<{ id: string; creada: Date; ultimo_uso: Date; dispositivo: string | null; es_actual: boolean }>(
        `select id, creada, ultimo_uso, dispositivo, (token_hash = $4) as es_actual from cuenta_sesiones
          where cuenta_id = $1 and fase = 'activa' and revocada is null and expira > $2::timestamptz and ultimo_uso > $3::timestamptz
          order by creada desc`,
        [cuentaId, ahora, usadaDesde, actualTokenHash],
      );
      return filas.map(
        (f): SesionListada => ({
          id: f.id,
          creada: iso(f.creada),
          ultimoUso: iso(f.ultimo_uso),
          dispositivo: f.dispositivo,
          esActual: f.es_actual,
        }),
      );
    },

    async registrarEvento(cuentaId, tipo, ahora) {
      await evento(db, cuentaId, tipo, ahora);
    },

    async eventosRecientes(cuentaId, limite) {
      const filas = await db.consulta<{ tipo: TipoEvento; fecha: Date }>(
        "select tipo, fecha from cuenta_eventos where cuenta_id = $1 order by id desc limit $2::int",
        [cuentaId, limite],
      );
      return filas.map((f): EventoGuardado => ({ tipo: f.tipo, fecha: iso(f.fecha) }));
    },

    async reservarCorreo(tope, ahora) {
      if (!Number.isInteger(tope) || tope < 1) return false;
      // Una sola sentencia atómica: si el día ya llegó al tope no cambia nada y no devuelve filas.
      const filas = await db.consulta(
        `insert into cuentas_envios_diarios as e (dia, cantidad)
         values (($1::timestamptz at time zone 'America/Santiago')::date, 1)
         on conflict (dia) do update set cantidad = e.cantidad + 1, actualizado = $1::timestamptz
         where e.cantidad < $2::integer
         returning 1 as ok`,
        [ahora, tope],
      );
      return filas.length === 1;
    },

    async cuotaAgotada(tope, ahora) {
      const filas = await db.consulta(
        `select 1 as ok from cuentas_envios_diarios
          where dia = ($1::timestamptz at time zone 'America/Santiago')::date and cantidad >= $2::integer`,
        [ahora, tope],
      );
      return filas.length === 1;
    },

    async purgar(ahora) {
      await db.consulta(
        `delete from cuenta_tokens
          where emitido < $1::timestamptz or (usado is not null and usado < $2::timestamptz)`,
        [antes(ahora, PLAZO_ALTAS_SIN_CONFIRMAR_MS), antes(ahora, 24 * 60 * 60_000)],
      );
      await db.consulta(
        `delete from cuenta_sesiones
          where expira < $1::timestamptz or (revocada is not null and revocada < $1::timestamptz) or ultimo_uso < $2::timestamptz`,
        [antes(ahora, 24 * 60 * 60_000), antes(ahora, SESION_INACTIVA_MS + 24 * 60 * 60_000)],
      );
      await db.consulta("delete from cuenta_eventos where fecha < $1::timestamptz", [antes(ahora, RETENCION_EVENTOS_MS)]);
    },

    // ── Invitaciones ───────────────────────────────────────────────────────

    async emitirInvitacion(e) {
      return db.transaccion(async (tx) => {
        // El tope y la inserción en una sola sentencia: si ya hay `maximoVigentes`, no inserta nada.
        const [fila] = await tx.consulta<{ id: string }>(
          `insert into invitaciones (codigo_hash, alias, emitida, vence)
           select $1, $2, $3::timestamptz, $4::timestamptz
            where (select count(*) from invitaciones
                    where usada is null and revocada is null and vence > $3::timestamptz) < $5::integer
           returning id`,
          [e.codigoHash, e.alias, e.ahora, e.vence, e.maximoVigentes],
        );
        if (!fila) return "tope" as const;
        await tx.consulta(
          "insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'emitida', $2, $3::timestamptz)",
          [fila.id, e.actor, e.ahora],
        );
        return { id: fila.id };
      });
    },

    async reservarInvitacion(codigoHash, ahora, maximoEnvios) {
      const [fila] = await db.consulta<{ id: string }>(
        `update invitaciones set envios = envios + 1
          where codigo_hash = $1 and usada is null and revocada is null and vence > $2::timestamptz and envios < $3::integer
          returning id`,
        [codigoHash, ahora, maximoEnvios],
      );
      return fila?.id ?? null;
    },

    async revocarInvitacion(id, actor, ahora) {
      return db.transaccion(async (tx) => {
        const filas = await tx.consulta(
          "update invitaciones set revocada = $2::timestamptz where id = $1 and usada is null and revocada is null returning 1 as ok",
          [id, ahora],
        );
        if (filas.length !== 1) return false;
        await tx.consulta(
          "insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'revocada', $2, $3::timestamptz)",
          [id, actor, ahora],
        );
        return true;
      });
    },

    async listarInvitaciones(limite) {
      const filas = await db.consulta<FilaInvitacion>(
        `select id, alias, emitida, vence, envios, usada, revocada from invitaciones
          order by emitida desc, id limit $1::int`,
        [limite],
      );
      return filas.map((f) => ({
        id: f.id,
        alias: f.alias,
        emitida: iso(f.emitida),
        vence: iso(f.vence),
        envios: f.envios,
        usada: f.usada ? iso(f.usada) : null,
        revocada: f.revocada ? iso(f.revocada) : null,
      }));
    },

    async auditoriaInvitaciones(limite) {
      const filas = await db.consulta<{ invitacion_id: string; alias: string; accion: AuditoriaInvitacion["accion"]; actor: string | null; fecha: Date }>(
        `select a.invitacion_id, i.alias, a.accion, a.actor, a.fecha
           from invitacion_auditoria a join invitaciones i on i.id = a.invitacion_id
          order by a.orden desc limit $1::int`,
        [limite],
      );
      return filas.map((f) => ({ invitacionId: f.invitacion_id, alias: f.alias, accion: f.accion, actor: f.actor, fecha: iso(f.fecha) }));
    },

    async invitacionDeCuenta(cuentaId) {
      const [f] = await db.consulta<{ alias: string; emitida: Date; usada: Date }>(
        "select alias, emitida, usada from invitaciones where cuenta_id = $1 and usada is not null",
        [cuentaId],
      );
      return f ? { alias: f.alias, emitida: iso(f.emitida), usada: iso(f.usada) } : null;
    },
  };
}
