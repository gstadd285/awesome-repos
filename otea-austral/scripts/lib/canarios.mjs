// «Canarios»: secretos falsos y reconocibles con los que se construye la aplicación para comprobar
// que ninguno queda escrito en el resultado del build (que es lo que viaja al navegador y a la
// imagen del contenedor). Lo usan `scripts/comprobar-secretos-en-build.mjs` y las pruebas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Todos los canarios contienen una de estas marcas: basta con buscarlas. */
// (Solo en mayúsculas: el nombre del script de este chequeo, «seguridad:canarios», está en el package.json que
// Next copia a `standalone`.)
export const MARCAS = ["CANARIO"];

/**
 * Variables de entorno del servidor, con valores falsos que cumplen el esquema de `src/lib/env.ts`
 * (el build las lee al importar la configuración). `NEXT_PUBLIC_SITE_URL` no se incluye: es pública.
 */
export const CANARIOS = {
  WAITLIST_MODE: "abierta",
  DATABASE_URL: "postgresql://CANARIO_USUARIO:CANARIO-clave-bd-8f3a1c@localhost:5432/CANARIO_BD",
  RESEND_API_KEY: "re_CANARIO0123456789abcdefCANARIO", // escaner:ignorar valor falso a propósito (canario)
  ADMIN_CLAVE_HASH: `pbkdf2-sha256$600000$${"CANARIOsal".padEnd(22, "x")}$${"CANARIOhash".padEnd(43, "y")}`,
  ADMIN_TOTP_SECRETO: "CANARIO".repeat(5).slice(0, 32),
  ADMIN_SESION_SECRETO: "CANARIO_sesion_".padEnd(48, "z"),
};

const MAX_BYTES = 100_000_000;

/**
 * Archivos de `directorio` (sin entrar en `omitir`) que contienen alguna marca.
 * @param {string} directorio
 * @param {{ omitir?: string[] }} [opciones]
 * @returns {{ revisados: number, hallazgos: { ruta: string, marca: string }[] }}
 */
export function buscarCanarios(directorio, { omitir = [] } = {}) {
  const hallazgos = [];
  let revisados = 0;
  const marcas = MARCAS.map((m) => ({ m, b: Buffer.from(m) }));
  const recorrer = (carpeta) => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = path.join(carpeta, entrada.name);
      const relativa = path.relative(directorio, ruta).split(path.sep).join("/");
      if (omitir.some((o) => relativa === o || relativa.startsWith(`${o}/`))) continue;
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.isFile() && statSync(ruta).size <= MAX_BYTES) {
        revisados += 1;
        const contenido = readFileSync(ruta);
        for (const { m, b } of marcas) if (contenido.includes(b)) hallazgos.push({ ruta: relativa, marca: m });
      }
    }
  };
  recorrer(directorio);
  return { revisados, hallazgos };
}

/**
 * Lo que nunca debe publicarse: mapas de código en lo que se sirve al público (`static/`, `public/`;
 * revelan el código fuente) y archivos de entorno en cualquier parte. Los mapas de `server/` son del
 * build y no se sirven: en la imagen quedan solo índices vacíos, que el Dockerfile borra.
 * @param {string} directorio
 * @param {{ omitir?: string[], carpetasPublicas?: string[] }} [opciones]
 * @returns {string[]}
 */
export function buscarArchivosProhibidos(directorio, { omitir = [], carpetasPublicas = ["static", "public"] } = {}) {
  const prohibidos = [];
  const recorrer = (carpeta) => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = path.join(carpeta, entrada.name);
      const relativa = path.relative(directorio, ruta).split(path.sep).join("/");
      if (omitir.some((o) => relativa === o || relativa.startsWith(`${o}/`))) continue;
      if (entrada.isDirectory()) {
        recorrer(ruta);
        continue;
      }
      const esPublico = relativa.split("/").some((parte) => carpetasPublicas.includes(parte));
      if ((/\.map$/.test(entrada.name) && esPublico) || /^\.env(\.|$)/.test(entrada.name)) prohibidos.push(relativa);
    }
  };
  recorrer(directorio);
  return prohibidos;
}
