import { expect, test, type Locator, type Page } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

/**
 * Oficio de la interfaz (rediseño «Horizonte», T1): botón magnético con puerta, foco que aterriza, salto al
 * contenido de 44 px, bucles que se pausan fuera de vista, ningún scroll lateral de 320 a 1920 y ninguna
 * violación de la CSP. Las pruebas que abren sus propias ventanas solo corren en el proyecto de escritorio.
 */

const RUTAS = [
  "/",
  "/metodologia",
  "/fuentes",
  "/alertas",
  "/seguridad",
  "/terminos",
  "/privacidad",
  "/aviso-legal",
  "/cuenta/entrar",
  "/no-existe",
] as const;

const ANCHOS = [320, 390, 768, 1024, 1440, 1920] as const;

const soloEscritorio = (nombre: string) => test.skip(nombre !== "escritorio", "abre sus propias ventanas");

/** `translate` calculado, como dos números en px (`none` → 0, 0). */
async function desplazamiento(el: Locator): Promise<{ crudo: string; x: number; y: number }> {
  const crudo = await el.evaluate((e) => getComputedStyle(e).translate);
  const [x = 0, y = 0] = crudo === "none" ? [] : crudo.split(" ").map((v) => Number.parseFloat(v));
  return { crudo, x, y };
}

/** La CTA principal del héroe, ya entrada (su bloque aparece a los ~1,4 s). */
async function ctaDelHeroe(page: Page): Promise<Locator> {
  const cta = page.locator(".hero-acciones").getByRole("link", { name: "Recibir alertas" });
  await expect(cta).toBeVisible();
  await page.waitForTimeout(1700);
  return cta;
}

test.describe("botón de latón magnético", () => {
  test("con la puerta abierta y un ratón, la CTA se acerca al cursor (hasta 4 px) y vuelve al salir", async ({
    page,
  }, info) => {
    soloEscritorio(info.project.name);
    const errores = vigilarErrores(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    const cta = await ctaDelHeroe(page);
    await expect(cta).toHaveAttribute("data-magnetico");
    await expect(cta).toHaveClass(/boton-laton/);

    const caja = (await cta.boundingBox())!;
    await page.mouse.move(caja.x + caja.width * 0.95, caja.y + caja.height * 0.5, { steps: 4 });
    await expect.poll(async () => (await desplazamiento(cta)).x).toBeGreaterThan(1);
    const cerca = await desplazamiento(cta);
    expect(Math.abs(cerca.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(cerca.y)).toBeLessThanOrEqual(4);
    // La variable la escribe la isla por CSSOM (nunca un atributo `style` del servidor).
    expect(await cta.evaluate((e) => e.style.getPropertyValue("--tx"))).not.toBe("");

    await page.mouse.move(4, 880, { steps: 3 });
    await expect.poll(async () => cta.evaluate((e) => e.style.getPropertyValue("--tx"))).toBe("");
    await expect.poll(async () => Math.abs((await desplazamiento(cta)).x), { timeout: 3000 }).toBeLessThan(0.05);
    expect(errores).toEqual([]);
  });

  test("con la puerta cerrada, la CTA no se mueve aunque el ratón pase por encima", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
    const cta = page.locator(".hero-acciones").getByRole("link", { name: "Recibir alertas" });
    const caja = (await cta.boundingBox())!;
    for (const f of [0.1, 0.5, 0.95]) {
      await page.mouse.move(caja.x + caja.width * f, caja.y + caja.height * 0.8, { steps: 3 });
      await page.waitForTimeout(120);
      expect((await desplazamiento(cta)).crudo).toBe("none");
    }
    expect(await cta.evaluate((e) => e.style.length)).toBe(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 }).toBe(0);
    await contexto.close();
  });

  test("al cerrar la puerta con el cursor encima, se borran las variables y nada queda desplazado", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/");
    await page.locator(".aviso-mov").getByRole("button", { name: "Ver con animaciones" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    const cta = await ctaDelHeroe(page);
    const caja = (await cta.boundingBox())!;
    await page.mouse.move(caja.x + caja.width * 0.9, caja.y + caja.height * 0.5, { steps: 4 });
    await expect.poll(async () => (await desplazamiento(cta)).x).toBeGreaterThan(1);

    // El interruptor del pie cierra la puerta en caliente (sin mover el ratón de la CTA).
    await page.evaluate(() => document.querySelector<HTMLButtonElement>(".mov-conmutador")?.click());
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
    await expect.poll(() => cta.evaluate((e) => e.style.length)).toBe(0);
    expect((await desplazamiento(cta)).crudo).toBe("none");
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await contexto.close();
  });
});

test.describe("foco", () => {
  test("el primer Tab muestra «Saltar al contenido»: 44 px, anillo tinta y sin tapar el logo", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const salto = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(salto).toBeFocused();
    await expect(salto).toBeVisible();
    const caja = (await salto.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(44);
    const anillo = await salto.evaluate((e) => {
      const s = getComputedStyle(e);
      return { estilo: s.outlineStyle, ancho: s.outlineWidth, color: s.outlineColor, fondo: s.backgroundColor };
    });
    expect(anillo).toMatchObject({ estilo: "solid", ancho: "2px", color: "rgb(15, 27, 45)", fondo: "rgb(15, 27, 45)" });
    const logo = (await page.getByRole("link", { name: "Otea Austral, inicio" }).boundingBox())!;
    const seCruzan =
      caja.x < logo.x + logo.width &&
      logo.x < caja.x + caja.width &&
      caja.y < logo.y + logo.height &&
      logo.y < caja.y + caja.height;
    expect(seCruzan).toBe(false);
  });

  test("ningún campo apaga el anillo de foco", async ({ page }) => {
    await page.goto("/#lista-de-espera");
    const correo = page.locator("#correo");
    await correo.focus();
    const estilo = await correo.evaluate((e) => getComputedStyle(e).outlineStyle);
    expect(estilo).toBe("solid");
  });
});

test.describe("bucles", () => {
  test("los bucles se pausan fuera de vista y siguen al volver", async ({ page }, info) => {
    soloEscritorio(info.project.name);
    await page.goto("/");
    const cinta = page.locator(".cinta[data-bucle]");
    await expect(cinta).toHaveCount(1);
    const corriendo = () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => {
              const blanco = (a.effect as KeyframeEffect | null)?.target;
              return blanco instanceof Element && blanco.closest("[data-bucle]") && a.playState === "running";
            })
            .filter((a) => (a.effect?.getTiming().iterations ?? 1) === Infinity).length,
      );
    await expect.poll(corriendo).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(cinta).toHaveAttribute("data-fuera", "");
    await expect.poll(corriendo).toBe(0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(cinta).not.toHaveAttribute("data-fuera");
    await expect.poll(corriendo).toBeGreaterThan(0);
  });
});

test.describe("movimiento reducido", () => {
  for (const ruta of ["/", "/metodologia"]) {
    test(`${ruta}: ninguna animación viva, ni al pasar el ratón ni al enfocar`, async ({ browser }, info) => {
      soloEscritorio(info.project.name);
      const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const page = await contexto.newPage();
      await page.goto(ruta);
      await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
      // El bloque «reduce» deja las transiciones en 0,01 ms: un cambio de estado (la hidratación, el ratón, el foco)
      // crea una que termina al instante. Lo que se exige es que no quede ninguna viva.
      const vivas = () => page.evaluate(() => document.getAnimations().length);
      await expect.poll(vivas, { timeout: 1000 }).toBe(0);
      await page.mouse.move(200, 300, { steps: 5 });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect.poll(vivas, { timeout: 1000 }).toBe(0);
      expect(await page.locator(":focus").evaluate((e) => getComputedStyle(e).outlineOffset)).toBe("3px");
      await contexto.close();
    });
  }
});

for (const ancho of ANCHOS) {
  test(`sin scroll lateral a ${ancho} px en las 10 rutas públicas`, async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    test.setTimeout(90_000);
    const contexto = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    const page = await contexto.newPage();
    for (const ruta of RUTAS) {
      await page.goto(ruta);
      await page.waitForTimeout(150);
      expect(await sinScrollHorizontal(page), `${ruta} a ${ancho} px`).toBe(true);
    }
    await contexto.close();
  });
}

test("sin errores de consola ni violaciones de la CSP en las 10 rutas, con el ratón encima de lo interactivo", async ({
  page,
}, info) => {
  soloEscritorio(info.project.name);
  test.setTimeout(90_000);
  for (const ruta of RUTAS) {
    const errores = vigilarErrores(page);
    await page.goto(ruta);
    const boton = page.locator("[data-magnetico]").first();
    const caja = await boton.boundingBox();
    if (caja) await page.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height / 2, { steps: 3 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);
    // El documento de la ruta inexistente responde 404 a propósito: el navegador lo anota en la consola.
    const reales = errores.filter((e) => !(ruta === "/no-existe" && /status of 404/.test(e)));
    expect(reales, ruta).toEqual([]);
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
  }
});
