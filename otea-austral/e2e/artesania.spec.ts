import { expect, test, type Locator, type Page } from "@playwright/test";
import { leerPng, pixel, sinScrollHorizontal, vigilarErrores } from "./ayudas";

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
  test("el primer Tab muestra «Saltar al contenido»: 44 px, anillo tinta, en la cabecera y en lugar del logo", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const salto = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(salto).toBeFocused();
    await expect(salto).toBeVisible();
    // Se mide ya aterrizada: a mitad de su entrada (`translate` fraccionario a DPR 2,625) la caja medía 43,999998 px.
    await salto.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    const caja = (await salto.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(44);
    const anillo = await salto.evaluate((e) => {
      const s = getComputedStyle(e);
      return { estilo: s.outlineStyle, ancho: s.outlineWidth, color: s.outlineColor, fondo: s.backgroundColor };
    });
    expect(anillo).toMatchObject({ estilo: "solid", ancho: "2px", color: "rgb(15, 27, 45)", fondo: "rgb(15, 27, 45)" });

    // Vive dentro de la cabecera (no pisa el antetítulo del héroe)…
    const cabecera = (await page.locator("header").first().boundingBox())!;
    expect(caja.y).toBeGreaterThanOrEqual(cabecera.y);
    expect(caja.y + caja.height).toBeLessThanOrEqual(cabecera.y + cabecera.height);

    // …el logo le cede su sitio mientras tiene el foco…
    const logo = page.getByRole("link", { name: "Otea Austral, inicio" });
    await expect.poll(() => logo.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");

    // …y no se cruza con ningún otro control visible de la cabecera.
    const cruces = await page.evaluate((c) => {
      const logo = document.querySelector('header a[aria-label="Otea Austral, inicio"]');
      return [...document.querySelectorAll("header a, header button")]
        .filter((el) => el !== logo && el.checkVisibility())
        .map((el) => ({ texto: el.textContent?.trim(), r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && c.x < r.right && r.left < c.x + c.width && c.y < r.bottom && r.top < c.y + c.height)
        .map(({ texto }) => texto);
    }, caja);
    expect(cruces).toEqual([]);

    // Al seguir con Tab, el logo vuelve.
    await page.keyboard.press("Tab");
    await expect(logo).toBeFocused();
    await expect.poll(() => logo.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
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

/* ── T2 · Cabecera isla, menú de app y navegación con continuidad ─────────────────────────────────────────────── */

/** Opacidad calculada de la isla (`header::before`). */
const opacidadIsla = (page: Page) =>
  page.evaluate(() => Number(getComputedStyle(document.querySelector("header.cabecera")!, "::before").opacity));

/** Clic real en el centro de un elemento, sin que Playwright desplace la página para mostrarlo. */
async function clicEnSitio(page: Page, el: Locator) {
  const caja = (await el.boundingBox())!;
  await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
}

test.describe("cabecera isla", () => {
  test("transparente arriba e isla flotante tras 120 px; el logo y la CTA se acercan a ella", async ({ page }, info) => {
    soloEscritorio(info.project.name);
    const errores = vigilarErrores(page);
    await page.goto("/metodologia");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    const cabecera = page.locator("header.cabecera");
    expect((await cabecera.boundingBox())!.height).toBe(72);
    expect(await opacidadIsla(page)).toBeLessThan(0.05);
    const logo = page.getByRole("link", { name: "Otea Austral, inicio" }).first();
    const xArriba = (await logo.boundingBox())!.x;

    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
    await expect.poll(() => opacidadIsla(page)).toBe(1);
    const isla = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector("header.cabecera")!, "::before");
      return { izquierda: Number.parseFloat(s.left), radio: s.borderTopLeftRadius, sombra: s.boxShadow };
    });
    expect(isla.izquierda).toBeGreaterThan(100);
    expect(isla.sombra).not.toBe("none");
    // El logo entra en la isla (sin cambiar su geometría: solo se traslada y escala).
    const xAbajo = (await logo.boundingBox())!.x;
    expect(xAbajo).toBeGreaterThan(isla.izquierda);
    expect(xAbajo - xArriba).toBeGreaterThan(80);
    // El avance de lectura recorre el borde de la isla.
    const avance = await page.evaluate(() => getComputedStyle(document.querySelector(".cabecera-progreso")!).scale);
    expect(Number.parseFloat(avance)).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  test("la pastilla sigue al ratón y el subrayado marca solo la página actual", async ({ page }, info) => {
    soloEscritorio(info.project.name);
    await page.goto("/metodologia");
    const nav = page.getByRole("navigation", { name: "Principal", exact: true });
    await expect(nav.locator(".nav-subrayado")).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Metodología" }).locator(".nav-subrayado")).toHaveCount(1);
    // Indicador no textual de 2 px en latón oscuro.
    const filete = await nav.locator(".nav-subrayado").evaluate((e) => {
      const s = getComputedStyle(e);
      return { alto: s.height, color: s.backgroundColor };
    });
    expect(filete).toEqual({ alto: "2px", color: "rgb(122, 94, 51)" });

    const alertas = nav.getByRole("link", { name: "Alertas" });
    const caja = (await alertas.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 3 });
    await expect.poll(() => nav.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--nv"))).toBe("1");
    const pastilla = nav.locator(".nav-indicador");
    await expect.poll(async () => Math.round((await pastilla.boundingBox())!.width)).toBe(Math.round(caja.width));
    await expect.poll(async () => Math.round((await pastilla.boundingBox())!.x)).toBe(Math.round(caja.x));

    await page.mouse.move(700, 600, { steps: 3 });
    await expect.poll(() => nav.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--nv"))).toBe("0");
    await expect.poll(() => pastilla.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
  });

  test("arriba del todo el fondo sigue sin escalón bajo la cabecera transparente (72 px)", async ({ page }, info) => {
    soloEscritorio(info.project.name);
    for (const ruta of ["/metodologia", "/fuentes", "/no-existe"]) {
      await page.goto(ruta);
      await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
      expect(await opacidadIsla(page)).toBeLessThan(0.05);
      const img = leerPng(await page.screenshot({ clip: { x: 0, y: 64, width: 1440, height: 16 } }));
      for (const x of [300, 1000, 1400]) {
        const arriba = pixel(img, x, 71 - 64);
        const abajo = pixel(img, x, 72 - 64);
        const salto = Math.max(...arriba.map((v, i) => Math.abs(v - abajo[i])));
        expect(salto, `${ruta} x=${x}: ${arriba} → ${abajo}`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("con movimiento reducido la barra es sólida y quieta, sin pastilla ni avance", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/metodologia");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
    expect(await opacidadIsla(page)).toBe(1);
    await expect(page.locator(".cabecera-progreso")).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Principal", exact: true });
    const caja = (await nav.getByRole("link", { name: "Alertas" }).boundingBox())!;
    await page.mouse.move(caja.x + 10, caja.y + 10, { steps: 3 });
    expect(await nav.evaluate((e) => (e as HTMLElement).style.length)).toBe(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 }).toBe(0);
    await contexto.close();
  });
});

test.describe("menú del teléfono", () => {
  test("barra de 60 px con objetivos de 44 px; a 320 px sin desborde y sin «Alertas», que pasa al menú", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    for (const ancho of [320, 390, 768]) {
      const contexto = await browser.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true });
      const page = await contexto.newPage();
      await page.goto("/");
      expect((await page.locator("header.cabecera").boundingBox())!.height, `${ancho}`).toBe(60);
      const menu = page.getByRole("button", { name: "Menú", exact: true });
      const caja = (await menu.boundingBox())!;
      expect(caja.width).toBeGreaterThanOrEqual(44);
      expect(caja.height).toBeGreaterThanOrEqual(44);
      const cta = page.locator("header").getByRole("link", { name: /^(Alertas|Recibir alertas)$/ });
      if (ancho < 400) await expect(cta).toBeHidden();
      else expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${ancho}`).toBe(ancho);
      await menu.click();
      const hoja = page.getByRole("navigation", { name: "Principal (móvil)" });
      await expect(hoja).toBeVisible();
      await expect(hoja.getByRole("link", { name: "Recibir alertas" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${ancho} con el menú`).toBe(ancho);
      if (ancho < 640) {
        // A pantalla completa.
        await expect.poll(async () => Math.round((await hoja.boundingBox())!.width)).toBe(ancho);
        expect((await hoja.boundingBox())!.height).toBeCloseTo(800, 0);
      }
      await contexto.close();
    }
  });

  test("Escape, un toque fuera, un toque en «Temas» y navegar cierran el menú", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    await page.goto("/");
    const boton = page.getByRole("button", { name: "Menú", exact: true });
    const hoja = page.getByRole("navigation", { name: "Principal (móvil)" });
    const abierto = () => page.evaluate(() => document.querySelector("#menu-movil")!.matches(":popover-open"));

    await boton.click();
    await expect(hoja).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(abierto).toBe(false);
    await expect(boton).toBeFocused();

    // «Temas» es un ancla de esta página: el menú se cierra y el titular de destino queda a la vista.
    await boton.click();
    await hoja.getByRole("link", { name: "Temas" }).click();
    await expect.poll(abierto).toBe(false);
    await expect(page).toHaveURL(/#temas$/);
    await expect(page.locator("#temas-titulo")).toBeInViewport();

    // Navegar a otra página también lo cierra.
    await boton.click();
    await hoja.getByRole("link", { name: "Metodología" }).click();
    await expect(page).toHaveURL(/\/metodologia$/);
    await expect.poll(abierto).toBe(false);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    expect(errores).toEqual([]);
    await contexto.close();

    // En el panel lateral (desde 640 px) queda página a la vista: tocarla cierra el menú.
    const tableta = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
    const otra = await tableta.newPage();
    await otra.goto("/fuentes");
    await otra.getByRole("button", { name: "Menú", exact: true }).click();
    await expect(otra.getByRole("navigation", { name: "Principal (móvil)" })).toBeVisible();
    await otra.mouse.click(80, 600);
    await expect
      .poll(() => otra.evaluate(() => document.querySelector("#menu-movil")!.matches(":popover-open")))
      .toBe(false);
    await tableta.close();
  });

  test("el pie llega después del último enlace y la hoja se funde sin perder la columna", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await contexto.newPage();
    await page.goto("/metodologia");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    const hoja = page.locator("#menu-movil");
    // El retraso del pie (320 ms) no lo pisa la transición de los enlaces: llega después del séptimo (280 ms).
    expect(await hoja.locator(".menu-pie").evaluate((e) => getComputedStyle(e).transitionDelay)).toMatch(/^0\.32s(, 0\.32s)*$/);
    await page.waitForTimeout(1000);
    const abierta = (await hoja.locator(".menu-lista").boundingBox())!;
    // A mitad del fundido de cierre la hoja sigue en columna: la lista no se va al lado del logo.
    const cierre = await hoja.evaluate(async (m) => {
      (m as HTMLElement).hidePopover();
      await new Promise((r) => setTimeout(r, 90));
      const s = getComputedStyle(m);
      const caja = m.querySelector(".menu-lista")!.getBoundingClientRect();
      return { display: s.display, direccion: s.flexDirection, opacidad: Number(s.opacity), x: caja.x, y: caja.y };
    });
    expect(cierre.display).toBe("flex");
    expect(cierre.opacidad).toBeGreaterThan(0);
    expect(cierre.direccion).toBe("column");
    expect(Math.abs(cierre.x - abierta.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(cierre.y - abierta.y)).toBeLessThanOrEqual(1);
    await contexto.close();
  });

  test("con movimiento reducido el menú abre y se cierra al instante, igual de completo", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/metodologia");
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    const hoja = page.getByRole("navigation", { name: "Principal (móvil)" });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole("link", { name: "Metodología" })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 }).toBe(0);
    await page.getByRole("button", { name: "Cerrar menú" }).click();
    await expect(hoja).toBeHidden();
    await contexto.close();
  });
});

test.describe("navegación con continuidad", () => {
  test("ir de /metodologia a /fuentes inicia una view transition y el subrayado viaja", async ({ page }, info) => {
    soloEscritorio(info.project.name);
    await page.addInitScript(() => {
      const ventana = window as Window & { __vt?: number };
      ventana.__vt = 0;
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((...args: Parameters<typeof original>) => {
          ventana.__vt = (ventana.__vt ?? 0) + 1;
          return original(...args);
        }) as typeof document.startViewTransition;
      }
    });
    await page.goto("/metodologia");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    await clicEnSitio(page, page.getByRole("navigation", { name: "Principal", exact: true }).getByRole("link", { name: "Fuentes" }));
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.getAnimations().some((a) => String((a.effect as KeyframeEffect | null)?.pseudoElement).includes("nav-subrayado")),
        ),
      )
      .toBe(true);
    await expect(page).toHaveURL(/\/fuentes$/);
    expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt)).toBeGreaterThanOrEqual(1);
    await expect(
      page.getByRole("navigation", { name: "Principal", exact: true }).getByRole("link", { name: "Fuentes" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("a mitad de la transición la cabecera queda intacta: sin copia estirada de la navegación ni velo encima", async ({
    page,
  }, info) => {
    soloEscritorio(info.project.name);
    // Congela la transición a los 150 ms (la imagen vieja de la cabecera sigue entera y la página nueva va entrando).
    await page.addInitScript(() => {
      const ventana = window as Window & { __congelada?: boolean };
      const original = document.startViewTransition?.bind(document);
      if (!original) return;
      document.startViewTransition = ((...args: Parameters<typeof original>) => {
        const transicion = original(...args);
        transicion.ready.then(() => {
          for (const a of document.getAnimations()) {
            if (String((a.effect as KeyframeEffect | null)?.pseudoElement).includes("view-transition")) {
              a.pause();
              a.currentTime = 150;
            }
          }
          ventana.__congelada = true;
        });
        return transicion;
      }) as typeof document.startViewTransition;
    });
    await page.goto("/metodologia");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    const nav = page.getByRole("navigation", { name: "Principal", exact: true });
    const etiquetas = [
      (await nav.getByRole("link", { name: "Cómo funciona" }).boundingBox())!,
      (await nav.getByRole("link", { name: "Alertas" }).boundingBox())!,
    ];
    const cta = (await page.locator("header").getByRole("link", { name: "Recibir alertas" }).boundingBox())!;
    const puntoCta = { x: Math.round(cta.x + 10), y: Math.round(cta.y + cta.height / 2) };
    await page.waitForTimeout(400);
    const antes = leerPng(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 72 } }));

    // Clic sin pasar el ratón (sin pastilla), como un toque o un lector de pantalla.
    await nav.getByRole("link", { name: "Fuentes" }).evaluate((e) => (e as HTMLElement).click());
    await page.waitForFunction(() => (window as Window & { __congelada?: boolean }).__congelada === true);
    await page.waitForTimeout(150);
    const durante = leerPng(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 72 } }));

    // Bajo las etiquetas solo hay fondo: ninguna copia estirada de la navegación (antes aparecía 18 px más abajo).
    for (const caja of etiquetas) {
      let minimo = 255;
      for (let x = Math.ceil(caja.x); x < caja.x + caja.width; x += 2) {
        for (let y = Math.ceil(caja.y + caja.height) - 6; y < 70; y++) minimo = Math.min(minimo, ...pixel(durante, x, y));
      }
      expect(minimo, `bajo la etiqueta en x=${Math.round(caja.x)}`).toBeGreaterThan(190);
    }
    // La CTA conserva su color: la página que entra pasa por debajo de la cabecera, no la vela.
    const [r0, g0, b0] = pixel(antes, puntoCta.x, puntoCta.y);
    const [r1, g1, b1] = pixel(durante, puntoCta.x, puntoCta.y);
    expect(Math.max(Math.abs(r0 - r1), Math.abs(g0 - g1), Math.abs(b0 - b1)), `${[r0, g0, b0]} → ${[r1, g1, b1]}`).toBeLessThanOrEqual(4);
  });

  test("«Ver una alerta de ejemplo» llega en un fundido de menos de 400 ms, sin cruzar la historia, y «Atrás» vuelve", async ({
    page,
  }, info) => {
    soloEscritorio(info.project.name);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "completo");
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
    const antes = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => {
      const ventana = window as Window & { __ys?: number[]; __vtMs?: number };
      ventana.__ys = [];
      const medir = () => {
        ventana.__ys!.push(Math.round(window.scrollY));
        const vt = document
          .getAnimations()
          .filter((a) => String((a.effect as KeyframeEffect | null)?.pseudoElement).includes("view-transition"))
          .map((a) => {
            const t = a.effect!.getComputedTiming();
            return Number(t.delay ?? 0) + Number(t.duration ?? 0);
          });
        if (vt.length) ventana.__vtMs = Math.max(ventana.__vtMs ?? 0, ...vt);
        if (ventana.__ys!.length < 90) requestAnimationFrame(medir);
      };
      requestAnimationFrame(medir);
    });
    await clicEnSitio(page, page.getByRole("link", { name: /Ver una alerta de ejemplo/ }));
    await expect(page).toHaveURL(/#ejemplos$/);
    await expect(page.getByRole("heading", { name: "Así se ve una alerta." })).toBeInViewport();
    await expect(page.locator("#ejemplos")).toBeFocused();
    await page.waitForTimeout(1600);
    const { posiciones, vtMs } = await page.evaluate(() => {
      const ventana = window as Window & { __ys?: number[]; __vtMs?: number };
      return { posiciones: [...new Set(ventana.__ys)], vtMs: ventana.__vtMs ?? 0 };
    });
    // Solo el origen y el destino: ningún cuadro intermedio de la historia.
    expect(posiciones).toHaveLength(2);
    expect(vtMs).toBeGreaterThan(0);
    expect(vtMs).toBeLessThan(400);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - antes)).toBeLessThanOrEqual(2);
  });

  test("con la puerta cerrada no hay view transition y la página cambia en menos de 500 ms, también desde la portada", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    // Reducido por el sistema y por el conmutador del pie; escritorio y teléfono. Antes React iniciaba una view
    // transition igual y, en la portada, Chromium tardaba ~4,4 s en abortarla: el clic no hacía nada.
    const casos = [
      { ancho: 1440, alto: 900, sistema: true },
      { ancho: 1440, alto: 900, sistema: false },
      { ancho: 390, alto: 844, sistema: true },
    ];
    for (const { ancho, alto, sistema } of casos) {
      const contexto = await browser.newContext({
        viewport: { width: ancho, height: alto },
        hasTouch: ancho < 1024,
        reducedMotion: sistema ? "reduce" : "no-preference",
      });
      const page = await contexto.newPage();
      await page.addInitScript((sistema) => {
        const ventana = window as Window & { __vt?: number };
        ventana.__vt = 0;
        if (!sistema) {
          try {
            localStorage.setItem("otea-movimiento", "reducido");
          } catch {}
        }
        const original = document.startViewTransition?.bind(document);
        if (original) {
          document.startViewTransition = ((...args: Parameters<typeof original>) => {
            ventana.__vt = (ventana.__vt ?? 0) + 1;
            return original(...args);
          }) as typeof document.startViewTransition;
        }
      }, sistema);
      for (const [desde, hacia] of [
        ["/", "/metodologia"],
        ["/metodologia", "/fuentes"],
      ]) {
        await page.goto(desde);
        await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
        await page.waitForLoadState("networkidle");
        // Se mide con temporizadores (corren aunque no se pinte ningún cuadro), desde el clic hasta la URL nueva.
        const ms = await page.evaluate(
          (hacia) =>
            new Promise<number>((resolver) => {
              const t0 = performance.now();
              const ruta = location.pathname;
              const sondear = () => {
                if (location.pathname !== ruta) resolver(performance.now() - t0);
                else if (performance.now() - t0 > 4000) resolver(Number.POSITIVE_INFINITY);
                else setTimeout(sondear, 4);
              };
              document.querySelector<HTMLAnchorElement>(`a[href="${hacia}"]`)!.click();
              setTimeout(sondear, 0);
            }),
          hacia,
        );
        const caso = `${ancho} px, ${sistema ? "sistema" : "conmutador"}, ${desde} → ${hacia}: ${Math.round(ms)} ms`;
        expect(ms, caso).toBeLessThan(500);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => (window as Window & { __vt?: number }).__vt), caso).toBe(0);
      }
      await contexto.close();
    }
  });

  test("con movimiento reducido el ancla funciona como siempre (sin fundido ni transición)", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    await page.goto("/");
    await page.getByRole("link", { name: /Ver una alerta de ejemplo/ }).click();
    await expect(page).toHaveURL(/#ejemplos$/);
    await expect(page.getByRole("heading", { name: "Así se ve una alerta." })).toBeInViewport();
    expect(await page.locator("html").getAttribute("data-salto")).toBeNull();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 }).toBe(0);
    await contexto.close();
  });
});
