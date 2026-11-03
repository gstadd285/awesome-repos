import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Pulido transversal (rediseño «Horizonte», T7): objetivos táctiles de 44 px, enlaces con filete de latón,
 * desplegables con `::details-content`, asistente por frases con sus puntos pausados fuera de vista, impresión
 * quieta y completa, una CTA en el teléfono en horizontal y la captura barata de la página que se va en una
 * transición entre páginas. Abren sus propias ventanas: solo en el proyecto de escritorio.
 */

const soloEscritorio = (nombre: string) => test.skip(nombre !== "escritorio", "abre sus propias ventanas");

/** 44 px, con medio píxel de tolerancia para el redondeo subpíxel de `boundingBox` (se midió 43,99999). */
const TACTIL = 43.5;

const TELEFONO: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function abrir(browser: Browser, ip: string, ruta: string, opciones: BrowserContextOptions = {}) {
  const contexto = await browser.newContext({ ...opciones, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await contexto.newPage();
  await page.goto(ruta, { waitUntil: "networkidle" });
  return { contexto, page };
}

async function alto(page: Page, selector: string) {
  const caja = await page.locator(selector).first().boundingBox();
  expect(caja, selector).not.toBeNull();
  return caja!;
}

test.describe("objetivos táctiles", () => {
  test("44 px en el teléfono: «Fuentes», «Lo esencial…», el logo, el pie, las migas y el índice", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, ip, `${baseURL}/`, TELEFONO);
    for (const selector of ["#ejemplos summary", "#lista-de-espera summary", ".cabecera-logo", "footer nav a"]) {
      const caja = await alto(page, selector);
      expect(caja.height, selector).toBeGreaterThanOrEqual(TACTIL);
    }
    await page.goto(`${baseURL}/metodologia`, { waitUntil: "networkidle" });
    const inicio = await alto(page, 'nav[aria-label="Ruta de navegación"] a');
    expect(inicio.height).toBeGreaterThanOrEqual(TACTIL);
    expect(inicio.width).toBeGreaterThanOrEqual(TACTIL);
    await page.locator("details.indice-movil summary").click();
    expect((await alto(page, "details.indice-movil nav a")).height).toBeGreaterThanOrEqual(TACTIL - 1);
    await contexto.close();
  });

  test("en horizontal (844×390) hay una CTA en la primera pantalla", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, ip, `${baseURL}/`, { ...TELEFONO, viewport: { width: 844, height: 390 } });
    const cta = page.locator(".cabecera").getByRole("link", { name: "Recibir alertas" });
    await expect(cta).toBeInViewport({ ratio: 1 });
    await contexto.close();
  });
});

test.describe("enlaces y desplegables", () => {
  test("el filete de latón de un enlace en el texto crece con el cursor y vuelve al salir", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, ip, `${baseURL}/privacidad`, { viewport: { width: 1440, height: 900 } });
    const enlace = page.locator(".prosa a").first();
    const tamano = () => enlace.evaluate((a) => getComputedStyle(a).backgroundSize);
    await enlace.scrollIntoViewIfNeeded();
    // El cursor parte lejos del enlace (la cabecera): sin hover, el filete mide 0.
    await page.mouse.move(5, 5);
    await expect.poll(tamano).toBe("0px 2px");
    expect(await enlace.evaluate((a) => getComputedStyle(a).textDecorationLine)).toBe("underline");
    await enlace.hover();
    await expect.poll(tamano).toBe("100% 2px");
    await page.mouse.move(5, 5);
    await expect.poll(tamano).toBe("0px 2px");
    await contexto.close();
  });

  test("«Fuentes» se abre con ::details-content y su chevrón da media vuelta; con reducido, al instante", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    for (const reducido of [false, true]) {
      const { contexto, page } = await abrir(browser, ip, `${baseURL}/`, {
        viewport: { width: 1440, height: 900 },
        reducedMotion: reducido ? "reduce" : "no-preference",
      });
      const detalles = page.locator("#ejemplos details").first();
      const estado = () =>
        detalles.evaluate((d) => ({
          contenido: getComputedStyle(d, "::details-content").blockSize,
          giro: getComputedStyle(d.querySelector(".chevron")!).rotate,
        }));
      expect(await estado()).toEqual({ contenido: "0px", giro: "none" });
      await detalles.locator("summary").scrollIntoViewIfNeeded();
      await detalles.locator("summary").click();
      if (!reducido) {
        // A mitad de camino (320 ms en total) el contenido va creciendo.
        const medio = await detalles.evaluate(
          (d) => new Promise<number>((r) => setTimeout(() => r(Number.parseFloat(getComputedStyle(d, "::details-content").blockSize)), 90)),
        );
        expect(medio).toBeGreaterThan(0);
      }
      await expect.poll(async () => (await estado()).giro).toBe("180deg");
      await expect.poll(async () => Number.parseFloat((await estado()).contenido)).toBeGreaterThan(60);
      expect(await detalles.locator("li").first().isVisible()).toBe(true);
      await contexto.close();
    }
  });
});

test.describe("asistente", () => {
  test("la respuesta llega por frases y los puntos de «Buscando…» se pausan fuera de la pantalla", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, ip, `${baseURL}/#preguntas`, { viewport: { width: 1440, height: 900 } });
    await expect(page.getByLabel("Tu pregunta")).toBeEnabled();
    // Una respuesta que no llega: los puntos quedan a la vista mientras se espera.
    let soltar!: () => void;
    const retenida = new Promise<void>((r) => (soltar = r));
    await page.route("**/api/asistente", async (ruta) => {
      await retenida;
      await ruta.fallback();
    });
    await page.getByRole("button", { name: "¿Cómo calculan la confianza?" }).click();
    const puntos = page.locator(".punto-escribiendo");
    await expect(puntos).toHaveCount(3);
    const estado = () => puntos.first().evaluate((p) => p.getAnimations()[0]?.playState);
    await expect.poll(estado).toBe("running");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(estado).toBe("paused");
    await page.locator("#preguntas").scrollIntoViewIfNeeded();
    await expect.poll(estado).toBe("running");
    soltar();
    const registro = page.getByRole("log", { name: "Conversación con el asistente" });
    await expect(registro).toContainText("se calcula a partir de las fuentes");
    expect(await registro.locator(".frase").count()).toBeGreaterThan(1);
    // El escalonado son clases finitas, sin `style`.
    expect(await registro.locator("[style]").count()).toBe(0);
    await contexto.close();
  });
});

test.describe("impresión y transiciones", () => {
  test("al imprimir no queda ninguna animación y lo que esperaba a verse se imprime completo", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, ip, `${baseURL}/`, TELEFONO);
    await page.emulateMedia({ media: "print" });
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    // En el teléfono el texto de las secciones se revela al entrar (`data-motor`): `beforeprint` lo suelta.
    const ultimo = page.locator(".kx-scroll.kx-palabras .kx-p").last();
    expect(await ultimo.evaluate((p) => getComputedStyle(p).transform)).not.toBe("none");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.locator("html")).not.toHaveAttribute("data-motor");
    expect(await ultimo.evaluate((p) => getComputedStyle(p).transform)).toBe("none");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(page.locator("html")).toHaveAttribute("data-motor", "listo");
    await contexto.close();
  });

  test("al salir de la portada, lo que está fuera de pantalla no se pinta en la captura y nada cambia de alto", async ({ browser, ip, baseURL }, info) => {
    soloEscritorio(info.project.name);
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip } });
    const page = await contexto.newPage();
    // Lo que ve la página vieja justo antes de que React la cambie (dentro del callback de la transición).
    await page.addInitScript(() => {
      const original = Document.prototype.startViewTransition;
      Document.prototype.startViewTransition = function (argumento: Parameters<typeof original>[0]) {
        const opciones = typeof argumento === "function" ? { update: argumento } : argumento!;
        const actualizar = opciones.update!;
        return original.call(this, {
          ...opciones,
          update: () => {
            const secciones = [...document.querySelectorAll<HTMLElement>("#contenido > section")];
            (window as unknown as { __captura: unknown }).__captura = {
              alto: document.documentElement.scrollHeight,
              fuera: secciones
                .filter((s) => s.getBoundingClientRect().bottom < 0 || s.getBoundingClientRect().top > innerHeight)
                .map((s) => getComputedStyle(s).contentVisibility),
            };
            return actualizar();
          },
        });
      };
    });
    await page.goto(`${baseURL}/#preguntas`, { waitUntil: "networkidle" });
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.locator('#preguntas a[href="/metodologia"], footer a[href="/metodologia"]').first().evaluate((a: HTMLElement) => a.click());
    await expect(page).toHaveURL(/\/metodologia$/);
    const captura = await page.evaluate(() => (window as unknown as { __captura?: { alto: number; fuera: string[] } }).__captura);
    expect(captura, "hubo una transición entre páginas").toBeDefined();
    expect(captura!.alto).toBe(alto);
    expect(captura!.fuera.length).toBeGreaterThan(2);
    expect(new Set(captura!.fuera)).toEqual(new Set(["auto"]));
    await contexto.close();
  });
});
