// Genera el secreto maestro de las cuentas (CUENTAS_SECRETO). Se ejecuta en tu computador, una vez.
//
// Uso: npm run cuentas:secreto
import { randomBytes } from "node:crypto";

console.log(`
Crea este secreto en el servidor (Secret Manager en Cloud Run; nunca en el repositorio ni en un chat):

CUENTAS_SECRETO=${randomBytes(32).toString("base64url")}

De él se derivan las claves que cifran el correo de cada cuenta y el secreto de su verificación en dos pasos, el
índice con que se busca un correo sin guardarlo en claro y el token anti-CSRF de las sesiones.

· Debe ser distinto de WAITLIST_SECRETO y de ADMIN_SESION_SECRETO: cada secreto protege una sola cosa.
· Guarda además una copia fuera de línea (gestor de contraseñas): si se pierde, nadie puede entrar a su cuenta
  (el correo y el secreto de los dos pasos quedan ilegibles). Cambiarlo tiene el mismo efecto: no lo rotes sin
  leer «Cuentas» en docs/despliegue.md.
`);
