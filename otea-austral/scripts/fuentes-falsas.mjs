// Servidor de fuentes falsas (fixtures sintéticos de prueba) para probar la ingesta a mano o desde las e2e: con
// `OTEA_E2E=1` e `INGESTA_URL_PRUEBA=http://127.0.0.1:3297`, cada solicitud de la ingesta ya validada contra el registro
// llega aquí en vez de a internet. `GET /__solicitudes` lista lo recibido. Ver `lib/fuentes-falsas.mjs`.
//
//   PORT=3297 node scripts/fuentes-falsas.mjs
import { crearServidorFuentesFalsas } from "./lib/fuentes-falsas.mjs";

const puerto = Number(process.env.PORT ?? 3297);
if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  console.error("PORT inválido");
  process.exit(1);
}

const servidor = await crearServidorFuentesFalsas({ puerto, exponerSolicitudes: true });
console.log(`Fuentes falsas (fixtures de prueba) escuchando en ${servidor.url}`);

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    void servidor.cerrar().then(() => process.exit(0));
  });
}
