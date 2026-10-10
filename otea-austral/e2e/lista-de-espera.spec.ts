import { expect, test } from "@playwright/test";

// Solo en escritorio: el límite de solicitudes cuenta por IP y ambos proyectos comparten servidor.
test.describe("lista de espera", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio", "Una sola pasada para no agotar el límite por IP.");
  });

  test("valida en el servidor y luego inscribe", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    const correo = page.getByLabel("Tu correo");
    await correo.fill("no-es-correo");
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByText("Escribe un correo válido.")).toBeVisible();
    await expect(page.getByText("Necesitamos tu consentimiento para guardar el correo.")).toBeVisible();
    await expect(correo).toHaveAttribute("aria-invalid", "true");

    await correo.fill("persona.prueba@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByRole("status")).toContainText("Modo de prueba");
  });

  test("el campo trampa no recibe foco", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    await expect(page.locator("#sitio_web")).toHaveAttribute("tabindex", "-1");
  });

  test("un enlace de confirmación inválido se rechaza", async ({ page }) => {
    await page.goto("/lista-de-espera/confirmar?token=abc");
    await expect(page.getByRole("heading", { level: 1, name: "Enlace no válido." })).toBeVisible();
  });
});
