// Aplicación de migraciones SQL y semilla del registro de fuentes.
// Lo usan `scripts/migrar.mjs` y las pruebas de base de datos.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DIRECTORIO_MIGRACIONES = path.join(RAIZ, "db", "migraciones");
export const SEMILLA_FUENTES = path.join(RAIZ, "data", "sources.seed.json");

const NOMBRE_VALIDO = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * @typedef {{ nombre: string, sql: string, sha256: string }} Migracion
 * @typedef {{ query: (texto: string, parametros?: unknown[]) => Promise<{ rows: any[] }> }} ClienteSql
 */

/** @returns {Promise<Migracion[]>} en orden de nombre (0001_, 0002_…). */
export async function leerMigraciones(directorio = DIRECTORIO_MIGRACIONES) {
  const archivos = (await readdir(directorio)).filter((a) => a.endsWith(".sql")).sort();
  return Promise.all(
    archivos.map(async (nombre) => {
      if (!NOMBRE_VALIDO.test(nombre)) {
        throw new Error(`Nombre de migración inválido: ${nombre} (usa 0001_descripcion.sql)`);
      }
      const sql = await readFile(path.join(directorio, nombre), "utf8");
      return { nombre, sql, sha256: createHash("sha256").update(sql).digest("hex") };
    }),
  );
}

/** @returns {Promise<unknown[]>} */
export async function leerSemillaFuentes(archivo = SEMILLA_FUENTES) {
  return JSON.parse(await readFile(archivo, "utf8"));
}

/**
 * Aplica las migraciones pendientes y actualiza el registro de fuentes en
 * una sola transacción: o entra todo o nada. Un candado evita que dos
 * ejecuciones se crucen. Una migración ya aplicada no puede cambiar.
 *
 * @param {ClienteSql} cliente conexión dedicada (no un pool), con el rol dueño.
 * @param {Migracion[]} migraciones
 * @param {unknown[]} fuentes
 * @returns {Promise<string[]>} nombres de las migraciones aplicadas ahora.
 */
export async function migrar(cliente, migraciones, fuentes) {
  await cliente.query("begin");
  try {
    await cliente.query("select pg_advisory_xact_lock(hashtext('otea_migraciones'))");
    await cliente.query(`
      create table if not exists otea_migraciones (
        nombre text primary key,
        sha256 text not null,
        aplicada timestamptz not null default now()
      )`);
    const { rows } = await cliente.query("select nombre, sha256 from otea_migraciones");
    const aplicadas = new Map(rows.map((r) => [r.nombre, r.sha256]));
    const nuevas = [];
    for (const m of migraciones) {
      const previa = aplicadas.get(m.nombre);
      if (previa === m.sha256) continue;
      if (previa !== undefined) {
        throw new Error(`La migración ${m.nombre} cambió después de aplicarse: crea una nueva en vez de editarla.`);
      }
      await cliente.query(m.sql);
      await cliente.query("insert into otea_migraciones (nombre, sha256) values ($1, $2)", [m.nombre, m.sha256]);
      nuevas.push(m.nombre);
    }
    await sembrarFuentes(cliente, fuentes);
    await cliente.query("commit");
    return nuevas;
  } catch (error) {
    await cliente.query("rollback");
    throw error;
  }
}

/**
 * Inserta o actualiza las fuentes de la semilla. Las restricciones de la
 * tabla validan cada campo. Una fuente que sale de la semilla no se borra
 * (puede tener alertas enlazadas): se desactiva con `activa: false`.
 *
 * @param {ClienteSql} cliente
 * @param {unknown[]} fuentes
 */
export async function sembrarFuentes(cliente, fuentes) {
  await cliente.query(
    `insert into fuentes (id, nombre, organismo, url_base, tipo, temas, acceso,
                          condiciones_reutilizacion, prioridad, activa)
     select id, nombre, organismo, url_base, tipo, temas, acceso,
            condiciones_reutilizacion, prioridad, activa
     from jsonb_to_recordset($1::jsonb) as f(
       id text, nombre text, organismo text, url_base text, tipo text, temas text[],
       acceso text, condiciones_reutilizacion text, prioridad text, activa boolean
     )
     on conflict (id) do update set
       nombre = excluded.nombre,
       organismo = excluded.organismo,
       url_base = excluded.url_base,
       tipo = excluded.tipo,
       temas = excluded.temas,
       acceso = excluded.acceso,
       condiciones_reutilizacion = excluded.condiciones_reutilizacion,
       prioridad = excluded.prioridad,
       activa = excluded.activa`,
    [JSON.stringify(fuentes)],
  );
}
