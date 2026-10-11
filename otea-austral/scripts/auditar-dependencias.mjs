// Audita TODAS las dependencias (también las de desarrollo) con `npm audit` y falla si hay un aviso de
// severidad alta o crítica que no esté en seguridad/avisos-npm-aceptados.json (con su motivo y su fecha de
// revisión). Las de producción ya se auditan aparte, sin excepciones, en la CI.
//
// Uso: npm run seguridad:dependencias
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluarAuditoria, problemasDeLaLista } from "./lib/auditoria-npm.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aceptados = JSON.parse(readFileSync(path.join(raiz, "seguridad", "avisos-npm-aceptados.json"), "utf8"));
const problemas = problemasDeLaLista(aceptados);
if (problemas.length > 0) {
  console.error(`seguridad/avisos-npm-aceptados.json no es válido:\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(2);
}

// `npm audit` sale con código 1 si hay avisos: lo que importa es el JSON.
const auditoria = spawnSync("npm", ["audit", "--json"], { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let informe;
try {
  informe = JSON.parse(auditoria.stdout);
} catch {
  console.error(`No se pudo leer la salida de npm audit.\n${auditoria.stderr}`);
  process.exit(2);
}
if (informe.error) {
  console.error(`npm audit falló: ${informe.error.summary ?? informe.error.code}`);
  process.exit(2);
}

const r = evaluarAuditoria(informe, aceptados, new Date());
const linea = (a) => `  - ${a.id} · ${a.paquete} (${a.severidad}): ${a.titulo}\n    ${a.url}`;
for (const a of r.aceptados) console.log(`Aceptado hasta revisar el ${a.revisar}: ${a.id} · ${a.paquete} (${a.alcance}).`);
if (r.informativos.length > 0) console.log(`Avisos de severidad menor (no bloquean): ${r.informativos.length}.`);
if (r.sobrantes.length > 0) console.log(`Avisos aceptados que ya no aparecen (puedes quitarlos de la lista): ${r.sobrantes.join(", ")}.`);
if (r.vencidos.length > 0) {
  console.error(`\nRevisión vencida de avisos aceptados: vuelve a evaluarlos y renueva la fecha o corrígelos.\n${r.vencidos.map(linea).join("\n")}`);
}
if (r.nuevos.length > 0) {
  console.error(`\nAvisos nuevos de severidad alta o crítica sin evaluar:\n${r.nuevos.map(linea).join("\n")}`);
  console.error("\nCorrígelos (npm audit fix, actualizar la dependencia) o, si no hay corrección y no aplican, acéptalos con su motivo en seguridad/avisos-npm-aceptados.json.");
}
if (!r.ok) process.exit(1);
console.log("Dependencias: sin avisos altos o críticos pendientes de evaluar.");
