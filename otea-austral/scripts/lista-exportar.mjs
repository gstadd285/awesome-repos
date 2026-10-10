// Exporta los correos CONFIRMADOS de la lista de espera, descifrados (para avisar del lanzamiento).
// Corre en tu computador con el rol dueño de la base: la aplicación no puede leer los correos.
//
// Uso:
//   DATABASE_URL_ADMIN="postgresql://dueño:…@host/base?sslmode=verify-full" \
//   WAITLIST_SECRETO="…" npm run lista:exportar [-- --csv] [-- --pendientes] > confirmados.txt
//
// Sin opciones imprime un correo por línea. --csv agrega la fecha de confirmación y neutraliza las
// fórmulas de planilla. --pendientes incluye a quien aún no confirmó (NO les envíes nada: no dieron su
// consentimiento). El archivo resultante tiene datos personales: no lo subas a un repositorio ni a un chat,
// y bórralo al terminar.
import pg from "pg";
import { motivoConexionInsegura } from "./lib/conexion.mjs";
import { aCsv, leerCorreos } from "./lib/lista.mjs";

const urlAdmin = process.env.DATABASE_URL_ADMIN;
const secreto = process.env.WAITLIST_SECRETO;
if (!urlAdmin || !secreto) {
  console.error("Faltan DATABASE_URL_ADMIN (rol dueño) y WAITLIST_SECRETO (el secreto de la lista).");
  process.exit(1);
}
const inseguro = motivoConexionInsegura(urlAdmin);
if (inseguro) {
  console.error(inseguro);
  process.exit(1);
}

const args = process.argv.slice(2);
const cliente = new pg.Client({ connectionString: urlAdmin, application_name: "otea-lista-exportar" });
try {
  await cliente.connect();
  const filas = await leerCorreos(cliente, secreto, { incluirPendientes: args.includes("--pendientes") });
  process.stdout.write(`${args.includes("--csv") ? aCsv(filas) : filas.map((f) => f.correo).join("\n")}\n`);
  console.error(`${filas.length} correos exportados. Contienen datos personales: guárdalos con cuidado y bórralos al terminar.`);
} catch (error) {
  console.error(`No se pudo exportar: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
