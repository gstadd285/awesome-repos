import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** El aviso del formulario. La portada tiene otras regiones de estado (la del asistente): se busca solo en la lista. */
const estadoDeLaLista = (page: Page) => page.locator("#lista-de-espera").getByRole("status");

// Solo en escritorio (una sola pasada). Cada prueba usa su propia IP (`fixtures.ts`): el límite de la lista cuenta por
// IP (5 inscripciones cada 10 minutos) y los servidores se reutilizan entre corridas locales.
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
    await expect(page.getByText("Para inscribirte necesitas aceptar las condiciones de uso.")).toBeVisible();
    await expect(correo).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/Acepto las condiciones de uso/)).toHaveAttribute("aria-invalid", "true");
    // El error no borra lo escrito (React vacía el formulario al terminar la acción: el servidor devuelve los valores).
    await expect(correo).toHaveValue("no-es-correo");

    // Cada texto se acepta por separado: con solo uno marcado, el otro sigue pidiéndose.
    await correo.fill("persona.prueba@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(page.getByText("Para inscribirte necesitas aceptar las condiciones de uso.")).toBeVisible();
    await expect(page.getByText("Necesitamos tu consentimiento para guardar el correo.")).toHaveCount(0);
    // Sigue puesto el correo y marcada la casilla que sí se había aceptado: solo falta la otra.
    await expect(correo).toHaveValue("persona.prueba@example.org");
    await expect(page.getByLabel(/Acepto que Otea guarde mi correo/)).toBeChecked();

    await page.getByLabel(/Acepto las condiciones de uso/).check();
    // La trampa de tiempo descarta los envíos hechos antes de 3 s desde que el servidor generó el formulario.
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(estadoDeLaLista(page)).toContainText("Modo de prueba");
    // El segundo paso es el actual: confirmar desde el correo.
    const pasos = page.getByRole("list", { name: "La inscripción se verifica en dos pasos" });
    await expect(pasos.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
    await expect(pasos.getByRole("listitem").nth(0)).not.toHaveAttribute("aria-current", "step");
    // Recogido en el check, el botón ya no reenvía, y el foco (que soltó al desactivarse mientras esperaba) está en el aviso.
    await expect(page.getByRole("button", { name: "Unirme a la lista" })).toHaveAttribute("aria-disabled", "true");
    await expect(estadoDeLaLista(page)).toBeFocused();
  });

  test("explica la verificación en dos pasos y resume las condiciones de uso antes de enviar", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    const pasos = page.getByRole("list", { name: "La inscripción se verifica en dos pasos" });
    await expect(pasos.getByRole("listitem")).toHaveCount(2);
    await expect(pasos.getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step");
    await expect(pasos).toContainText("Deja tu correo y acepta los textos");
    await expect(pasos).toContainText("Confirma desde el enlace que te enviamos");

    const apartado = page.getByRole("group", { name: "Antes de enviar" });
    await expect(apartado.getByLabel(/Acepto las condiciones de uso/)).not.toBeChecked();
    await expect(apartado.getByLabel(/Acepto que Otea guarde mi correo/)).not.toBeChecked();
    // El resumen está plegado y se abre con el teclado.
    const resumen = apartado.getByText("Lo esencial de las condiciones de uso");
    await expect(apartado.getByText("No constituye asesoría financiera.")).toBeHidden();
    await resumen.focus();
    await page.keyboard.press("Enter");
    await expect(apartado.getByText("No constituye asesoría financiera.")).toBeVisible();
    await expect(apartado.getByRole("link", { name: "Leer las condiciones de uso completas" })).toHaveAttribute("href", "/terminos");
  });

  test("un envío con la marca de tiempo falsa o sin ella no inscribe: pide esperar", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    await page.getByLabel("Tu correo").fill("bot@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    const marca = page.locator("input[name=tiempo]");
    await expect(marca).toHaveAttribute("type", "hidden");
    await expect(marca).toHaveValue(/^\d{10,15}\.[A-Za-z0-9_-]{43}$/);

    // Un bot que inventa la marca (aunque sea vieja, con forma válida)...
    await marca.evaluate((el, valor) => ((el as HTMLInputElement).value = valor), `${Date.now() - 60_000}.${"A".repeat(43)}`);
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(estadoDeLaLista(page)).toContainText("Espera unos segundos");
    await expect(estadoDeLaLista(page)).not.toContainText("Modo de prueba");

    // ...o que envía el formulario sin el campo.
    await page.getByLabel("Tu correo").fill("bot@example.org");
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await marca.evaluate((el) => el.remove());
    await page.getByRole("button", { name: "Unirme a la lista" }).click();
    await expect(estadoDeLaLista(page)).toContainText("Espera unos segundos");
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
