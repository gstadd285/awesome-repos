// Busca secretos (claves, tokens, credenciales) en los archivos del repositorio y,
// con --historial, en todos sus commits. Sale con código 1 si encuentra algo.
//
// Uso: npm run seguridad:secretos [-- --historial] [-- --raiz <carpeta>]
//
// Si encuentra un secreto REAL: primero revócalo y rota la clave en el proveedor
// (borrar el commit no basta: ya pudo copiarse), después limpia el historial.
// Pasos en docs/seguridad/respuesta-incidentes.md.
import {
  describirHallazgo,
  escanearArbol,
  escanearHistorial,
  raizDelRepositorio,
} from "./lib/escaner-secretos.mjs";

const args = process.argv.slice(2);
if (args.includes("--ayuda") || args.includes("-h")) {
  console.log("Uso: node scripts/escanear-secretos.mjs [--historial] [--raiz <carpeta>]");
  process.exit(0);
}
const indiceRaiz = args.indexOf("--raiz");
const raiz = indiceRaiz >= 0 && args[indiceRaiz + 1] ? args[indiceRaiz + 1] : await raizDelRepositorio();
const conHistorial = args.includes("--historial");

try {
  const hallazgos = [...(await escanearArbol(raiz)), ...(conHistorial ? await escanearHistorial(raiz) : [])];
  const alcance = conHistorial ? "archivos y todo el historial" : "archivos";
  if (hallazgos.length === 0) {
    console.log(`Sin secretos en ${alcance}.`);
  } else {
    console.error(`Posibles secretos en ${alcance}: ${hallazgos.length}\n`);
    for (const h of hallazgos) console.error(describirHallazgo(h));
    console.error(
      "\nSi es un falso positivo documentado, agrega «escaner:ignorar» y el motivo en la misma línea." +
        "\nSi es real: revoca y rota la clave primero (ver docs/seguridad/respuesta-incidentes.md).",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`No se pudo escanear: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 2;
}
