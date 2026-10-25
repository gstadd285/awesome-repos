import { pbkdf2Sync, randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { CLAVE_FALSA } from "./scripts/lib/anthropic-falso.mjs";
import { base32 } from "./scripts/lib/credenciales.mjs";
import { CLAVE_RESEND_FALSA } from "./scripts/lib/resend-falso.mjs";
import { PUERTO_API_FALSA, PUERTO_CORREO, PUERTO_IA, URL_CORREO } from "./e2e/puertos";

const PUERTO = 3200;
const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

/**
 * Con DATABASE_URL (Postgres migrado, usuario de la aplicación) también se
 * prueba el panel interno. Sus credenciales se generan al azar en cada
 * corrida: no hay secretos en el repositorio. Los workers heredan estas
 * variables del proceso principal.
 */
const hayBase = Boolean(process.env.DATABASE_URL);
if (process.env.CI && !hayBase) {
  throw new Error("En la CI las pruebas e2e necesitan DATABASE_URL (Postgres de servicio).");
}
if (hayBase && !process.env.E2E_ADMIN_HASH) {
  const frase = randomBytes(18).toString("base64url");
  const sal = randomBytes(16);
  const hash = pbkdf2Sync(frase, sal, 600_000, 32, "sha256");
  process.env.E2E_ADMIN_FRASE = frase;
  process.env.E2E_ADMIN_HASH = `pbkdf2-sha256$600000$${sal.toString("base64url")}$${hash.toString("base64url")}`;
  process.env.E2E_ADMIN_TOTP = base32(randomBytes(20));
  process.env.E2E_ADMIN_SESION = randomBytes(32).toString("base64url");
}

/**
 * Con base de datos, la aplicación principal también abre las cuentas de personas usuarias: con Postgres de verdad y el
 * correo yendo a un servidor que imita a Resend (nada sale a internet). El secreto se genera al azar en cada corrida.
 * El tope diario de correos se sube al máximo: las pruebas envían muchos más de los 20 de la configuración normal.
 */
if (hayBase && !process.env.E2E_CUENTAS_SECRETO) process.env.E2E_CUENTAS_SECRETO = randomBytes(32).toString("base64url");
const cuentas: Record<string, string> = hayBase
  ? {
      CUENTAS_MODO: "abiertas",
      CUENTAS_SECRETO: process.env.E2E_CUENTAS_SECRETO!,
      CUENTAS_ENVIOS_DIARIOS: "5000",
      RESEND_API_KEY: CLAVE_RESEND_FALSA,
      RESEND_URL_API_PRUEBA: `${URL_CORREO}/emails`,
    }
  : {};

/**
 * Con base de datos, la segunda instancia (3201) hace además de servicio de tareas (`TAREAS_MODO=activo`, como
 * `otea-tareas`): la ingesta corre de verdad contra el registro, que hoy no tiene feeds verificados, así que no sale a
 * internet. El secreto del encabezado `X-Otea-Tarea` se genera al azar en cada corrida.
 */
if (hayBase && !process.env.E2E_TAREAS_SECRETO) process.env.E2E_TAREAS_SECRETO = randomBytes(32).toString("base64url");
const tareas: Record<string, string> = hayBase
  ? { TAREAS_MODO: "activo", TAREAS_SECRETO: process.env.E2E_TAREAS_SECRETO!, INGESTA_CONTACTO: "mailto:ingesta@example.org" }
  : {};

const panel: Record<string, string> = hayBase
  ? {
      ADMIN_CLAVE_HASH: process.env.E2E_ADMIN_HASH!,
      ADMIN_TOTP_SECRETO: process.env.E2E_ADMIN_TOTP!,
      ADMIN_SESION_SECRETO: process.env.E2E_ADMIN_SESION!,
      ADMIN_ALIAS: "e2e",
    }
  : {};

/**
 * Pruebas de navegador sobre el build de producción (`npm run build` antes).
 * La lista de espera corre en memoria solo para estas pruebas (OTEA_E2E=1).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    trace: "retain-on-failure",
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  projects: [
    { name: "preparar-admin", testMatch: /admin\.setup\.ts/ },
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: hayBase ? ["preparar-admin"] : [],
    },
    // El panel es una herramienta interna de escritorio: se prueba una vez. Las pruebas de movimiento abren
    // sus propias ventanas (estrecha, teléfono, sin soporte…): tampoco se repiten en el móvil.
    { name: "movil", use: { ...devices["Pixel 7"] }, testIgnore: /admin|movimiento\.spec|tareas\.spec/ },
  ],
  webServer: [
    {
      // El mismo servidor que corre en el contenedor: `node .next/standalone/server.js`.
      command: "npm run start",
      url: `http://localhost:${PUERTO}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: String(PUERTO), HOSTNAME: "127.0.0.1", WAITLIST_MODE: "memoria", OTEA_E2E: "1", ...panel, ...cuentas },
    },
    {
      // Imita la API de Resend: los correos de las cuentas «llegan» aquí y las pruebas leen el enlace que traen.
      command: "node scripts/resend-falso.mjs",
      port: PUERTO_CORREO,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PORT: String(PUERTO_CORREO) },
    },
    {
      // Imita la API de Anthropic (solo lo que usa el asistente): el asistente con IA se prueba sin red y sin gasto.
      command: "node scripts/anthropic-falso.mjs",
      port: PUERTO_API_FALSA,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PORT: String(PUERTO_API_FALSA) },
    },
    {
      // Segunda instancia, con el asistente en modo IA apuntando al servidor falso (solo se admite con OTEA_E2E=1) y, con
      // base de datos, las tareas activas.
      // Cada día de tope y de llamadas se deja muy por encima de lo que gastan las pruebas, incluso repetidas.
      command: "npm run start",
      url: `http://localhost:${PUERTO_IA}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(PUERTO_IA),
        HOSTNAME: "127.0.0.1",
        WAITLIST_MODE: "memoria",
        OTEA_E2E: "1",
        ASISTENTE_MODO: "ia",
        ANTHROPIC_API_KEY: CLAVE_FALSA,
        ASISTENTE_MODELO: "claude-haiku-5-5",
        ASISTENTE_PRECIO_ENTRADA: "0.1",
        ASISTENTE_PRECIO_SALIDA: "0.5",
        ASISTENTE_TOPE_DIARIO_USD: "10",
        ASISTENTE_LLAMADAS_DIARIAS: "10000",
        ASISTENTE_URL_API_PRUEBA: `http://127.0.0.1:${PUERTO_API_FALSA}`,
        ...tareas,
      },
    },
  ],
});
