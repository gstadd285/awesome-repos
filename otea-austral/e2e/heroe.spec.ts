import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test";
import { vigilarErrores } from "./ayudas";

/**
 * Héroe «Horizonte vivo» (rediseño «Horizonte», T3): el H1 partido por el horizonte entra en menos de 1,3 s y queda sin
 * transformación residual; la cinta se apoya en el borde inferior de la primera pantalla (sin franja muerta); en el
 * teléfono y la tableta la alerta viva asoma en el primer pliegue; con movimiento reducido o sin JS se ve el fotograma
 * final, quieto y sin pulsos. Cada prueba abre su propia ventana: solo corre en el proyecto de escritorio.
 */

const soloEscritorio = (nombre: string) => test.skip(nombre !== "escritorio", "abre sus propias ventanas");

async function abrir(browser: Browser, opciones: BrowserContextOptions) {
  const contexto = await browser.newContext(opciones);
  const page = await contexto.newPage();
  const errores = vigilarErrores(page);
  await page.goto("/");
  return { contexto, page, errores };
}

/** Lo que importa del fotograma final del héroe, para comparar modos. */
const fotograma = () => {
  const caja = (s: string) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  const estilo = (s: string, p: string) => getComputedStyle(document.querySelector(s)!).getPropertyValue(p);
  return {
    linea1: caja(".h1-linea-1"),
    linea2: caja(".h1-linea-2"),
    horizonte: caja(".h-horizonte"),
    sol: caja(".sol"),
    cinta: caja(".cinta"),
    solTransform: estilo(".sol", "transform"),
    laminas: [...document.querySelectorAll(".lamina")].map((l) => getComputedStyle(l).opacity).join(),
    pulsos: [...document.querySelectorAll(".pulso")].map((p) => getComputedStyle(p).opacity).join(),
  };
};

test.describe("héroe Horizonte vivo", () => {
  test("el titular sale del horizonte y está completo antes de 1,3 s; sin residuo a los 2,5 s", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page, errores } = await abrir(browser, { viewport: { width: 1440, height: 900 } });
    const lineas = page.locator(".h1-linea-1, .h1-linea-2");
    await expect(lineas).toHaveCount(2);
    // Cada línea termina antes de 1,3 s desde que arranca su animación.
    const fin = await lineas.evaluateAll((ls) =>
      ls.map((l) => {
        const a = l.getAnimations()[0];
        if (!a) return 0;
        const t = a.effect!.getComputedTiming();
        return Number(t.delay ?? 0) + Number(t.duration ?? 0);
      }),
    );
    expect(Math.max(...fin)).toBeLessThanOrEqual(1300);
    await page.waitForTimeout(2500);
    const estados = await lineas.evaluateAll((ls) => ls.map((l) => [getComputedStyle(l).transform, getComputedStyle(l).opacity]));
    expect(estados).toEqual([
      ["none", "1"],
      ["none", "1"],
    ]);
    // La línea 1 descansa sobre el horizonte y la 2 cuelga debajo.
    const f = await page.evaluate(fotograma);
    expect(f.linea1[1] + f.linea1[3]).toBeLessThanOrEqual(f.horizonte[1] + 1);
    expect(f.linea2[1]).toBeGreaterThanOrEqual(f.horizonte[1]);
    expect(errores).toEqual([]);
    await contexto.close();
  });

  test("a 1440 el H1 es monumental, el horizonte va a sangre, el sol queda cortado y la cinta toca el borde inferior", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForTimeout(5200);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector(".h1-horizonte")!;
      const linea1 = document.querySelector(".h1-linea-1")!;
      const rango = document.createRange();
      rango.selectNodeContents(linea1);
      const horizonte = document.querySelector(".h-horizonte")!.getBoundingClientRect();
      const sol = document.querySelector(".sol")!.getBoundingClientRect();
      const bases = [...document.querySelectorAll(".lamina")].map((l) => l.getBoundingClientRect().bottom);
      return {
        fuente: Number.parseFloat(getComputedStyle(h1).fontSize),
        anchoLinea1: rango.getBoundingClientRect().width,
        horizonte: { x: horizonte.left, ancho: horizonte.width, y: horizonte.top },
        sol: { arriba: sol.top, abajo: sol.bottom },
        baseMasBaja: Math.max(...bases),
        alto: innerHeight,
        ancho: document.documentElement.clientWidth,
      };
    });
    expect(m.fuente).toBeGreaterThanOrEqual(115);
    expect(m.anchoLinea1 / m.ancho).toBeGreaterThan(0.7);
    expect(m.horizonte.x).toBeLessThanOrEqual(0);
    expect(m.horizonte.ancho).toBeGreaterThanOrEqual(m.ancho);
    expect(m.sol.arriba).toBeLessThan(m.horizonte.y);
    expect(m.sol.abajo).toBeGreaterThan(m.horizonte.y);
    // Sin franja muerta: entre la base de la cinta y el borde inferior de la pantalla quedan menos de 40 px.
    expect(m.alto - m.baseMasBaja).toBeLessThan(40);
    expect(m.alto - m.baseMasBaja).toBeGreaterThanOrEqual(0);
    await contexto.close();
  });

  test("a 390×844 el primer pliegue muestra el H1, los dos botones a todo el ancho y 200 px de la alerta viva", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.waitForTimeout(3800);
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const botones = [...document.querySelectorAll(".hero-acciones a")].map((a) => a.getBoundingClientRect());
      return {
        h1: r(".h1-horizonte").bottom,
        botones: botones.map((b) => ({ ancho: b.width, abajo: b.bottom })),
        alerta: r(".alerta-viva").top,
        alto: innerHeight,
        ancho: document.documentElement.clientWidth,
        ejemplo: document.querySelector(".alerta-viva")!.textContent,
      };
    });
    expect(m.h1).toBeLessThan(m.alto);
    expect(m.botones).toHaveLength(2);
    for (const b of m.botones) {
      expect(b.ancho).toBeGreaterThanOrEqual(m.ancho - 48 - 1);
      expect(b.abajo).toBeLessThan(m.alto);
    }
    expect(m.alto - m.alerta).toBeGreaterThanOrEqual(200);
    expect(m.ejemplo).toContain("Datos de ejemplo");
    // Tres líneas: «DEL / HORIZONTE / AL MERCADO.», con el horizonte entre la 2 y la 3.
    const alturas = await page.evaluate(() => {
      const caja = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const lh = Number.parseFloat(getComputedStyle(document.querySelector(".h1-horizonte")!).fontSize) * 0.9;
      return { l1: caja(".h1-linea-1").height / lh, l2: caja(".h1-linea-2").height / lh };
    });
    expect(Math.round(alturas.l1)).toBe(2);
    expect(Math.round(alturas.l2)).toBe(1);
    await contexto.close();
  });

  test("a 768×1024 el héroe va en dos columnas: texto y acciones a la izquierda, alerta viva a la derecha", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 768, height: 1024 }, hasTouch: true });
    await page.waitForTimeout(3800);
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { texto: r(".hero-texto"), acciones: r(".hero-acciones"), alerta: r(".alerta-viva"), alto: innerHeight };
    });
    expect(m.alerta.left).toBeGreaterThanOrEqual(m.texto.right);
    expect(m.alerta.left).toBeGreaterThanOrEqual(m.acciones.right);
    expect(Math.abs(m.alerta.top - m.texto.top)).toBeLessThan(40);
    expect(m.alerta.bottom).toBeLessThan(m.alto);
    await contexto.close();
  });

  test("en escritorio no hay alerta viva (llega con la historia y la vitrina)", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 1280, height: 800 } });
    await expect(page.locator(".alerta-viva")).toBeHidden();
    await contexto.close();
  });

  test("con movimiento reducido: ninguna animación, el sol en su sitio, sin pulsos e igual al fotograma final", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const animado = await abrir(browser, { viewport: { width: 1440, height: 900 } });
    await animado.page.waitForTimeout(5200);
    const final = await animado.page.evaluate(fotograma);
    await animado.contexto.close();

    const { contexto, page } = await abrir(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-movimiento", "reducido");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const quieto = await page.evaluate(fotograma);
    expect(quieto.solTransform).toBe("none");
    expect(quieto.pulsos.split(",").every((o) => o === "0")).toBe(true);
    expect(quieto.laminas.split(",").every((o) => o === "1")).toBe(true);
    // Idéntico al fotograma de los 5 s (el aviso de movimiento ocupa su sitio bajo los botones, no mueve el héroe).
    expect(quieto.linea1).toEqual(final.linea1);
    expect(quieto.linea2).toEqual(final.linea2);
    expect(quieto.sol).toEqual(final.sol);
    expect(quieto.horizonte).toEqual(final.horizonte);
    await contexto.close();
  });

  test("los pulsos son trazos planos apuntados al sol: sin máscaras ni planos 3D que el compositor redibuje", async ({
    browser,
  }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 1440, height: 900 } });
    const m = await page.evaluate(() => {
      const pulsos = document.querySelector(".h-pulsos")!;
      const e = getComputedStyle(pulsos);
      const sol = document.querySelector(".sol")!.getBoundingClientRect();
      return {
        mascara: e.maskImage || e.getPropertyValue("-webkit-mask-image"),
        transform: e.transform,
        // Cada pulso, quieto, cae en su grupo y gira hacia el sol: a su izquierda en sentido horario (ángulo positivo),
        // a su derecha al revés. `offsetLeft` es su punto de llegada (el giro no lo mueve).
        giros: [...document.querySelectorAll<HTMLElement>(".pulso")].map((p) => {
          const t = new DOMMatrix(getComputedStyle(p).transform);
          const x = pulsos.getBoundingClientRect().x + p.offsetLeft + p.offsetWidth / 2;
          return { angulo: Math.atan2(t.b, t.a) * (180 / Math.PI), haciaElSol: Math.sign(sol.x + sol.width / 2 - x) };
        }),
      };
    });
    expect(m.mascara).toBe("none");
    expect(m.transform).toBe("none");
    expect(m.giros).toHaveLength(8);
    for (const g of m.giros) expect(Math.sign(g.angulo)).toBe(g.haciaElSol);
    await contexto.close();
  });

  test("la maquetación diferida dura solo la carga y los saltos de ancla aterrizan en su sitio", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await expect(page.locator("html")).toHaveAttribute("data-maquetado", "");
    expect(await page.locator("#temas").evaluate((e) => getComputedStyle(e).contentVisibility)).toBe("visible");
    await page.locator(".hero-acciones").getByRole("link", { name: "Recibir alertas" }).click();
    await expect(page).toHaveURL(/#lista-de-espera$/);
    // Aterriza bajo la barra: `scroll-padding-top` (76 px) más el `scroll-margin-top` de la sección (96 px).
    const llegada = () => page.locator("#lista-de-espera").evaluate((e) => Math.round(e.getBoundingClientRect().top));
    await expect.poll(llegada).toBeGreaterThan(160);
    await expect.poll(llegada).toBeLessThan(185);
    await contexto.close();

    // Una dirección con ancla nunca pasa por la maquetación diferida (`:target`).
    const directo = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await directo.newPage();
    await p2.goto("/#lista-de-espera");
    const directa = () => p2.locator("#lista-de-espera").evaluate((e) => Math.round(e.getBoundingClientRect().top));
    await expect.poll(directa).toBeGreaterThan(160);
    await expect.poll(directa).toBeLessThan(185);
    await directo.close();
  });

  test("sin JavaScript se ve el mismo héroe completo y quieto", async ({ browser }, info) => {
    soloEscritorio(info.project.name);
    const { contexto, page } = await abrir(browser, { viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const f = await page.evaluate(fotograma).catch(() => null);
    // Sin JS `page.evaluate` sigue funcionando (es del protocolo, no de la página).
    expect(f).not.toBeNull();
    expect(f!.solTransform).toBe("none");
    expect(f!.pulsos.split(",").every((o) => o === "0")).toBe(true);
    expect(f!.laminas.split(",").every((o) => o === "1")).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeVisible();
    await contexto.close();
  });
});
