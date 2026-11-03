// Servidor que imita la API de correo de Resend, para las pruebas e2e de las cuentas: no envía nada a nadie. Playwright lo
// levanta junto con la aplicación (`playwright.config.ts`).
//
//   PORT=3298 node scripts/resend-falso.mjs
//
// `GET /__correos?para=persona@example.org` devuelve los correos "enviados" a esa dirección (para leer el enlace) y
// `DELETE /__correos` los borra. Ver `lib/resend-falso.mjs`.
import { crearServidorResendFalso } from "./lib/resend-falso.mjs";

const puerto = Number(process.env.PORT ?? 3298);
if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  console.error("PORT inválido");
  process.exit(1);
}

const servidor = await crearServidorResendFalso({ puerto, exponerCorreos: true });
console.log(`Resend falso escuchando en ${servidor.url}`);

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    void servidor.cerrar().then(() => process.exit(0));
  });
}
