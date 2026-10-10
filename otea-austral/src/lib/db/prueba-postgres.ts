/**
 * Bases de datos desechables para las pruebas (solo se importa desde
 * `*.test.ts`). Cada archivo crea la suya, con las migraciones y el
 * registro de fuentes, y entra con un usuario miembro de `otea_app`: las
 * pruebas corren con los mismos permisos mínimos que la aplicación.
 *
 * Requiere `PRUEBAS_DATABASE_URL`: un Postgres local o el de la CI, con un
 * rol que pueda crear bases y roles. Sin ella las pruebas se omiten, salvo
 * con `PRUEBAS_DB_OBLIGATORIAS=1` (la CI), que las hace fallar.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { leerMigraciones, leerSemillaFuentes, migrar } from "../../../scripts/lib/migraciones.mjs";
import { crearBaseDeDatos, type BaseDeDatos } from "./cliente";

const URL_PRUEBAS = process.env.PRUEBAS_DATABASE_URL;

if (!URL_PRUEBAS && process.env.PRUEBAS_DB_OBLIGATORIAS === "1") {
  throw new Error("PRUEBAS_DB_OBLIGATORIAS=1 pero falta PRUEBAS_DATABASE_URL.");
}

export const HAY_BASE_DE_PRUEBAS = Boolean(URL_PRUEBAS);

export type BaseDePrueba = {
  /** Conexión con los permisos de la aplicación. */
  app: BaseDeDatos;
  /** Conexión con el rol dueño, para comprobar lo que la aplicación no ve. */
  propietario: BaseDeDatos;
  cerrar(): Promise<void>;
};

// Serializa la creación del rol compartido entre archivos que corren en paralelo.
const CANDADO = 731_731;

async function conAdministrador<T>(fn: (cliente: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: URL_PRUEBAS });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

export async function crearBaseDePrueba(): Promise<BaseDePrueba> {
  if (!URL_PRUEBAS) throw new Error("Falta PRUEBAS_DATABASE_URL.");
  const sufijo = randomBytes(6).toString("hex");
  const nombre = `otea_prueba_${sufijo}`;
  const clave = randomBytes(18).toString("base64url");

  await conAdministrador(async (c) => {
    await c.query("select pg_advisory_lock($1)", [CANDADO]);
    try {
      await c.query(`do $$ begin
        if not exists (select from pg_catalog.pg_roles where rolname = 'otea_app') then
          create role otea_app nologin;
        end if;
      end $$`);
      await c.query(`create database ${nombre}`);
      await c.query(`create role ${nombre} login password '${clave}' in role otea_app`);
    } finally {
      await c.query("select pg_advisory_unlock($1)", [CANDADO]);
    }
  });

  const urlBase = new URL(URL_PRUEBAS);
  urlBase.pathname = `/${nombre}`;
  const migrador = new pg.Client({ connectionString: urlBase.toString() });
  await migrador.connect();
  try {
    await migrar(migrador, await leerMigraciones(), await leerSemillaFuentes());
  } finally {
    await migrador.end();
  }

  const urlApp = new URL(urlBase);
  urlApp.username = nombre;
  urlApp.password = clave;
  const app = crearBaseDeDatos(urlApp.toString(), { max: 3, nombreAplicacion: "otea-pruebas" });
  const propietario = crearBaseDeDatos(urlBase.toString(), { max: 2, nombreAplicacion: "otea-pruebas" });

  return {
    app,
    propietario,
    async cerrar() {
      await Promise.all([app.cerrar(), propietario.cerrar()]);
      await conAdministrador(async (c) => {
        await c.query(`drop database if exists ${nombre} with (force)`);
        await c.query(`drop role if exists ${nombre}`);
      });
    },
  };
}
