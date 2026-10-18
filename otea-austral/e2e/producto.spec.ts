import { expect, test, type Page } from "@playwright/test";
import { sinScrollHorizontal, vigilarErrores } from "./ayudas";

/** Lleva un elemento al centro de la pantalla sin animar el desplazamiento. */
async function centrar(page: Page, selector: string) {
  await page.evaluate((s) => {
    const el = document.querySelector(s)!;
    const r = el.getBoundingClientRect();
    scrollTo({ top: r.top + scrollY - (innerHeight - Math.min(r.height, innerHeight)) / 2, behavior: "instant" });
  }, selector);
}

const avisosVisibles = (page: Page) => page.locator("#temas .tm-aviso:not([data-oculto])");

test.describe("producto: vitrina, «Tu mañana», noche → alba y lista de espera", () => {
  test("la vitrina cambia de escenario y la prueba quita la fuente primaria con las reglas reales", async ({ page }) => {
    const errores = vigilarErrores(page);
    await page.goto("/");
    const vitrina = page.getByRole("group", { name: "Vitrina de alertas de ejemplo" });
    await vitrina.scrollIntoViewIfNeeded();
    const ormuz = page.locator("#alerta-ejemplo-ormuz");
    await expect(ormuz).toBeVisible();
    await expect(page.locator("#alerta-ejemplo-cobre")).toBeHidden();

    // La prueba: la confianza calculada baja de alta a baja y la regla del impacto alto ya no se cumple.
    const prueba = page.getByRole("switch", { name: "Prueba: quita la fuente primaria" });
    await prueba.check();
    await expect(ormuz.getByText("Confianza baja", { exact: true }).first()).toBeVisible();
    // «Confianza alta» está en la insignia y en una fila: con la prueba, ninguna se ve.
    await expect(ormuz.getByText("Confianza alta", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(ormuz.getByText(/No podría publicarse como impacto alto/)).toBeVisible();
    await expect(page.locator(".vitrina-panel-ormuz .nota-2").getByText(/Alta → baja/)).toBeVisible();
    await prueba.uncheck();
    await expect(ormuz.getByText("Confianza alta", { exact: true }).first()).toBeVisible();
    await expect(ormuz.getByText(/No podría publicarse como impacto alto/)).toBeHidden();

    // Cobre: la corrección queda a la vista.
    await page.getByRole("radio", { name: "Cobre" }).check();
    await expect(page.locator("#alerta-ejemplo-cobre")).toBeVisible();
    await expect(page.locator("#alerta-ejemplo-cobre").getByText(/Corregida el/)).toBeVisible();
    await expect(ormuz).toBeHidden();
    // Fuera de Ormuz no hay prueba que hacer.
    await expect(prueba).toBeHidden();
    // Las flechas del teclado recorren los escenarios (radios nativos).
    await page.getByRole("radio", { name: "Cobre" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Chips" })).toBeChecked();
    await expect(page.locator("#alerta-ejemplo-chips")).toBeVisible();

    expect(await sinScrollHorizontal(page)).toBe(true);
    expect(errores).toEqual([]);
  });

  test("«Tu mañana»: marcar Energía suma un aviso de ejemplo y el contador lo sigue", async ({ page }) => {
    const errores = vigilarErrores(page);
    await page.goto("/");
    const energia = page.getByRole("button", { name: /Energía/ });
    await energia.scrollIntoViewIfNeeded();
    await expect(avisosVisibles(page)).toHaveCount(2);
    await expect(page.locator(".tm-cifra")).toHaveText("2");
    if (page.viewportSize()!.width < 640) {
      // En el teléfono se ve un solo aviso y «y N más»: la cifra y la barra siguen contando todos.
      await expect(page.locator("#temas .tm-aviso:visible")).toHaveCount(1);
      await expect(page.getByText("y 1 aviso más en tus temas")).toBeVisible();
    }
    await energia.click();
    await expect(energia).toHaveAttribute("aria-pressed", "true");
    await expect(avisosVisibles(page)).toHaveCount(3);
    await expect(page.locator(".tm-cifra")).toHaveText("3");
    await expect(page.getByRole("complementary", { name: "Tu mañana, vista previa" })).toContainText(
      "Recorte de producción anunciado por un grupo de productores",
    );
    // Los avisos que salen quedan fuera del árbol de accesibilidad y del orden del teclado.
    await energia.click();
    await expect(avisosVisibles(page)).toHaveCount(2);
    await expect(page.locator("#temas .tm-aviso[data-oculto]").first()).toHaveAttribute("aria-hidden", "true");
    expect(errores).toEqual([]);
  });

  test("con movimiento, a los 4 s todo queda en su estado final", async ({ page }) => {
    await page.goto("/");
    for (const selector of [".vitrina-panel-ormuz .vitrina-notas", "#temas .tm-manana", ".terminal-lineas", ".bandeja-pila"]) {
      await centrar(page, selector);
      await page.waitForTimeout(4000);
      const pendientes = await page.evaluate((s) => {
        const zona = document.querySelector(s)!;
        return [zona, ...zona.querySelectorAll("*")]
          // El cursor de la terminal se apaga a propósito al terminar de escribir.
          .filter((el) => el.getClientRects().length > 0 && !el.closest("[data-oculto], .terminal-cursor"))
          .filter((el) => {
            const e = getComputedStyle(el);
            return Number(e.opacity) < 1 || (e.translate !== "none" && e.translate !== "0px") || !/^none$|^matrix\(1, 0, 0, 1, 0, 0\)$/.test(e.transform);
          })
          .map((el) => el.className.toString());
      }, selector);
      // La de atrás de la bandeja queda a escala 0,96 a propósito (con `scale`, no con `transform`).
      expect(pendientes, selector).toEqual([]);
    }
  });

  test("la noche se abre a sangre y amanece; el texto queda dentro de la banda", async ({ page }) => {
    await page.goto("/");
    const noche = page.locator("section[aria-labelledby='pre-apertura-titulo']");
    await noche.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const s = document.querySelector(".noche")!;
      // Más allá del 70 % de su vista: el marco ya se abrió y el alba terminó de subir.
      scrollTo({ top: s.getBoundingClientRect().top + scrollY + 0.6 * s.getBoundingClientRect().height, behavior: "instant" });
    });
    await page.waitForTimeout(600);
    const estado = await page.evaluate(() => ({
      recorte: getComputedStyle(document.querySelector(".noche-fondo")!).clipPath,
      alba: Number(getComputedStyle(document.querySelector(".noche-alba")!).opacity),
    }));
    expect(["none", "inset(0px)"]).toContain(estado.recorte);
    expect(estado.alba).toBeGreaterThan(0.9);
    await expect(noche.getByText("Antes de la apertura del mercado local (objetivo)")).toBeVisible();
    // Orden de la portada: pre-apertura, preguntas y lista de espera.
    const orden = await page.evaluate(() =>
      [".noche", "#preguntas", "#lista-de-espera"].map((s) => document.querySelector(s)!.getBoundingClientRect().top),
    );
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  test("lista de espera: «Así llega» y la validación en línea sin rojo", async ({ page }) => {
    const errores = vigilarErrores(page);
    await page.goto("/");
    const lista = page.locator("#lista-de-espera");
    await lista.scrollIntoViewIfNeeded();
    await expect(lista.locator(".bandeja")).toContainText("Datos de ejemplo");
    await expect(lista.locator(".notif")).toHaveCount(2);
    // En el teléfono «Así llega» no se muestra (la pantalla ya es el teléfono, y acorta la portada).
    const telefono = page.viewportSize()!.width < 640;
    await expect(lista.locator(".bandeja")).toBeVisible({ visible: !telefono });
    await expect(lista.locator(".campo-pista")).toBeHidden();
    const correo = page.getByLabel("Tu correo");
    const boton = page.getByRole("button", { name: "Unirme a la lista" });
    const antes = (await boton.boundingBox())!.y;
    await correo.fill("no-es-correo");
    await correo.blur();
    // `:user-invalid`: pista en línea y borde tinta de 2 px, sin JavaScript de por medio.
    await expect(lista.locator(".campo-pista")).toBeVisible();
    // La pista tiene su renglón reservado: al aparecer (el clic en «Unirme» saca el foco del campo) no mueve el botón,
    // y el clic no cae fuera de él.
    expect((await boton.boundingBox())!.y).toBe(antes);
    expect(await correo.evaluate((e) => getComputedStyle(e).boxShadow)).toContain("2px");
    await correo.fill("persona@correo.cl");
    await correo.blur();
    await expect(lista.locator(".campo-pista")).toBeHidden();
    await expect(lista.locator("form")).toHaveAttribute("data-estado", "inicial");
    expect(errores).toEqual([]);
  });
});

test.describe("producto sin movimiento ni JavaScript", () => {
  test("con movimiento reducido no corre ninguna animación y la vitrina y los temas responden al instante", async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    const errores = vigilarErrores(page);
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    await page.getByRole("group", { name: "Vitrina de alertas de ejemplo" }).scrollIntoViewIfNeeded();
    await page.getByRole("switch", { name: "Prueba: quita la fuente primaria" }).check();
    await expect(page.locator("#alerta-ejemplo-ormuz").getByText("Confianza baja", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Energía/ }).click();
    await expect(avisosVisibles(page)).toHaveCount(3);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(errores).toEqual([]);
    await contexto.close();
  });

  test("sin JavaScript la vitrina funciona con :has y «Tu mañana» muestra la selección por defecto", async ({ browser }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    await page.goto("/");
    await page.getByRole("switch", { name: "Prueba: quita la fuente primaria" }).check();
    await expect(page.locator("#alerta-ejemplo-ormuz").getByText(/No podría publicarse como impacto alto/)).toBeVisible();
    await page.getByRole("radio", { name: "Cobre" }).check();
    await expect(page.locator("#alerta-ejemplo-cobre").getByText(/Corregida el/)).toBeVisible();
    await expect(avisosVisibles(page)).toHaveCount(2);
    await expect(page.locator(".terminal-linea")).toHaveCount(4);
    await contexto.close();
  });
});
