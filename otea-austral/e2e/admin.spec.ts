import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { crearSesion } from "../src/lib/admin/sesion";
import { CODIGO_USADO, SESION_ADMIN, vigilarErrores } from "./ayudas";

// DATOS DE EJEMPLO: alertas ficticias, marcadas como ejemplo, en la base desechable de las pruebas.
test.skip(!process.env.DATABASE_URL, "Sin base de datos no hay panel.");

test.describe("panel interno sin sesión", () => {
  test("pide acceso y no se indexa", async ({ page }) => {
    await page.goto("/admin/alertas");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Acceso al panel." })).toBeVisible();
    const r = await page.request.get("/admin");
    expect(r.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  });

  test("rechaza un código incorrecto sin decir qué dato falló", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Frase de acceso").fill(process.env.E2E_ADMIN_FRASE ?? "");
    await page.getByLabel("Código de tu app de autenticación").fill("000000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("status")).toHaveText(/La frase o el código no son correctos/);
    await expect(page).toHaveURL(/\/admin$/);
    expect((await page.context().cookies()).some((c) => c.name === "__Host-otea_admin")).toBe(false);
  });

  test("un código ya usado no se acepta de nuevo", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Frase de acceso").fill(process.env.E2E_ADMIN_FRASE ?? "");
    await page.getByLabel("Código de tu app de autenticación").fill(await readFile(CODIGO_USADO, "utf8"));
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("status")).toHaveText(/La frase o el código no son correctos/);
    expect((await page.context().cookies()).some((c) => c.name === "__Host-otea_admin")).toBe(false);
  });
});

/**
 * La validez de la sesión la decide la base, no solo la firma de la cookie.
 * Estas pruebas crean sus propias sesiones (con el secreto de firma de la
 * corrida y el usuario de la aplicación) para no usar códigos TOTP ni cerrar
 * la sesión que comparten las demás pruebas.
 */
test.describe("sesiones del panel", () => {
  async function contextoConCookie(browser: Browser, valor: string) {
    const contexto = await browser.newContext({ baseURL: "http://localhost:3200" });
    await contexto.addCookies([
      { name: "__Host-otea_admin", value: valor, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Strict" },
    ]);
    return contexto;
  }

  async function sesionRegistrada(): Promise<string> {
    const { valor, sesion } = crearSesion(process.env.E2E_ADMIN_SESION ?? "", Date.now());
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await cliente.connect();
    try {
      await cliente.query("insert into admin_sesiones (sid, expira) values ($1, $2)", [sesion.sid, new Date(sesion.exp)]);
    } finally {
      await cliente.end();
    }
    return valor;
  }

  test("cerrar sesión revoca la cookie, también una copia", async ({ browser }) => {
    const valor = await sesionRegistrada();
    const original = await contextoConCookie(browser, valor);
    const copia = await contextoConCookie(browser, valor);
    try {
      const pagina = await original.newPage();
      await pagina.goto("/admin/alertas");
      await expect(pagina).toHaveURL(/\/admin\/alertas$/);
      const otra = await copia.newPage();
      await otra.goto("/admin/alertas");
      await expect(otra).toHaveURL(/\/admin\/alertas$/);

      await pagina.getByRole("button", { name: "Salir" }).click();
      await expect(pagina).toHaveURL(/\/admin$/);
      expect((await original.cookies()).some((c) => c.name === "__Host-otea_admin")).toBe(false);

      // La cookie copiada tenía firma válida y no ha vencido, pero la sesión está revocada.
      await otra.goto("/admin/alertas");
      await expect(otra).toHaveURL(/\/admin$/);
      await expect(otra.getByRole("heading", { level: 1, name: "Acceso al panel." })).toBeVisible();
    } finally {
      await original.close();
      await copia.close();
    }
  });

  test("una cookie bien firmada pero sin sesión en la base no entra", async ({ browser }) => {
    const { valor } = crearSesion(process.env.E2E_ADMIN_SESION ?? "", Date.now());
    const contexto = await contextoConCookie(browser, valor);
    try {
      const pagina = await contexto.newPage();
      await pagina.goto("/admin/alertas");
      await expect(pagina).toHaveURL(/\/admin$/);
    } finally {
      await contexto.close();
    }
  });
});

test.describe("panel interno con sesión", () => {
  test.use({ storageState: SESION_ADMIN });

  const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function nuevaAlerta(page: Page, evento: string, resumen = "Escenario ficticio para las pruebas de navegador.") {
    await page.goto("/admin/alertas/nueva");
    const form = page.getByRole("form", { name: "Nueva alerta" });
    await form.getByLabel("Tema").selectOption("cobre");
    await form.getByLabel("Impacto", { exact: true }).selectOption("alto");
    await form.getByLabel("Evento").fill(evento);
    await form.getByLabel("Resumen").fill(resumen);
    await form.locator('[name="fila_0_sector"]').fill("Mineras de ejemplo");
    await form.locator('[name="fila_0_direccion"]').selectOption("gana");
    await form.locator('[name="fila_0_condicion"]').fill("Si el precio se sostiene");
    await form.locator('[name="fila_0_confianza"]').selectOption("alta");
    await form.getByLabel(/Datos de ejemplo/).check();
    return form;
  }

  async function enlazar(page: Page, fuente: string, n: number) {
    const form = page.getByRole("form", { name: "Enlazar fuente" });
    await form.getByLabel("Fuente del registro").selectOption(fuente);
    await form.getByLabel("Título del documento").fill(`Documento de ejemplo ${n}`);
    await form.getByLabel("Enlace (solo https)").fill(`https://example.org/e2e/${sufijo}/${n}`);
    await form.getByLabel("Fecha de publicación").fill("2026-10-01");
    await form.getByRole("button", { name: "Enlazar fuente" }).click();
    await expect(page.getByText("Fuente enlazada.")).toBeVisible();
  }

  async function presionar(page: Page, formulario: string, boton = formulario) {
    await page.getByRole("form", { name: formulario }).getByRole("button", { name: boton }).click();
  }

  test("de borrador a publicada, corregida y retractada, con auditoría", async ({ page }) => {
    const errores = vigilarErrores(page);
    const evento = `Evento de ejemplo e2e ${sufijo}`;

    await test.step("crear el borrador", async () => {
      const form = await nuevaAlerta(page, evento);
      await form.getByRole("button", { name: "Guardar borrador" }).click();
      await expect(page).toHaveURL(/\/admin\/alertas\/[0-9a-f-]{36}\?hecho=creada$/);
      await expect(page.getByText("Alerta creada como borrador.")).toBeVisible();
      await expect(page.locator("[data-confianza]").first()).toHaveAttribute("data-confianza", "baja");
    });

    await test.step("una fuente primaria sube la confianza a alta", async () => {
      await enlazar(page, "bcch", 1);
      await expect(page.locator("[data-confianza]").first()).toHaveAttribute("data-confianza", "alta");
      await expect(page.getByText("Fuente oficial")).toBeVisible();
    });

    await test.step("impacto alto no se publica sin dos organismos ni aprobación", async () => {
      await presionar(page, "Enviar a revisión");
      await expect(page.getByText("Alerta enviada a revisión.")).toBeVisible();
      await presionar(page, "Publicar");
      const alerta = page.getByRole("form", { name: "Publicar" }).getByRole("alert");
      await expect(alerta).toContainText("Impacto alto exige dos fuentes de organismos distintos.");
      await expect(alerta).toContainText("aprobación humana");

      await enlazar(page, "fed", 2);
      await presionar(page, "Aprobar", "Registrar aprobación");
      await expect(page.getByText("Aprobación registrada en la auditoría.")).toBeVisible();
      await presionar(page, "Publicar");
      await expect(page.getByText("Alerta publicada.")).toBeVisible();
    });

    await test.step("aparece en /alertas, marcada como ejemplo", async () => {
      const detalle = page.url();
      await page.goto("/alertas");
      const tarjeta = page.locator("article").filter({ hasText: evento });
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta.getByText("Datos de ejemplo")).toBeVisible();
      await expect(tarjeta).toHaveAttribute("data-estado", "publicada");
      await page.goto(detalle);
    });

    await test.step("una edición publicada se convierte en corrección pública", async () => {
      const form = page.getByRole("form", { name: "Editar contenido" });
      await form.getByLabel("Evento").fill(`${evento} (precisado)`);
      await form.getByLabel("Texto público de la corrección").fill("Se precisó el nombre del evento de ejemplo.");
      await form.getByRole("button", { name: "Publicar corrección" }).click();
      await expect(page.getByText("Cambios guardados.")).toBeVisible();
      await expect(page.getByText("Se precisó el nombre del evento de ejemplo.")).toBeVisible();
    });

    await test.step("la retractación no borra", async () => {
      const form = page.getByRole("form", { name: "Retractar" });
      await form.getByLabel("Texto público de la retractación").fill("El escenario de ejemplo no se confirmó.");
      await form.getByRole("button", { name: "Retractar" }).click();
      await expect(page.getByText(/Alerta retractada\./)).toBeVisible();
      await expect(page.getByRole("form", { name: "Editar contenido" })).toHaveCount(0);

      await page.goto("/alertas");
      const tarjeta = page.locator("article").filter({ hasText: `${evento} (precisado)` });
      await expect(tarjeta).toHaveAttribute("data-estado", "retractada");
      await expect(tarjeta.getByText("El escenario de ejemplo no se confirmó.").first()).toBeVisible();
    });

    await test.step("la auditoría registra cada paso con el alias del panel", async () => {
      await page.goBack();
      const filas = page.getByRole("table").last().locator("tbody tr");
      const acciones = await filas.locator("td:nth-child(2)").allTextContents();
      expect(acciones).toEqual([
        "Creada",
        "Editada",
        "Editada",
        "Editada",
        "Aprobada",
        "Publicada",
        "Corregida",
        "Retractada",
      ]);
      expect(new Set(await filas.locator("td:nth-child(3)").allTextContents())).toEqual(new Set(["e2e"]));
    });

    expect(errores).toEqual([]);
  });

  test("bloquea el lenguaje de recomendación", async ({ page }) => {
    const form = await nuevaAlerta(page, `Evento de ejemplo e2e ${sufijo} b`, "Recomendamos comprar mineras de ejemplo.");
    await form.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(form.getByRole("alert")).toContainText("evita lenguaje de recomendación");
    await expect(page).toHaveURL(/\/nueva$/);
  });

  test("un formulario con el token CSRF alterado no cambia nada", async ({ page }) => {
    const form = await nuevaAlerta(page, `Evento de ejemplo e2e ${sufijo} c`);
    await form.locator('input[name="csrf"]').evaluate((el: HTMLInputElement) => {
      el.value = "token-falso";
    });
    await form.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(form.getByRole("alert")).toContainText("El formulario venció o no es válido");
    await page.goto("/admin/alertas");
    await expect(page.getByText(`Evento de ejemplo e2e ${sufijo} c`)).toHaveCount(0);
  });
});
