import { expect, test, type Browser } from "@playwright/test";

/**
 * Presupuesto de la portada (a partir de `peso.mjs` de la auditoría): lo que descarga Chromium con la caché
 * desactivada (bytes comprimidos en la red, incluidas las precargas de enlaces), los nodos del DOM y las
 * animaciones que existen a la vez. Línea base antes del rediseño: 331 KB, 992 nodos y 188 animaciones en
 * escritorio. Umbrales iniciales del rediseño «Horizonte»; T7 los ajusta a lo medido al final.
 * Abre sus propias ventanas (1440 y 390), así que corre solo en el proyecto de escritorio.
 *
 * Nodos: T5 (producto que se toca) subió el umbral de 1300 a 1400. Medido en el build de producción (1440 y 390, el
 * mismo DOM): 1381 nodos, de ellos historia 381 (T4), vitrina 297, «Tu mañana» 226, lista de espera 107, pre-apertura
 * 102, preguntas 75, pie 51 y `<head>` 47. La vitrina guarda las tres alertas reales en el DOM (Ormuz 83 nodos con sus
 * valores de la prueba en paralelo, Chips 48, Cobre 57) porque el cambio de escenario lo hace `:has()` sin JavaScript, y
 * «Tu mañana» guarda los seis avisos de ejemplo (se pliegan, no se desmontan). Antes de subirlo se quitaron 122 nodos que
 * no aportaban (la cara duplicada de cada tema, envoltorios de los avisos, íconos SVG de las direcciones y de los
 * medidores, numerales de las notas): de 1503 a 1381. En la ronda 1 de T5 se midieron 1382 (tres vigías nuevas y una
 * entrada más corta).
 *
 * Animaciones: con las vigías del producto (`.vigia-producto`), las piezas ligadas al scroll de la vitrina, la noche y
 * la lista sueltan su animación lejos de la pantalla. Arriba de la portada pasaron de 195 a 122 (escritorio), así que el
 * umbral baja de 200 a la meta del brief (< 160).
 */
const UMBRAL = { transferidoKB: 420, nodos: 1400, animaciones: 160 };

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
  await contexto.close();
  return { transferidoKB, nodos, animaciones };
}

for (const { nombre, opciones } of VENTANAS) {
  test(`la portada cabe en su presupuesto (${nombre})`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== "escritorio", "abre sus propias ventanas");
    const m = await medir(browser, opciones, baseURL!);
    info.annotations.push({
      type: "medida",
      description: `${nombre}: ${m.transferidoKB.toFixed(1)} KB, ${m.nodos} nodos, ${m.animaciones} animaciones`,
    });
    expect(m.transferidoKB, "KB transferidos").toBeLessThan(UMBRAL.transferidoKB);
    expect(m.nodos, "nodos del DOM").toBeLessThan(UMBRAL.nodos);
    expect(m.animaciones, "animaciones a la vez").toBeLessThan(UMBRAL.animaciones);
    expect(m.animaciones, "la portada se anima").toBeGreaterThan(0);
  });
}
