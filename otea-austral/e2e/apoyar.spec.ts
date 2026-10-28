import { expect, test } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";
import { DONACIONES_URL_PRUEBA, URL_IA } from "./puertos";

/**
 * Aportes por Mercado Pago (`/apoyar`, `docs/despliegue.md` §15). Activos en la segunda instancia (3201) con un link **de
 * prueba** de un dominio permitido (`DONACIONES_URL_PRUEBA`, nunca se abre: la pestaña de Mercado Pago se responde aquí);
 * apagados en la principal (3200), donde el apartado no aparece en ninguna parte.
 */

const PAGINA_FALSA = "<!doctype html><title>Mercado Pago (prueba)</title><p>Página de prueba: no es Mercado Pago.";

test.describe("con el apartado activo (3201)", () => {
  test("/apoyar dice en qué se usa, qué no da, impuestos, reembolsos y datos de pago, y nada sale del sitio", async ({ page }) => {
    const errores = vigilarErrores(page);
    const ajenos: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(URL_IA) && !r.url().startsWith("data:")) ajenos.push(r.url());
    });
    const r = await page.goto(`${URL_IA}/apoyar`);
    expect(r?.status()).toBe(200);
    await expect(page).toHaveTitle(/Apoyar el proyecto/);
    await expect(page.getByRole("heading", { level: 1, name: "Apoyar el proyecto." })).toBeVisible();
    for (const titulo of ["En qué se usa", "Lo que el aporte no da", "Impuestos y reembolsos", "Tus datos de pago", "Hacer un aporte"]) {
      await expect(page.getByRole("heading", { level: 2, name: titulo })).toBeVisible();
    }
    const cuerpo = page.locator("main .apartados");
    // Solo cifras reales del proyecto, rotuladas como estimadas.
    await expect(cuerpo).toContainText("Son cifras estimadas, en dólares");
    await expect(cuerpo).toContainText("~US$ 12 al año");
    await expect(cuerpo).toContainText("un tope duro de US$ 5 al mes");
    for (const concepto of ["Dominio", "Servidores y base de datos", "Correo", "Inteligencia artificial"]) {
      await expect(cuerpo.locator("li strong", { hasText: concepto })).toBeVisible();
    }
    await expect(cuerpo).toContainText("El aporte es voluntario. No da acceso a recomendaciones, prioridad ni trato preferente");
    await expect(cuerpo).toContainText("Otea entrega información y análisis. No constituye asesoría financiera");
    await expect(cuerpo).toContainText("El aporte no es deducible de impuestos.");
    await expect(cuerpo).toContainText("se rige por las condiciones de Mercado Pago");
    await expect(cuerpo).toContainText("Otea Austral no recibe ni guarda tus datos de pago");
    await expect(page.getByRole("note")).toContainText("el pago ocurre en Mercado Pago");

    // La pieza es decorativa y repite las cifras del texto.
    const pieza = page.locator(".int-pieza svg");
    await expect(pieza).toHaveAttribute("aria-hidden", "true");
    await expect(pieza).toContainText("CIFRAS ESTIMADAS");

    // Un solo enlace hacia afuera: el botón de latón, a otra pestaña, sin opener ni referer.
    const enlace = page.getByRole("link", { name: "Aportar en Mercado Pago (se abre en una pestaña nueva)" });
    await expect(enlace).toHaveAttribute("href", DONACIONES_URL_PRUEBA);
    await expect(enlace).toHaveAttribute("target", "_blank");
    await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    await expect(enlace).toHaveClass(/boton-laton/);
    expect((await enlace.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const afuera = await page.locator("main a[href^='http']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(afuera).toEqual([DONACIONES_URL_PRUEBA]);

    // Ni scripts ni marcos de terceros: la página no pidió nada fuera del sitio.
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(await page.locator("script[src]").evaluateAll((ss) => ss.filter((s) => !(s as HTMLScriptElement).src.startsWith(location.origin)).length)).toBe(0);
    expect(ajenos).toEqual([]);
    expect(await sinScrollHorizontal(page)).toBe(true);
    expect(errores).toEqual([]);
  });

  test("el botón abre Mercado Pago en otra pestaña sin acceso a la página ni a su dirección (respondida aquí, sin red)", async ({ page, context }) => {
    const pedidos: Record<string, string>[] = [];
    await context.route(`${DONACIONES_URL_PRUEBA}**`, async (ruta) => {
      pedidos.push(ruta.request().headers());
      await ruta.fulfill({ contentType: "text/html; charset=utf-8", body: PAGINA_FALSA });
    });
    await page.goto(`${URL_IA}/apoyar`);
    const [pestana] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: /Aportar en Mercado Pago/ }).click(),
    ]);
    await pestana.waitForLoadState();
    expect(pestana.url()).toBe(DONACIONES_URL_PRUEBA);
    expect(await pestana.evaluate(() => window.opener)).toBeNull();
    expect(await pestana.evaluate(() => document.referrer)).toBe("");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].referer).toBeUndefined();
    // La página de Otea sigue donde estaba.
    await expect(page).toHaveURL(`${URL_IA}/apoyar`);
    await pestana.close();
  });

  test("«Apoyar el proyecto», discreto, en el pie y en el menú del teléfono; /apoyar en el mapa del sitio", async ({ page, request }) => {
    await page.goto(`${URL_IA}/metodologia`);
    const pie = page.locator("footer").getByRole("link", { name: "Apoyar el proyecto" });
    await expect(pie).toHaveAttribute("href", "/apoyar");
    expect((await pie.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // El menú del teléfono es un popover cerrado (fuera del árbol de accesibilidad) hasta que se abre.
    await expect(page.locator("#menu-movil a[href='/apoyar']")).toHaveText("Apoyar el proyecto");
    if (page.viewportSize()!.width < 1024) {
      await page.getByRole("button", { name: "Menú" }).click();
      const menu = page.locator("#menu-movil").getByRole("link", { name: "Apoyar el proyecto" });
      await expect(menu).toBeVisible();
      expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await menu.click();
      await expect(page).toHaveURL(`${URL_IA}/apoyar`);
      await expect(page.getByRole("heading", { level: 1, name: "Apoyar el proyecto." })).toBeVisible();
      // En la página, el menú la marca como actual.
      await expect(page.locator("#menu-movil a[href='/apoyar']")).toHaveAttribute("aria-current", "page");
    }
    expect(await (await request.get(`${URL_IA}/sitemap.xml`)).text()).toContain("/apoyar</loc>");
  });

  test("con movimiento reducido, /apoyar queda quieta y completa", async ({ browser }, info) => {
    test.skip(info.project.name !== "escritorio", "abre sus propias ventanas");
    for (const ventana of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const contexto = await browser.newContext({ viewport: ventana, reducedMotion: "reduce" });
      const page = await contexto.newPage();
      await page.goto(`${URL_IA}/apoyar`);
      await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
      await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
      await expect(page.getByRole("link", { name: /Aportar en Mercado Pago/ })).toBeVisible();
      expect(await sinScrollHorizontal(page)).toBe(true);
      await contexto.close();
    }
  });
});

test.describe("apagado (3200, sin DONACIONES_URL)", () => {
  test("/apoyar responde 404 con la página propia y sin rastro del apartado", async ({ page, request }) => {
    const r = await page.goto("/apoyar");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Esta ruta no aparece en el horizonte." })).toBeVisible();
    await expect(page).not.toHaveTitle(/Apoyar/);
    expect(await page.content()).not.toMatch(/Apoyar el proyecto|Mercado Pago|mercadopago|mpago/i);
    // También el flujo de React Server Components (lo que pide el navegador al navegar): trae la 404, sin nada del apartado.
    const rsc = await request.get("/apoyar", { headers: { RSC: "1" } });
    const flujo = await rsc.text();
    expect(flujo).toContain("Esta ruta no aparece en el horizonte.");
    expect(flujo).not.toMatch(/Apoyar el proyecto|mercadopago|mpago/i);
  });

  test("ningún enlace lleva a /apoyar: ni el pie, ni el menú del teléfono, ni el mapa del sitio", async ({ page, request }) => {
    for (const ruta of ["/", "/metodologia", "/privacidad", "/no-existe"]) {
      await page.goto(ruta);
      await expect(page.locator("a[href*='/apoyar']"), ruta).toHaveCount(0);
      expect(await page.content(), ruta).not.toMatch(/Apoyar el proyecto|\/apoyar|mercadopago|mpago/i);
    }
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/apoyar");
  });
});
