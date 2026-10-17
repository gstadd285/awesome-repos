// Servidor que imita la API de mensajes de Anthropic, para las pruebas e2e del asistente con IA: no llama a nadie ni
// gasta nada. Playwright lo levanta junto con la segunda instancia de la aplicación (`playwright.config.ts`).
//
//   PORT=3299 node scripts/anthropic-falso.mjs
//
// Responde según marcas escritas en la pregunta (ZZERROR, ZZLIMITE, ZZRECHAZO, ZZPROHIBIDA,
// ZZENLACE, ZZLENTA); sin marcas repite con fidelidad las primeras frases del contexto. `GET /__solicitudes` resume lo
// recibido, para que las pruebas comprueben qué llegó (y qué no) al «proveedor». Ver `lib/anthropic-falso.mjs`.
import { crearServidorAnthropicFalso } from "./lib/anthropic-falso.mjs";

const puerto = Number(process.env.PORT ?? 3299);
if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  console.error("PORT inválido");
  process.exit(1);
}

const servidor = await crearServidorAnthropicFalso({ puerto, exponerSolicitudes: true });
console.log(`Anthropic falso escuchando en ${servidor.url}`);

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    void servidor.cerrar().then(() => process.exit(0));
  });
}
