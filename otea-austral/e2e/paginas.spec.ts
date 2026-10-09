import { expect, test } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

const PAGINAS = [
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
  await expect(page.getByRole("heading", { level: 1, name: "Esta página no existe." })).toBeVisible();
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
