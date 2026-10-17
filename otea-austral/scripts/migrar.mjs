// Aplica las migraciones pendientes de db/migraciones y actualiza el registro
// de fuentes desde data/sources.seed.json.
//
// Uso: DATABASE_URL_ADMIN="postgresql://dueño:…@host/base?sslmode=verify-full" npm run db:migrar
//
// Usa el rol dueño de la base, nunca el de la aplicación. La URL no se
// imprime ni se guarda.
import pg from "pg";
import { leerMigraciones, leerSemillaFuentes, migrar } from "./lib/migraciones.mjs";

const url = process.env.DATABASE_URL_ADMIN;
if (!url) {
  console.error("Falta DATABASE_URL_ADMIN: la conexión con el rol dueño de la base.");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url, application_name: "otea-migraciones" });
try {
  await cliente.connect();
  const nuevas = await migrar(cliente, await leerMigraciones(), await leerSemillaFuentes());
  console.log(nuevas.length > 0 ? `Migraciones aplicadas: ${nuevas.join(", ")}.` : "Sin migraciones pendientes.");
  console.log("Registro de fuentes actualizado.");
} catch (error) {
  console.error(`No se pudo migrar: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
