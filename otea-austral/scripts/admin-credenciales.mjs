// Genera las credenciales del panel /admin. Se ejecuta en tu computador, una
// vez (o para rotarlas): muestra la frase y el secreto TOTP solo aquí.
//
// Uso: npm run admin:credenciales [-- alias]
import {
  generarFrase,
  generarSecretoSesion,
  generarSecretoTotp,
  hashearFrase,
  uriTotp,
} from "./lib/credenciales.mjs";

const alias = process.argv[2] ?? "admin";
if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(alias)) {
  console.error("Alias inválido: minúsculas, dígitos, punto, guion o guion bajo (sin correos).");
  process.exit(1);
}

const frase = generarFrase();
const totp = generarSecretoTotp();
const hash = await hashearFrase(frase);

console.log(`
1) Guarda esta frase en tu gestor de contraseñas. No se vuelve a mostrar y no se guarda en ninguna parte:

   ${frase}

2) Agrega la cuenta en tu app de autenticación (Google Authenticator, 1Password, Aegis…),
   con la clave manual o con esta URI:

   Clave: ${totp}
   URI:   ${uriTotp(totp, alias)}

3) Crea estos secretos en el servidor (Secret Manager en Cloud Run; nunca en el repositorio):

ADMIN_CLAVE_HASH=${hash}
ADMIN_TOTP_SECRETO=${totp}
ADMIN_SESION_SECRETO=${generarSecretoSesion()}
ADMIN_ALIAS=${alias}

Para rotarlas, vuelve a ejecutar este comando y reemplaza los cuatro valores: las sesiones abiertas se cierran.
`);
