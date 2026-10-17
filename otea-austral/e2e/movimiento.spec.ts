import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * La portada se anima en cualquier pantalla y navegador, no solo en escritorio con Chrome:
 * - ventana estrecha (< 1024 px, p. ej. un panel lateral): las piezas 3D se arman al bajar;
 * - sistema con «reducir movimiento»: aviso, interruptor, recuerdo de la elección;
 * - navegador sin `animation-timeline`: el motor dispara las mismas animaciones al entrar en pantalla;
 * - sin JavaScript: todo se ve completo y quieto.
 * Cada prueba abre su propio contexto (con su ventana), así que solo corre en el proyecto de escritorio
 * (`playwright.config.ts` lo excluye del móvil).
 */

const opacidad = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((e) => Number(getComputedStyle(e).opacity));

/** Pone el borde superior de la pieza (en el diseño, sin transformaciones) a una fracción de la altura de la ventana. */
async function colocar(page: Page, selector: string, fraccion: number) {
  await page.locator(selector).first().evaluate((e, f) => {
    let y = 0;
    for (let el: HTMLElement | null = e as HTMLElement; el; el = el.offsetParent as HTMLElement | null) y += el.offsetTop;
    scrollTo({ top: y - innerHeight * f, behavior: "instant" });
  }, fraccion);
  await page.waitForTimeout(250);
}

/** Emula un navegador sin `animation-timeline`: el CSS no lo reconoce y `CSS.supports` responde que no. */
async function contextoSinTimeline(browser: Browser, ancho = 1280, alto = 800): Promise<BrowserContext> {
  const contexto = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await contexto.route("**/*.css*", async (ruta) => {
    const r = await ruta.fetch();
    const css = (await r.text())
      .replaceAll("animation-timeline", "x-animation-timeline")
      .replaceAll("view-timeline", "x-view-timeline")
      .replaceAll("animation-range", "x-animation-range");
    await ruta.fulfill({ response: r, body: css, headers: { ...r.headers(), "content-type": "text/css" } });
  });
  await contexto.addInitScript(() => {
    const css = CSS as unknown as { supports: (...a: string[]) => boolean };
    const original = css.supports.bind(CSS);
    css.supports = (...a: string[]) => (/animation-timeline/.test(a.join(" ")) ? false : original(...a));
  });
  return contexto;
}

test.describe("ventana estrecha", () => {
  test("las piezas 3D se arman al bajar, ligadas al scroll (sin historia fija)", async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 800, height: 900 } });
    const page = await contexto.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).not.toBe("sticky");

    // Plano técnico: invisible al asomar por abajo y completo antes de llegar a la zona de lectura.
    await colocar(page, ".h-plano", 0.97);
    expect(await opacidad(page, ".h-plano")).toBeLessThan(0.3);
    await colocar(page, ".h-plano", 0.35);
    expect(await opacidad(page, ".h-plano")).toBeCloseTo(1, 2);
    const final = await page.locator(".h-plano").evaluate((e) => getComputedStyle(e).transform);

    // Tablero: lo mismo, y las alertas caen sobre él una tras otra.
    await colocar(page, ".h-tablero", 0.97);
    expect(await opacidad(page, ".h-tablero")).toBeLessThan(0.3);
    expect(await opacidad(page, ".tablero-tarjeta")).toBeLessThan(0.3);
    await colocar(page, ".h-tablero", 0.2);
    expect(await opacidad(page, ".h-tablero")).toBeCloseTo(1, 2);
    const tarjetas = await page.locator(".tablero-tarjeta").evaluateAll((ts) => ts.map((t) => Number(getComputedStyle(t).opacity)));
    expect(tarjetas).toHaveLength(9);
    expect(Math.min(...tarjetas)).toBeCloseTo(1, 2);

    // Al subir otra vez, la pieza se desarma (es reversible) y al volver a bajar recupera su pose final.
    await colocar(page, ".h-plano", 0.97);
    expect(await opacidad(page, ".h-plano")).toBeLessThan(0.3);
    await colocar(page, ".h-plano", 0.35);
    expect(await page.locator(".h-plano").evaluate((e) => getComputedStyle(e).transform)).toBe(final);
    await contexto.close();
  });

  test("en teléfono, las piezas se arman igual y no hay scroll horizontal", async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await contexto.newPage();
    await page.goto("/");
    await colocar(page, ".h-tablero", 0.97);
    expect(await opacidad(page, ".h-tablero")).toBeLessThan(0.3);
    await colocar(page, ".h-tablero", 0.25);
    expect(await opacidad(page, ".h-tablero")).toBeCloseTo(1, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await contexto.close();
  });
});

test.describe("sistema con «reducir movimiento»", () => {
  test("se explica por qué todo está quieto, se puede activar, se recuerda y se puede revertir", async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-movimiento", "reducido");
    await expect(html).toHaveAttribute("data-sistema", "reduce");

    // Quieto y completo, con un aviso que explica por qué y ofrece activarlo.
    const aviso = page.locator(".aviso-mov");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("Tu dispositivo pide menos movimiento");
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).toBe("static");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // Activarlo: aparece la historia fija y las animaciones corren; el aviso desaparece.
    await aviso.getByRole("button", { name: "Ver con animaciones" }).click();
    await expect(html).toHaveAttribute("data-movimiento", "completo");
    await expect(aviso).toBeHidden();
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(50);

    // Se recuerda al recargar.
    await page.reload();
    await expect(html).toHaveAttribute("data-movimiento", "completo");
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).toBe("sticky");

    // Y se revierte desde el pie, que es un interruptor de dos estados.
    const interruptor = page.getByRole("button", { name: /^Animaciones/ });
    await interruptor.scrollIntoViewIfNeeded();
    await expect(interruptor).toHaveAttribute("aria-pressed", "true");
    await interruptor.click();
    await expect(html).toHaveAttribute("data-movimiento", "reducido");
    await expect(interruptor).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("otea-movimiento"))).toBeNull();
    // Quedan, a lo sumo, las transiciones de color del propio botón que ya estaban en curso al pulsarlo.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await contexto.close();
  });

  test("sin la preferencia del sistema no aparece ni el aviso ni el interruptor", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    await expect(page.locator(".aviso-mov")).toBeHidden();
    await expect(page.locator(".mov-conmutador")).toBeHidden();
  });
});

test.describe("navegador sin animation-timeline", () => {
  test("el texto y las piezas 3D se animan una vez al entrar en pantalla", async ({ browser }) => {
    const contexto = await contextoSinTimeline(browser);
    const page = await contexto.newPage();
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-timeline", "no");
    await expect(html).toHaveAttribute("data-motor", "listo");
    // No hay historia fija: las piezas se apilan.
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).toBe("static");

    // Un texto que aún no ha entrado en pantalla espera tenue; al llegar se anima y termina completo.
    const titular = page.getByRole("heading", { name: "Así se ve una alerta." });
    expect(await titular.evaluate((e) => e.classList.contains("kx-visto"))).toBe(false);
    expect(await titular.evaluate((e) => Math.abs(new DOMMatrix(getComputedStyle(e.querySelector(".kx-p")!).transform).f))).toBeGreaterThan(5);
    await titular.evaluate((e) => scrollTo({ top: e.getBoundingClientRect().top + scrollY - innerHeight * 0.6, behavior: "instant" }));
    await expect(titular).toHaveClass(/kx-visto/);
    await expect
      .poll(() => titular.evaluate((e) => [...e.querySelectorAll(".kx-p")].every((p) => new DOMMatrix(getComputedStyle(p).transform).f === 0)))
      .toBe(true);

    // Las piezas 3D: ocultas hasta llegar, y completas después.
    expect(await opacidad(page, ".h-plano")).toBe(0);
    await colocar(page, ".h-plano", 0.5);
    await expect(page.locator(".h-plano")).toHaveClass(/escena-vista/);
    await expect.poll(() => opacidad(page, ".h-plano")).toBeCloseTo(1, 2);
    await colocar(page, ".h-tablero", 0.4);
    await expect(page.locator(".h-tablero")).toHaveClass(/escena-vista/);
    await expect
      .poll(() => page.locator(".tablero-tarjeta").evaluateAll((ts) => Math.min(...ts.map((t) => Number(getComputedStyle(t).opacity)))))
      .toBeCloseTo(1, 2);
    await contexto.close();
  });

  test("lo que ya está a la vista al cargar no parpadea (no se oculta ni se vuelve a animar)", async ({ browser }) => {
    // Ventana muy alta: el primer paso de la historia ya está a la vista al arrancar el motor.
    const contexto = await contextoSinTimeline(browser, 1280, 3200);
    const page = await contexto.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motor", "listo");
    const titular = page.getByRole("heading", { name: "Verificamos antes de avisar." });
    await expect(titular).toBeInViewport();
    await expect(titular).toHaveClass(/mov-quieto/);
    expect(await titular.evaluate((e) => [...e.querySelectorAll(".kx-p")].every((p) => new DOMMatrix(getComputedStyle(p).transform).f === 0))).toBe(true);
    expect(await titular.evaluate((e) => e.getAnimations({ subtree: true }).length)).toBe(0);
    await contexto.close();
  });

  test("con «reducir movimiento» no se oculta ni se anima nada", async ({ browser }) => {
    const contexto = await contextoSinTimeline(browser);
    const page = await contexto.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
    await expect(page.locator("html")).not.toHaveAttribute("data-motor", /.+/);
    expect(await opacidad(page, ".h-plano")).toBe(1);
    expect(await opacidad(page, ".h-tablero")).toBe(1);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await contexto.close();
  });
});

test.describe("sin JavaScript", () => {
  test("la portada se ve completa y quieta", async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const page = await contexto.newPage();
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-movimiento", /.+/);
    await expect(page.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeVisible();
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).toBe("static");
    for (const clase of [".h-paso-2", ".h-paso-3", ".h-paso-4", ".h-plano", ".h-tablero"]) {
      expect(await opacidad(page, clase), clase).toBe(1);
    }
    await expect(page.getByRole("heading", { name: "Tu panel antes de la apertura." })).toBeVisible();
    await expect(page.locator(".aviso-mov")).toBeHidden();
    await contexto.close();
  });
});
