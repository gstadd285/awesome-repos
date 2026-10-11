import { expect, test } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

test.describe("portada", () => {
  test("carga sin errores ni violaciones de la CSP", async ({ page }) => {
    const errores = vigilarErrores(page);
    const respuesta = await page.goto("/");
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeVisible();
    await page.waitForTimeout(500);
    expect(errores).toEqual([]);
  });

  test("envía cabeceras de seguridad con CSP estricta", async ({ page }) => {
    const respuesta = await page.goto("/");
    const cabeceras = respuesta!.headers();
    const csp = cabeceras["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(cabeceras["x-frame-options"]).toBe("DENY");
    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
  });

  test("el primer Tab lleva a «Saltar al contenido»", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const salto = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(salto).toBeFocused();
    await expect(salto).toBeVisible();
  });

  test("la historia se puede saltar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Ver una alerta de ejemplo/ }).click();
    await expect(page).toHaveURL(/#ejemplos$/);
    await expect(page.getByRole("heading", { name: "Así se ve una alerta." })).toBeInViewport();
  });

  test("el héroe dice qué es y ofrece una acción principal junto al titular", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Del horizonte al mercado." })).toBeVisible();
    await expect(page.locator(".hero-texto .sr-only")).toContainText("Te avisamos de los eventos globales que importan");
    const principal = page.locator(".hero-acciones").getByRole("link", { name: "Recibir alertas" });
    await expect(principal).toBeVisible();
    await expect(principal).toHaveAttribute("href", "#lista-de-espera");
  });

  test("la cabecera tiene lo esencial y marca la página actual", async ({ page }, info) => {
    await page.goto("/alertas");
    if (info.project.name === "escritorio") {
      const nav = page.getByRole("navigation", { name: "Principal", exact: true });
      await expect(nav.getByRole("link")).toHaveText(["Cómo funciona", "Alertas", "Metodología", "Fuentes"]);
      await expect(nav.getByRole("link", { name: "Alertas" })).toHaveAttribute("aria-current", "page");
    }
    await expect(page.getByRole("link", { name: /Recibir alertas|Alertas/ }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toContainText("Inicio");
  });

  test("no hay scroll horizontal", async ({ page }) => {
    await page.goto("/");
    expect(await sinScrollHorizontal(page)).toBe(true);
  });

  test("«Tus temas» responde (la hidratación funciona bajo la CSP)", async ({ page }) => {
    await page.goto("/");
    const energia = page.getByRole("button", { name: /Energía/ });
    await energia.scrollIntoViewIfNeeded();
    await expect(energia).toHaveAttribute("aria-pressed", "false");
    await energia.click();
    await expect(energia).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Recibirías alertas de: Energía/)).toBeVisible();
  });

  test("las fuentes de una alerta se abren con el teclado", async ({ page }) => {
    await page.goto("/");
    const resumen = page.locator("#alerta-ejemplo-ormuz summary");
    await resumen.scrollIntoViewIfNeeded();
    await resumen.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#alerta-ejemplo-ormuz details")).toHaveAttribute("open", "");
    const enlace = page.locator("#alerta-ejemplo-ormuz details a").first();
    await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    await expect(enlace).toHaveAttribute("target", "_blank");
  });
});

test.describe("movimiento", () => {
  test("con movimiento reducido todo el contenido queda visible y quieto", async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    await page.goto("/");
    expect(await page.locator(".historia-escenario").evaluate((e) => getComputedStyle(e).position)).not.toBe("sticky");
    for (const titulo of ["Verificamos antes de avisar.", "Tu panel antes de la apertura."]) {
      const h = page.getByRole("heading", { name: titulo });
      await h.scrollIntoViewIfNeeded();
      expect(await h.evaluate((e) => getComputedStyle(e.closest("section")!).opacity)).toBe("1");
    }
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    await contexto.close();
  });

  test("el titular de la portada entra letra a letra y termina completo", async ({ page }) => {
    await page.goto("/");
    const letras = page.locator("h1 .kx-l");
    expect(await letras.count()).toBeGreaterThan(10);
    // Entrada de menos de 1,5 s: a los 2,5 s no queda ninguna letra desplazada ni transparente.
    await page.waitForTimeout(2500);
    const pendientes = await letras.evaluateAll((ls) =>
      ls.filter((l) => {
        const e = getComputedStyle(l);
        return e.transform !== "none" || e.opacity !== "1";
      }).length,
    );
    expect(pendientes).toBe(0);
  });

  test("al llegar a la zona de lectura, titulares y textos de entrada están completos", async ({ page }) => {
    await page.goto("/");
    // El bloque con su borde superior al 60 % de la pantalla: posición normal de lectura.
    for (const [titulo, parrafo] of [
      ["Así se ve una alerta.", /Quién gana, quién pierde y bajo qué condición, con la confianza calculada/],
      ["Elige qué seguir.", /Seis frentes donde un evento lejano/],
      ["Recibe las alertas primero.", /Estamos preparando el lanzamiento/],
    ] as const) {
      const h = page.getByRole("heading", { name: titulo });
      await h.evaluate((e) => {
        const y = e.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.6;
        window.scrollTo({ top: y, behavior: "instant" });
      });
      await page.waitForTimeout(400);
      const desplazos = await h.evaluate((e) =>
        [...e.querySelectorAll(".kx-p")].map((p) => Math.abs(new DOMMatrix(getComputedStyle(p).transform).f)),
      );
      expect(desplazos.length).toBeGreaterThan(1);
      expect(Math.max(...desplazos), `titular «${titulo}»: desplazamientos ${desplazos.join(", ")}`).toBeLessThan(0.5);
      const tenues = await page
        .locator("p.kx-lectura")
        .filter({ has: page.locator(".sr-only", { hasText: parrafo }) })
        .evaluate((p) => [...p.querySelectorAll(".kx-w")].filter((w) => Number(getComputedStyle(w).opacity) < 0.98).length);
      expect(tenues, `texto de «${titulo}»: palabras aún tenues`).toBe(0);
    }
  });

  test("en escritorio, los botones del héroe reciben el clic y, ya desvanecidos, no tapan otros pasos", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    await page.waitForTimeout(1800);
    const boton = page.locator(".hero-acciones").getByRole("link", { name: "Recibir alertas" });
    const centro = await boton.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const arriba = () =>
      page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null, centro);
    expect(await arriba()).toBe("#lista-de-espera");

    // Con el héroe ya desvanecido, ese punto no debe seguir siendo un enlace del héroe.
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>(".historia")!;
      window.scrollTo({ top: s.offsetTop + 0.4 * (s.offsetHeight - innerHeight), behavior: "instant" });
    });
    await expect.poll(() => page.locator(".h-hero").evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    expect(await arriba()).not.toBe("#lista-de-espera");
  });

  test("en escritorio la historia queda fija y avanza con el scroll", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    const escenario = page.locator(".historia-escenario");
    expect(await escenario.evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
    const paso3 = page.locator(".h-paso-3");
    expect(Number(await paso3.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.1);
    // Mitad del recorrido: paso 3 (impacto) a la vista.
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>(".historia")!;
      const inicio = s.offsetTop;
      window.scrollTo({ top: inicio + 0.63 * (s.offsetHeight - innerHeight), behavior: "instant" });
    });
    await expect.poll(async () => Number(await paso3.evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
  });
});
