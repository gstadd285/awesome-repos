import { pbkdf2Sync, randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { base32 } from "./scripts/lib/credenciales.mjs";

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
    // El panel es una herramienta interna de escritorio: se prueba una vez.
    { name: "movil", use: { ...devices["Pixel 7"] }, testIgnore: /admin/ },
  ],
  webServer: {
    command: `npm run start -- -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { WAITLIST_MODE: "memoria", OTEA_E2E: "1", ...panel },
  },
});
