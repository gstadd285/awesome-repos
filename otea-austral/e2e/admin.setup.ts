import { expect, test as preparar } from "@playwright/test";
import { codigoTotp, decodificarBase32, pasoTotp } from "../src/lib/admin/totp";
import { SESION_ADMIN } from "./ayudas";

/** Código TOTP vigente para las credenciales generadas por playwright.config.ts. */
function codigoActual(): string {
  return codigoTotp(decodificarBase32(process.env.E2E_ADMIN_TOTP ?? ""), pasoTotp(Date.now()));
}

preparar("entrar al panel con frase y código", async ({ page }) => {
  preparar.skip(!process.env.DATABASE_URL, "Sin base de datos no hay panel.");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Acceso al panel." })).toBeVisible();
  await page.getByLabel("Frase de acceso").fill(process.env.E2E_ADMIN_FRASE ?? "");
  await page.getByLabel("Código de tu app de autenticación").fill(codigoActual());
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/alertas$/);

  const [cookie] = (await page.context().cookies()).filter((c) => c.name === "__Host-otea_admin");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  await page.context().storageState({ path: SESION_ADMIN });
});
