// Crea el usuario con el que la aplicación entra a la base (o renueva su
// clave), como miembro de `otea_app`: solo los permisos mínimos de la
// migración 0001. Ejecutar después de `npm run db:migrar`.
//
// Uso: DATABASE_URL_ADMIN="postgresql://dueño:…@host/base?sslmode=verify-full" npm run db:rol-app [-- nombre]
//
// Imprime una sola vez la URL de conexión de la aplicación: guárdala como
// secreto DATABASE_URL. CLAVE_ROL_APP fija la clave (solo para la CI).
import pg from "pg";
import {
  atributosIndebidos,
  generarClave,
  sentenciasRol,
  urlAplicacion,
  validarClave,
  verificadorScram,
} from "./lib/rol-app.mjs";

const urlAdmin = process.env.DATABASE_URL_ADMIN;
const nombre = process.argv[2] ?? "otea_web";
if (!urlAdmin) {
  console.error("Falta DATABASE_URL_ADMIN: la conexión con el rol dueño de la base.");
  process.exit(1);
}

const destino = new URL(urlAdmin);
const local = ["localhost", "127.0.0.1", "::1"].includes(destino.hostname);
if (!local && !["verify-full", "require", "verify-ca"].includes(destino.searchParams.get("sslmode") ?? "")) {
  console.error("La conexión debe ir cifrada: agrega sslmode=verify-full a DATABASE_URL_ADMIN.");
  process.exit(1);
}

const claveFija = process.env.CLAVE_ROL_APP;
const cliente = new pg.Client({ connectionString: urlAdmin, application_name: "otea-rol-app" });
try {
  const clave = claveFija ? validarClave(claveFija) : generarClave();
  await cliente.connect();
  const { rows } = await cliente.query(
    `select exists (select from pg_catalog.pg_roles where rolname = $1) as existe,
            exists (select from pg_catalog.pg_roles where rolname = 'otea_app') as base`,
    [nombre],
  );
  if (!rows[0].base) throw new Error("Falta el rol otea_app: ejecuta antes npm run db:migrar.");

  // Un usuario que ya existía pudo tener atributos de más: la aplicación no debe poder saltarse RLS ni crear
  // nada. Se revisa antes de tocarlo y de nuevo al terminar.
  const verificarAtributos = async () => {
    const { rows: atributos } = await cliente.query(
      `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit
         from pg_catalog.pg_roles where rolname = $1`,
      [nombre],
    );
    const indebidos = atributos[0] ? atributosIndebidos(atributos[0]) : [];
    if (indebidos.length > 0) {
      throw new Error(`El usuario ${nombre} tiene atributos que la aplicación no debe tener: ${indebidos.join("; ")}.`);
    }
  };
  if (rows[0].existe) await verificarAtributos();

  const aplicar = async (secreto) => {
    await cliente.query("begin");
    try {
      for (const sentencia of sentenciasRol(nombre, secreto, rows[0].existe)) await cliente.query(sentencia);
      await cliente.query("commit");
    } catch (error) {
      await cliente.query("rollback");
      throw error;
    }
  };

  try {
    await aplicar(verificadorScram(clave));
  } catch {
    // Hay servicios que miden la fortaleza de la clave y rechazan verificadores.
    console.warn("La base no aceptó la clave cifrada; se envía por la conexión TLS.");
    await aplicar(clave);
  }

  await verificarAtributos();

  console.log(`Usuario ${nombre} listo (miembro de otea_app, sin otros permisos).`);
  if (!claveFija) {
    console.log("Guarda esta URL como secreto DATABASE_URL y no la pegues en el repositorio ni en chats:");
    console.log(urlAplicacion(urlAdmin, nombre, clave));
  }
} catch (error) {
  console.error(`No se pudo crear el usuario: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
