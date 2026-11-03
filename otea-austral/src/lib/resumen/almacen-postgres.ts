import type { BaseDeDatos } from "@/lib/db/cliente";
import { calcularConfianza, type TipoFuente } from "@/lib/domain/respaldo";
import type { Tema } from "@/lib/domain/temas";
import type { AlmacenBaja } from "./baja";
import type { AlertaParaResumen } from "./seleccion";
import type { AlmacenResumen, Reserva, Suscrita } from "./servicio";

/**
 * El resumen diario sobre Postgres (migración `0011`). La aplicación entra con `otea_app`: grants por columna y RLS en
 * `resumen_envios`, `resumen_envios_diarios` y `resumen_bajas`. Lo publicado se lee con su propia consulta (no con
 * `repo.publicas`, que es solo de `/alertas`): **solo `es_ejemplo = false`**, publicadas o corregidas, y de cada alerta
 * solo título, tema, fecha y el tipo y organismo de sus fuentes (para calcular la confianza), nunca su texto.
 */

const SQL_DIA = "($1::timestamptz at time zone 'America/Santiago')::date";

const SQL_SUSCRITAS = `select c.id, c.correo_cifrado, c.correo_indice, c.temas, c.resumen_alta,
    (select max(e.hasta) from resumen_envios e where e.cuenta_id = c.id and e.estado = 'enviado') as ultimo_hasta
  from cuentas c
  where c.resumen_previo and c.resumen_alta is not null
    and not exists (select 1 from resumen_envios h where h.cuenta_id = c.id and h.dia = ${SQL_DIA})
  order by ultimo_hasta nulls first, c.id
  limit 2000`;

const SQL_PUBLICADAS = `select a.id, a.tema, a.evento, a.fecha, a.estado, a.es_ejemplo,
    coalesce(json_agg(json_build_object('tipo', f.tipo, 'organismo', f.organismo)) filter (where f.id is not null), '[]') as fuentes
  from alertas a left join alerta_fuentes f on f.alert_id = a.id and f.retirada is null
  where a.es_ejemplo = false and a.estado in ('publicada', 'corregida') and a.fecha > $1::timestamptz and a.fecha <= $2::timestamptz
  group by a.id
  order by a.fecha desc
  limit 500`;

// Una sola sentencia atómica: si el día ya llegó al tope no cambia nada y no devuelve filas (como `cuentas_envios_diarios`).
const SQL_CUPO = `insert into resumen_envios_diarios as e (dia, cantidad) values (${SQL_DIA}, 1)
  on conflict (dia) do update set cantidad = e.cantidad + 1, actualizado = $1::timestamptz
  where e.cantidad < $2::integer
  returning 1 as ok`;

const SQL_RESERVAR = `insert into resumen_envios (cuenta_id, dia, desde, hasta, alertas, reservado)
  values ($2, ${SQL_DIA}, $3::timestamptz, $4::timestamptz, $5::integer, $1::timestamptz)
  on conflict (cuenta_id, dia) do nothing
  returning 1 as ok`;

const SQL_TOKEN = `insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ($1, $2, $3::timestamptz, $4::timestamptz)`;

const SQL_RESOLVER = `update resumen_envios set estado = $3, resuelto = $4::timestamptz
  where cuenta_id = $2 and dia = ${SQL_DIA} and estado = 'reservado'`;

const SQL_CORRIDA = `insert into ingesta_corridas (tarea, inicio, fin, feeds, nuevos, fallos, resultado)
  values ('resumen', $1::timestamptz, $2::timestamptz, $3, $4, $5, $6)`;

const SQL_GASTAR_TOKEN = "delete from resumen_bajas where token_hash = $1 and vence > $2::timestamptz returning cuenta_id";

const SQL_APAGAR = `update cuentas set resumen_previo = false, resumen_alta = null, actualizada = $2::timestamptz
  where id = $1 and resumen_previo returning 1 as ok`;

/** Una reserva que no prosperó a mitad de camino: la transacción se deshace (el cupo no se gasta). */
class YaEnviado extends Error {}

export function crearAlmacenResumenPostgres(db: BaseDeDatos): AlmacenResumen & AlmacenBaja {
  return {
    async suscritas(ahora) {
      const filas = await db.consulta<{
        id: string;
        correo_cifrado: string;
        correo_indice: string;
        temas: string[];
        resumen_alta: Date;
        ultimo_hasta: Date | null;
      }>(SQL_SUSCRITAS, [ahora]);
      return filas.map(
        (f): Suscrita => ({
          cuentaId: f.id,
          correoCifrado: f.correo_cifrado,
          correoIndice: f.correo_indice,
          temas: f.temas,
          ultimoHasta: f.ultimo_hasta,
          pedidoDesde: f.resumen_alta,
        }),
      );
    },

    async publicadas(desde, hasta) {
      const filas = await db.consulta<{
        id: string;
        tema: Tema;
        evento: string;
        fecha: Date;
        estado: "publicada" | "corregida";
        es_ejemplo: boolean;
        fuentes: { tipo: TipoFuente; organismo: string }[];
      }>(SQL_PUBLICADAS, [desde, hasta]);
      return filas
        .filter((f) => !f.es_ejemplo)
        .map(
          (f): AlertaParaResumen => ({
            id: f.id,
            tema: f.tema,
            evento: f.evento,
            confianza: calcularConfianza(f.fuentes),
            publicada: f.fecha.toISOString(),
            estado: f.estado,
            es_ejemplo: f.es_ejemplo,
          }),
        );
    },

    async reservar(r): Promise<Reserva> {
      try {
        return await db.transaccion(async (tx) => {
          const cupo = await tx.consulta(SQL_CUPO, [r.ahora, r.tope]);
          if (cupo.length === 0) return "sin_cupo";
          const nuevo = await tx.consulta(SQL_RESERVAR, [r.ahora, r.cuentaId, r.desde, r.hasta, r.alertas]);
          if (nuevo.length === 0) throw new YaEnviado();
          await tx.consulta(SQL_TOKEN, [r.tokenHash, r.cuentaId, r.ahora, r.vence]);
          return "ok";
        });
      } catch (error) {
        if (error instanceof YaEnviado) return "ya_enviado";
        throw error;
      }
    },

    async resolver(cuentaId, reservadoEn, estado, ahora) {
      await db.consulta(SQL_RESOLVER, [reservadoEn, cuentaId, estado, ahora]);
    },

    async purgar(ahora) {
      await db.consulta("delete from resumen_bajas where vence < $1::timestamptz", [ahora]);
      await db.consulta(`delete from resumen_envios where dia < ${SQL_DIA} - 90`, [ahora]);
    },

    async registrarCorrida(c) {
      await db.consulta(SQL_CORRIDA, [c.inicio, c.fin, c.cuentas, c.enviados, c.fallos, c.resultado]);
    },

    async darDeBaja(tokenHash, ahora) {
      return db.transaccion(async (tx) => {
        const [fila] = await tx.consulta<{ cuenta_id: string }>(SQL_GASTAR_TOKEN, [tokenHash, ahora]);
        if (!fila) return false;
        const apagado = await tx.consulta(SQL_APAGAR, [fila.cuenta_id, ahora]);
        if (apagado.length > 0) {
          await tx.consulta("insert into cuenta_eventos (cuenta_id, tipo, fecha) values ($1, 'resumen_desactivado', $2::timestamptz)", [fila.cuenta_id, ahora]);
        }
        // Un enlace de un correo anterior tampoco debe servir para nada más.
        await tx.consulta("delete from resumen_bajas where cuenta_id = $1", [fila.cuenta_id]);
        return true;
      });
    },
  };
}
