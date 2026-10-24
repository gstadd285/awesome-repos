// Genera el secreto maestro de la lista de espera (WAITLIST_SECRETO). Se ejecuta en tu computador, una vez.
//
// Uso: npm run lista:secreto
import { randomBytes } from "node:crypto";

console.log(`
Crea este secreto en el servidor (Secret Manager en Cloud Run; nunca en el repositorio ni en un chat):

WAITLIST_SECRETO=${randomBytes(32).toString("base64url")}

De él se derivan la marca de tiempo del formulario (trampa contra bots) y el cifrado de los correos.
Guarda además una copia fuera de línea (gestor de contraseñas): si se pierde, los correos cifrados ya
guardados no se pueden recuperar. Cambiarlo los deja ilegibles: ver «Rotar el secreto de la lista» en
docs/despliegue.md antes de hacerlo.
`);
