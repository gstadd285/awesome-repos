// Construye la aplicación con secretos falsos («canarios») y comprueba que ninguno aparece en el
// resultado (.next/), que es lo que llega al navegador y lo que se copia a la imagen del contenedor.
// También falla si el build publica mapas de código o archivos de entorno.
//
// Uso: npm run seguridad:canarios
//
// Si falla, un secreto del servidor se coló en el código que corre en el navegador o en el paquete:
// busca qué componente de cliente importa la configuración o lee `process.env` (ver CLAUDE.md).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANARIOS, buscarArchivosProhibidos, buscarCanarios } from "./lib/canarios.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const salida = path.join(raiz, ".next");

console.log("Construyendo con secretos falsos…");
const build = spawnSync("npm", ["run", "build"], {
  cwd: raiz,
  stdio: "inherit",
  env: { ...process.env, ...CANARIOS, NEXT_TELEMETRY_DISABLED: "1" },
});
if (build.status !== 0 || !existsSync(salida)) {
  console.error("El build falló: no se pudo hacer la comprobación.");
  process.exit(2);
}

// `.next/cache` es de trabajo (no se publica ni entra a la imagen) y guarda las entradas del build.
const omitir = ["cache"];
const { revisados, hallazgos } = buscarCanarios(salida, { omitir });
const prohibidos = buscarArchivosProhibidos(salida, { omitir });

if (hallazgos.length === 0 && prohibidos.length === 0) {
  console.log(`Revisados ${revisados} archivos de .next/: ningún secreto falso, mapa de código ni archivo de entorno.`);
} else {
  for (const h of hallazgos) console.error(`SECRETO EN EL BUILD: ${h.ruta} contiene «${h.marca}»`);
  for (const p of prohibidos) console.error(`ARCHIVO QUE NO DEBE PUBLICARSE: .next/${p}`);
  process.exit(1);
}
