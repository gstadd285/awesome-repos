import { gzipSync } from "node:zlib";
import { expect, test, type Browser } from "@playwright/test";

/**
 * Presupuesto de la portada (a partir de `peso.mjs` de la auditoría): lo que descarga Chromium con la caché
 * desactivada (bytes comprimidos en la red, incluidas las precargas de enlaces), los nodos del DOM y las
 * animaciones que existen a la vez. Línea base antes del rediseño: 331 KB, 992 nodos y 188 animaciones en
 * escritorio.
 * Abre sus propias ventanas (1440 y 390), así que corre solo en el proyecto de escritorio.
 *
 * Umbrales definitivos (T7, a lo medido en el build de producción, mediana de 3, 1440 y 390; brief §6):
 * - Transferido: 373,3 KB en escritorio y 371,0 en el teléfono (JS 161,7) → 390 KB (+4,5 %, bajo el tope de 400).
 * - Nodos: 1.389 (el mismo DOM en ambos anchos) → 1.400 (+0,8 %). La meta del brief era < 1.250: la vitrina guarda sus
 *   tres alertas reales en el DOM (el cambio lo hace `:has()` sin JavaScript) y «Tu mañana» sus seis avisos; T5 ya quitó
 *   122 nodos sin pérdida (de 1.503 a 1.381). Bajar de 1.250 exige quitar contenido: decisión de la persona dueña.
 * - Animaciones a la vez: 123 en escritorio (17 en el teléfono) → 135 (+10 %, bajo la meta de 160). Las vigías del
 *   producto (`.vigia-producto`) sueltan lo ligado al scroll lejos de la pantalla.
 * - CSS: 29.375 + 1.317 B = 29,97 KB → 30 KB, el tope del brief. Para llegar: el reinicio de Tailwind recortado a los
 *   elementos que el sitio usa (~0,5 KB), los valores por omisión de Tailwind en línea (~0,3 KB), una sola regla de
 *   impresión, el sol de latón como variable (sus cuatro copias quedaban a más de 32 KB, fuera de la ventana de gzip) y
 *   las transiciones de los botones en una regla propia (sin `--tw-duration`/`--tw-ease`). Lo que se sume se compensa.
 */
const UMBRAL = { transferidoKB: 390, nodos: 1400, animaciones: 135, cssKB: 30 };

const VENTANAS = [
  { nombre: "escritorio 1440", opciones: { viewport: { width: 1440, height: 900 } } },
  {
    nombre: "móvil 390",
    opciones: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  },
] as const;

async function medir(browser: Browser, opciones: (typeof VENTANAS)[number]["opciones"], baseURL: string) {
  const contexto = await browser.newContext({ ...opciones, baseURL });
  const page = await contexto.newPage();
  const cdp = await contexto.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const bytes = new Map<string, number>();
  cdp.on("Network.loadingFinished", (e) => bytes.set(e.requestId, e.encodedDataLength));

  await page.goto("/", { waitUntil: "networkidle" });
  // Baja por toda la página para que entre lo diferido (precargas de enlaces, piezas al entrar).
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  // La entrada del héroe (T3) dura ~5 s: se mide cuando terminó (solo quedan bucles y lo ligado al scroll).
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.timeline instanceof DocumentTimeline && a.effect?.getTiming().iterations !== Infinity)
              .filter((a) => a.playState === "running").length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0);
  // Animaciones que existen a la vez de vuelta arriba (ligadas al scroll y bucles; las entradas ya terminaron),
  // como `peso.mjs`.
  const animaciones = await page.evaluate(() => document.getAnimations().length);
  const nodos = await page.evaluate(() => document.getElementsByTagName("*").length);
  const transferidoKB = [...bytes.values()].reduce((a, b) => a + b, 0) / 1024;
  const hojas = await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
  let cssBytes = 0;
  for (const hoja of new Set(hojas)) cssBytes += gzipSync(await (await page.request.get(hoja)).body(), { level: 6 }).length;
  await contexto.close();
  return { transferidoKB, nodos, animaciones, cssKB: cssBytes / 1024 };
}

for (const { nombre, opciones } of VENTANAS) {
  test(`la portada cabe en su presupuesto (${nombre})`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== "escritorio", "abre sus propias ventanas");
    const m = await medir(browser, opciones, baseURL!);
    info.annotations.push({
      type: "medida",
      description: `${nombre}: ${m.transferidoKB.toFixed(1)} KB, ${m.nodos} nodos, ${m.animaciones} animaciones, CSS ${m.cssKB.toFixed(2)} KB`,
    });
    expect(m.cssKB, "KB de CSS comprimido").toBeLessThan(UMBRAL.cssKB);
    expect(m.transferidoKB, "KB transferidos").toBeLessThan(UMBRAL.transferidoKB);
    expect(m.nodos, "nodos del DOM").toBeLessThan(UMBRAL.nodos);
    expect(m.animaciones, "animaciones a la vez").toBeLessThan(UMBRAL.animaciones);
    expect(m.animaciones, "la portada se anima").toBeGreaterThan(0);
  });
}
