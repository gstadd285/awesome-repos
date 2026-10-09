import { defineConfig, devices } from "@playwright/test";

const PUERTO = 3200;
const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

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
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run start -- -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { WAITLIST_MODE: "memoria", OTEA_E2E: "1" },
  },
});
