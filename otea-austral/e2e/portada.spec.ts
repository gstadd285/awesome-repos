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
    await expect(page.locator(".hero-texto")).toContainText("Te avisamos de los eventos globales que importan");
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

  test("el titular de la portada sale del horizonte en dos líneas y termina completo", async ({ page }) => {
    await page.goto("/");
    const lineas = page.locator("h1 .h1-linea-1, h1 .h1-linea-2");
    await expect(lineas).toHaveCount(2);
    // Entrada de menos de 1,5 s: a los 2,5 s ninguna línea queda desplazada ni transparente.
    await page.waitForTimeout(2500);
    const pendientes = await lineas.evaluateAll((ls) =>
      ls.filter((l) => {
        const e = getComputedStyle(l);
        return e.transform !== "none" || e.opacity !== "1";
      }).length,
    );
    expect(pendientes).toBe(0);
  });

  test("al llegar a la zona de lectura, titulares y textos de entrada están completos", async ({ page }, info) => {
    // En escritorio el texto va ligado al scroll y ya está completo al 60 %; en táctil (`data-texto="unico"`) se revela una
    // sola vez, por tiempo, al entrar: se espera a que termine (nunca queda a medias).
    const tactil = info.project.name === "movil";
    await page.goto("/");
    if (tactil) await expect(page.locator("html")).toHaveAttribute("data-texto", "unico");
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
      const leerDesplazos = () =>
        h.evaluate((e) => [...e.querySelectorAll(".kx-p")].map((p) => Math.abs(new DOMMatrix(getComputedStyle(p).transform).f)));
      const leerTenues = () =>
        page
          .locator("p.kx-lectura")
          .filter({ has: page.locator(".sr-only", { hasText: parrafo }) })
          .evaluate((p) => [...p.querySelectorAll(".kx-w")].filter((w) => Number(getComputedStyle(w).opacity) < 0.98).length);
      if (tactil) {
        await expect(h).toHaveClass(/kx-visto/);
        await expect.poll(async () => Math.max(...(await leerDesplazos())), { timeout: 4000 }).toBeLessThan(0.5);
        await expect.poll(leerTenues, { timeout: 4000 }).toBe(0);
        continue;
      }
      const desplazos = await leerDesplazos();
      expect(desplazos.length).toBeGreaterThan(1);
      expect(Math.max(...desplazos), `titular «${titulo}»: desplazamientos ${desplazos.join(", ")}`).toBeLessThan(0.5);
      const tenues = await leerTenues();
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

  test("en escritorio el riel 01 · 02 · 03 lleva a cada paso de la historia fija", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    const riel = page.getByRole("navigation", { name: "Pasos de la historia" });
    // Aparece con el primer paso (en el héroe se aparta).
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>(".historia")!;
      window.scrollTo({ top: s.offsetTop + 0.25 * (s.offsetHeight - innerHeight), behavior: "instant" });
    });
    await expect.poll(() => riel.evaluate((e) => Number(getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
    for (const [enlace, paso] of [
      ["02 Impacto", ".h-paso-3"],
      ["03 Tu panel", ".h-paso-4"],
      ["01 Verificación", ".h-paso-2"],
    ] as const) {
      // Clic por coordenadas (locator.click desplazaría la página antes del salto).
      const caja = (await riel.getByRole("link", { name: enlace }).boundingBox())!;
      await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
      await expect.poll(() => page.locator(paso).evaluate((e) => Number(getComputedStyle(e).opacity)), { message: enlace }).toBeGreaterThan(0.9);
    }
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

  /** Lleva la historia fija a un progreso exacto (0 a 1): `(scrollY − top + 72) / (alto − vh + 72)`. Espera dos cuadros:
      las animaciones ligadas al scroll se actualizan en el cuadro siguiente, no al mover la página. */
  const progreso = (page: import("@playwright/test").Page, p: number) =>
    page.evaluate(async (f) => {
      const s = document.querySelector<HTMLElement>(".historia")!;
      window.scrollTo({ top: s.offsetTop - 72 + f * (s.offsetHeight - innerHeight + 72), behavior: "instant" });
      await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo)));
    }, p);

  test("en escritorio el horizonte sale entero: cielo, línea y suelo suben juntos, sin franja de fondo entre ellos", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    await page.waitForTimeout(1800);
    const medir = () =>
      page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        return { cielo: r(".h-cielo").bottom, suelo: r(".h-suelo").top, linea: r(".h-horizonte").top, caja1: r(".h1-caja-1").bottom };
      });
    const reposo = await medir();
    // Mientras el titular se pone (hasta el 10 %) el horizonte no se mueve: la línea 1 se recorta justo en él.
    await progreso(page, 0.095);
    const poniendo = await medir();
    expect(Math.abs(poniendo.linea - reposo.linea)).toBeLessThan(1);
    // Al subir, el pie del cielo, la línea y el borde del suelo siguen juntos.
    for (const p of [0.12, 0.14, 0.16]) {
      await progreso(page, p);
      const m = await medir();
      expect(m.linea, `al ${p * 100} %`).toBeLessThan(reposo.linea - 20);
      expect(Math.abs(m.cielo - m.suelo), `al ${p * 100} %`).toBeLessThan(1.5);
      expect(Math.abs(m.linea - m.suelo), `al ${p * 100} %`).toBeLessThan(2);
    }
  });

  test("en escritorio el foco nunca cae fuera de la pantalla: tabular desde el héroe lleva a cada parte de la historia", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.locator(".hero-acciones").getByRole("link", { name: "Ver una alerta de ejemplo" }).focus();
    const vistos: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      // Deja terminar el desplazamiento suave del navegador hacia el foco.
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const c = a.getBoundingClientRect();
        const arriba = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return { texto: (a.textContent ?? "").trim(), enHistoria: Boolean(a.closest(".historia")), enVista: c.top >= 0 && c.bottom <= innerHeight, encima: Boolean(arriba && (arriba === a || a.contains(arriba))) };
      });
      if (!r.enHistoria) break;
      vistos.push(r.texto);
      expect(r.enVista, `«${r.texto}» en pantalla`).toBe(true);
      expect(r.encima, `«${r.texto}» sin nada encima`).toBe(true);
    }
    expect(vistos).toEqual(["Ver metodología", "01Verificación", "02Impacto", "03Tu panel"]);
    // Y de vuelta al héroe: Mayús+Tab (desde lo primero que sigue a la historia) recorre el camino al revés, con teclas
    // seguidas, hasta los botones del principio.
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(600);
    const vuelta = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const c = a.getBoundingClientRect();
      return { texto: (a.textContent ?? "").trim(), enVista: c.top >= 0 && c.bottom <= innerHeight };
    });
    expect(vuelta).toEqual({ texto: "Ver una alerta de ejemplo", enVista: true });
  });

  test("en escritorio, lo que no está en su tramo no se dibuja (vigías) y el aviso no tapa «Datos de ejemplo» en una pantalla baja", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.waitForTimeout(1500);
    const visibilidad = (s: string) => page.locator(s).evaluate((e) => getComputedStyle(e).visibility);
    await expect.poll(() => visibilidad(".h-plano")).toBe("hidden");
    await expect.poll(() => visibilidad(".h-tablero")).toBe("hidden");
    await progreso(page, 0.3);
    await expect.poll(() => visibilidad(".h-plano")).toBe("visible");
    for (const p of [0.84, 0.9]) {
      await progreso(page, p);
      await expect.poll(() => visibilidad(".h-tablero")).toBe("visible");
      const [chip, aviso] = await page.evaluate(() =>
        [".tablero-chip", ".tablero-aviso"].map((s) => document.querySelector(s)!.getBoundingClientRect().toJSON()),
      );
      expect(aviso.bottom <= chip.top || aviso.right <= chip.left || aviso.left >= chip.right, `al ${p * 100} %`).toBe(true);
      await expect.poll(() => visibilidad(".h-plano")).toBe("hidden");
    }
  });

  test("en escritorio el velo no vacía el escenario antes de que asome la sección siguiente", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "La historia fija es solo para escritorio.");
    await page.goto("/");
    await progreso(page, 1);
    const velo = Number(await page.locator(".h-velo").evaluate((e) => getComputedStyle(e).opacity));
    expect(velo).toBeGreaterThan(0.1);
    expect(velo).toBeLessThan(0.9);
  });
});
