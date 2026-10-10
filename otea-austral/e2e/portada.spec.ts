import { expect, test } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

test.describe("portada", () => {
  test("carga sin errores ni violaciones de la CSP", async ({ page }) => {
    const errores = vigilarErrores(page);
    const respuesta = await page.goto("/");
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeVisible();
    await page.waitForTimeout(500);
    expect(errores).toEqual([]);
  });

  test("envía cabeceras de seguridad con CSP estricta", async ({ page }) => {
    const respuesta = await page.goto("/");
    const cabeceras = respuesta!.headers();
    const csp = cabeceras["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(cabeceras["x-frame-options"]).toBe("DENY");
    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
  });

  test("el primer Tab lleva a «Saltar al contenido»", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const salto = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(salto).toBeFocused();
    await expect(salto).toBeVisible();
  });

  test("la historia se puede saltar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Descubre más/ }).click();
    await expect(page).toHaveURL(/#temas$/);
    await expect(page.getByRole("heading", { name: "Seis frentes que vigilamos." })).toBeInViewport();
  });

  test("no hay scroll horizontal", async ({ page }) => {
    await page.goto("/");
    expect(await sinScrollHorizontal(page)).toBe(true);
  });

  test("«Tus temas» responde (la hidratación funciona bajo la CSP)", async ({ page }) => {
    await page.goto("/");
    const energia = page.getByRole("button", { name: /Energía/ });
    await energia.scrollIntoViewIfNeeded();
    await expect(energia).toHaveAttribute("aria-pressed", "false");
    await energia.click();
    await expect(energia).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Recibirías alertas de: Energía/)).toBeVisible();
  });

  test("las fuentes de una alerta se abren con el teclado", async ({ page }) => {
    await page.goto("/");
    const resumen = page.locator("#alerta-ejemplo-ormuz summary");
    await resumen.scrollIntoViewIfNeeded();
    await resumen.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#alerta-ejemplo-ormuz details")).toHaveAttribute("open", "");
    const enlace = page.locator("#alerta-ejemplo-ormuz details a").first();
    await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    await expect(enlace).toHaveAttribute("target", "_blank");
  });
});

test.describe("movimiento", () => {
  test("con movimiento reducido todo el contenido queda visible y quieto", async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    await page.goto("/");
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).not.toBe("sticky");
    for (const titulo of ["Verificamos antes de avisar.", "Tu panel antes de la apertura."]) {
      const h = page.getByRole("heading", { name: titulo });
      await h.scrollIntoViewIfNeeded();
      expect(await h.evaluate((e) => getComputedStyle(e.closest("section")!).opacity)).toBe("1");
    }
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    await contexto.close();
  });

  test("en escritorio la historia queda fija y avanza con el scroll", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    const escenario = page.locator(".historia-escenario");
    expect(await escenario.evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
    const paso3 = page.locator(".h-paso-3");
    expect(Number(await paso3.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.1);
    // Mitad del recorrido: paso 3 (impacto) a la vista.
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>(".historia")!;
      const inicio = s.offsetTop;
      window.scrollTo({ top: inicio + 0.63 * (s.offsetHeight - innerHeight), behavior: "instant" });
    });
    await expect.poll(async () => Number(await paso3.evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
  });
});
