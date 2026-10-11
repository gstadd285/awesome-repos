// Rota el secreto de la lista de espera: vuelve a cifrar todos los correos con un secreto nuevo.
//
// Orden seguro (ver docs/despliegue.md, «Rotar el secreto de la lista»):
//   1. Cierra la lista: WAITLIST_MODE=cerrada y vuelve a desplegar.
//   2. Genera el secreto nuevo con `npm run lista:secreto` (y guarda también el anterior).
//   3. Ensaya sin cambiar nada (comprueba que todos los correos se descifran con el secreto anterior):
//        DATABASE_URL_ADMIN=… WAITLIST_SECRETO_ANTERIOR=… WAITLIST_SECRETO=… npm run lista:recifrar
//   4. Aplica: el mismo comando con `-- --aplicar`.
//   5. Despliega el secreto nuevo (nueva versión del secreto en Secret Manager) y reabre la lista.
import pg from "pg";
import { motivoConexionInsegura } from "./lib/conexion.mjs";
import { recifrar } from "./lib/lista.mjs";

const urlAdmin = process.env.DATABASE_URL_ADMIN;
const anterior = process.env.WAITLIST_SECRETO_ANTERIOR;
const nuevo = process.env.WAITLIST_SECRETO;
if (!urlAdmin || !anterior || !nuevo) {
  console.error("Faltan DATABASE_URL_ADMIN, WAITLIST_SECRETO_ANTERIOR y WAITLIST_SECRETO (el nuevo).");
  process.exit(1);
}
const inseguro = motivoConexionInsegura(urlAdmin);
if (inseguro) {
  console.error(inseguro);
  process.exit(1);
}

const aplicar = process.argv.slice(2).includes("--aplicar");
const cliente = new pg.Client({ connectionString: urlAdmin, application_name: "otea-lista-recifrar" });
try {
  await cliente.connect();
  const r = await recifrar(cliente, anterior, nuevo, { aplicar });
  console.log(
    aplicar
      ? `Listo: ${r.filas} correos vueltos a cifrar. Despliega ahora el secreto nuevo.`
      : `Ensayo correcto: ${r.filas} correos se descifran con el secreto anterior. No se cambió nada; agrega «-- --aplicar» para rotar.`,
  );
} catch (error) {
  console.error(`No se pudo rotar: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
