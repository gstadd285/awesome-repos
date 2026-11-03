import { expect, test } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

const PAGINAS = [
  ["/alertas", "Alertas publicadas."],
  ["/metodologia", "Cómo verificamos cada alerta."],
  ["/fuentes", "De dónde sale la información."],
  ["/seguridad", "Cómo protegemos Otea Austral"],
  ["/privacidad", "Tus datos, los mínimos."],
  ["/terminos", "Condiciones de uso."],
  ["/aviso-legal", "Aviso legal."],
] as const;

for (const [ruta, titulo] of PAGINAS) {
  test(`${ruta} carga sin errores ni scroll horizontal`, async ({ page }) => {
    const errores = vigilarErrores(page);
    const r = await page.goto(ruta);
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    expect(await sinScrollHorizontal(page)).toBe(true);
    expect(errores).toEqual([]);
  });
}

test("los textos legales se presentan como provisionales", async ({ page }) => {
  for (const ruta of ["/privacidad", "/terminos", "/aviso-legal", "/metodologia"]) {
    await page.goto(ruta);
    await expect(page.getByRole("note")).toContainText("pendiente de revisión legal");
  }
});

test("/fuentes lista 17 organismos con enlaces seguros", async ({ page }) => {
  await page.goto("/fuentes");
  await expect(page.locator("tbody tr")).toHaveCount(17);
  const enlaces = page.locator("tbody a");
  await expect(enlaces).toHaveCount(17);
  for (const enlace of await enlaces.all()) {
    await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    expect(await enlace.getAttribute("href")).toMatch(/^https:\/\//);
  }
});

test("página 404 propia", async ({ page }) => {
  const r = await page.goto("/no-existe");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Esta ruta no aparece en el horizonte." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: /Ver la metodología/ })).toHaveAttribute("href", "/metodologia");
});

/* ── T6 · Interiores de autor: pieza, índice, cifras, tablas y pie ───────────────────────────────────────────────── */

const INTERIORES = ["/alertas", "/metodologia", "/fuentes", "/seguridad", "/privacidad", "/terminos", "/aviso-legal"] as const;

test("cada interior tiene su pieza junto al titular, decorativa (aria-hidden) salvo el dial, que es navegación", async ({ page }) => {
  for (const ruta of INTERIORES) {
    const errores = vigilarErrores(page);
    await page.goto(ruta);
    const pieza = page.locator(".int-pieza");
    await expect(pieza, ruta).toBeVisible();
    for (const svg of await pieza.locator("svg").all()) {
      const decorativo = await svg.evaluate((e) => e.closest("[aria-hidden='true']") !== null || e.closest("nav") !== null);
      expect(decorativo, `${ruta}: SVG sin aria-hidden fuera de una navegación`).toBe(true);
    }
    // Cada entrada del índice salta a un apartado que existe.
    for (const enlace of await page.locator("nav[aria-label='En esta página'] a").all()) {
      const id = (await enlace.getAttribute("href"))!.slice(1);
      await expect(page.locator(`[id="${id}"]`), `${ruta} → #${id}`).toHaveCount(1);
    }
    expect(await sinScrollHorizontal(page), ruta).toBe(true);
    expect(errores, ruta).toEqual([]);
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
  }
});

test("con movimiento reducido: ninguna animación en las interiores y cada cifra se lee una sola vez, como texto", async ({ browser }, info) => {
  test.skip(info.project.name !== "escritorio", "abre sus propias ventanas");
  for (const ventana of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const contexto = await browser.newContext({ viewport: ventana, reducedMotion: "reduce" });
    const page = await contexto.newPage();
    for (const ruta of [...INTERIORES, "/no-existe", "/cuenta/entrar"]) {
      await page.goto(ruta);
      await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
      await expect.poll(() => page.evaluate(() => document.getAnimations().length), { message: ruta }).toBe(0);
      for (const cifra of await page.locator(".cifra").all()) {
        await expect(cifra.locator(".cifra-rodillo")).toBeHidden();
        expect(await cifra.locator(".cifra-texto").evaluate((e) => getComputedStyle(e).color)).not.toBe("rgba(0, 0, 0, 0)");
      }
    }
    // El texto accesible de una cifra es el número una vez (el rodillo es decorativo).
    await page.goto("/fuentes");
    await expect(page.locator("ul.int-sigue").first()).toContainText("17");
    expect(await page.locator(".cifra").first().evaluate((e) => e.querySelectorAll("[aria-hidden='true']").length)).toBe(1);
    await contexto.close();
  }
});

test("/fuentes en escritorio: las tres tablas alinean sus columnas (± 1 px)", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "solo escritorio");
  await page.goto("/fuentes");
  const tablas = page.locator("table");
  await expect(tablas).toHaveCount(3);
  const columnas = await tablas.evaluateAll((ts) => ts.map((t) => [...t.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().left)));
  for (const xs of columnas.slice(1)) {
    xs.forEach((x, i) => expect(Math.abs(x - columnas[0][i])).toBeLessThanOrEqual(1));
  }
});

test("/fuentes en el teléfono: tarjetas por organismo con enlaces de 44 px y sin scroll lateral", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 640, "solo teléfono");
  await page.goto("/fuentes");
  await expect(page.locator("table").first()).toBeHidden();
  const enlaces = page.locator("section ul.grid a[target='_blank']");
  await expect(enlaces).toHaveCount(17);
  // `min-h-11` da 44 px justos; con el Pixel 7 (DPR 2,625) y la máquina cargada, la caja llegó a medir 43,9998 (redondeo de
  // subpíxeles): se admite una centésima.
  for (const enlace of await enlaces.all()) expect((await enlace.boundingBox())!.height).toBeGreaterThanOrEqual(43.99);
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test("el simulador de /metodologia calcula con las reglas reales: sin la fuente primaria, alta pasa a baja", async ({ page }) => {
  await page.goto("/metodologia");
  const simulador = page.locator("#simulador");
  const resultado = simulador.locator("[aria-live]");
  await expect(resultado).toContainText("Confianza alta");
  const primaria = simulador.getByRole("button", { name: /Agencia energética/ });
  await expect(primaria).toBeEnabled();
  await primaria.click();
  await expect(primaria).toHaveAttribute("aria-pressed", "false");
  await expect(resultado).toContainText("Confianza baja");
  await expect(resultado).toContainText("regla 2");
  await expect(simulador.getByRole("row", { name: /Aerolíneas/ })).toContainText("baja");
});

test("el índice marca el apartado en curso solo con CSS", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "el índice fijo es de escritorio");
  await page.goto("/terminos");
  const opacidad = (n: number) =>
    page.locator("nav[aria-label='En esta página'] li").nth(n).locator("a").evaluate((a) => getComputedStyle(a, "::before").opacity);
  await page.evaluate(() => document.getElementById("apartado-05")!.scrollIntoView({ behavior: "instant" }));
  await expect.poll(() => opacidad(4)).toBe("1");
  expect(await opacidad(0)).toBe("0");
});

test("security.txt, robots.txt y sitemap.xml", async ({ request }) => {
  const txt = await (await request.get("/.well-known/security.txt")).text();
  expect(txt).toMatch(/^Contact: /m);
  expect(txt).toMatch(/^Expires: /m);
  expect(await (await request.get("/robots.txt")).text()).toMatch(/Sitemap: /);
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/metodologia");
});

test("manifiesto e imagen para redes", async ({ request }) => {
  const manifiesto = await (await request.get("/manifest.webmanifest")).json();
  expect(manifiesto.name).toBe("Otea Austral");
  for (const icono of manifiesto.icons) {
    expect((await request.get(icono.src)).status()).toBe(200);
  }
  expect((await request.get("/opengraph-image.jpg")).headers()["content-type"]).toContain("image/jpeg");
});
