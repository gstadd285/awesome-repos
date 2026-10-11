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
    // La trampa de tiempo descarta los envíos hechos antes de 3 s desde que el servidor generó el formulario.
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByRole("status")).toContainText("Modo de prueba");
  });

  test("un envío con la marca de tiempo falsa o sin ella no inscribe: pide esperar", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    await page.getByLabel("Tu correo").fill("bot@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    const marca = page.locator("input[name=tiempo]");
    await expect(marca).toHaveAttribute("type", "hidden");
    await expect(marca).toHaveValue(/^\d{10,15}\.[A-Za-z0-9_-]{43}$/);

    // Un bot que inventa la marca (aunque sea vieja, con forma válida)...
    await marca.evaluate((el, valor) => ((el as HTMLInputElement).value = valor), `${Date.now() - 60_000}.${"A".repeat(43)}`);
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByRole("status")).toContainText("Espera unos segundos");
    await expect(page.getByRole("status")).not.toContainText("Modo de prueba");

    // ...o que envía el formulario sin el campo.
    await page.getByLabel("Tu correo").fill("bot@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await marca.evaluate((el) => el.remove());
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByRole("status")).toContainText("Espera unos segundos");
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
