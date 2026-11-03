// Completa la salida `standalone` de Next.js: el servidor mínimo (`server.js`) no copia
// `public/` ni `.next/static/` por sí mismo. Después de esto, `.next/standalone` es la
// carpeta autocontenida que corre `npm start` y que se copia a la imagen de contenedor.
//
// Uso: se ejecuta solo al final de `npm run build`.
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, ".next", "standalone");

await rm(path.join(destino, "public"), { recursive: true, force: true });
await rm(path.join(destino, ".next", "static"), { recursive: true, force: true });
await cp(path.join(raiz, "public"), path.join(destino, "public"), { recursive: true });
await cp(path.join(raiz, ".next", "static"), path.join(destino, ".next", "static"), { recursive: true });
console.log("Salida standalone lista: .next/standalone");
