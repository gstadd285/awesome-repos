import { randomInt } from "node:crypto";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { SESION_ADMIN, vigilarErrores } from "./ayudas";
import { correosPara, crearCuenta, correoUnico, enviar, esperarCorreo } from "./cuentas-ayudas";
import { expect, test } from "./fixtures";
import { URL_IA } from "./puertos";

/**
 * Temas seguidos y resumen diario por correo (`docs/alertas-reales.md` §7), de punta a punta y con Postgres real: la dueña
 * publica dos alertas reales en el panel (3200); una persona con cuenta elige sus temas en la portada (dejan de ser una vista
 * previa), ve /alertas filtrado por ellos (con la opción de ver todas) y pide el resumen en su perfil; el servicio de tareas
 * (3201, `RESUMEN_MODO=activo`) le envía uno —y uno solo— al servidor que imita a Resend; abrir el enlace de baja no cambia
 * nada, el POST de la baja de un clic sí, y el enlace no sirve dos veces. En el sitio público la tarea no existe.
 *
 * DATOS DE PRUEBA: las alertas «reales» son ficticias («(prueba)», enlaces de example.org), en la base desechable de las pruebas.
 */
test.skip(!process.env.DATABASE_URL, "Sin base de datos no hay panel, cuentas ni tareas.");
test.use({ storageState: SESION_ADMIN });

const SECRETO = process.env.E2E_TAREAS_SECRETO ?? "";
const RUTA_TAREA = "/api/tareas/resumen";
const METODOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** La dueña publica una alerta real (no de ejemplo) desde el panel, con una fuente del registro. */
async function publicar(page: Page, tema: string, evento: string, sufijo: string) {
  await page.goto("/admin/alertas/nueva");
  const form = page.getByRole("form", { name: "Nueva alerta" });
  await form.getByLabel("Tema").selectOption(tema);
  await form.getByLabel("Impacto", { exact: true }).selectOption("medio");
  await form.getByLabel("Evento").fill(evento);
  await form.getByLabel("Resumen").fill("Escenario ficticio de las pruebas de navegador, escrito con palabras propias.");
  await form.locator('[name="fila_0_sector"]').fill("Sector de prueba");
  await form.locator('[name="fila_0_direccion"]').selectOption("condicionado");
  await form.locator('[name="fila_0_condicion"]').fill("Si el escenario de prueba se confirma");
  await form.locator('[name="fila_0_confianza"]').selectOption("media");
  await form.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page).toHaveURL(/\/admin\/alertas\/[0-9a-f-]{36}\?hecho=creada$/);
  const enlace = page.getByRole("form", { name: "Enlazar fuente" });
  await enlace.getByLabel("Fuente del registro").selectOption("bcch");
  await enlace.getByLabel("Título del documento").fill(`Documento de prueba ${sufijo}`);
  await enlace.getByLabel("Enlace (solo https)").fill(`https://example.org/e2e/${sufijo}/${tema}`);
  await enlace.getByLabel("Fecha de publicación").fill("2026-10-01");
  await enlace.getByRole("button", { name: "Enlazar fuente" }).click();
  await expect(page.getByText("Fuente enlazada.")).toBeVisible();
  await page.getByRole("form", { name: "Enviar a revisión" }).getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("Alerta enviada a revisión.")).toBeVisible();
  await page.getByRole("form", { name: "Publicar" }).getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Alerta publicada.")).toBeVisible();
}

/** Un navegador sin la sesión del panel ni de ninguna cuenta, con su propia IP. */
async function sinSesion(browser: Browser, ip: string) {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": ip } });
  return { contexto, page: await contexto.newPage() };
}

const correrResumen = (request: APIRequestContext) =>
  request.post(`${URL_IA}${RUTA_TAREA}`, { headers: { "x-otea-tarea": SECRETO } });

test("temas seguidos, /alertas filtrado y resumen diario con baja de un clic", async ({ page, browser, request, ip }) => {
  test.setTimeout(150_000);
  const sufijo = `${Date.now().toString(36)}${randomInt(1e6).toString(36)}`;
  const energia = `Evento de energía e2e ${sufijo} (prueba)`;
  const divisas = `Evento de divisas e2e ${sufijo} (prueba)`;
  const persona = await sinSesion(browser, ip.replace(/\.\d+$/, `.${(Number(ip.split(".")[3]) + 7) % 250 + 2}`));
  const p = persona.page;
  const errores = vigilarErrores(p);
  const correo = correoUnico("resumen");

  try {
    await test.step("la dueña publica dos alertas reales: una de energía y una de divisas", async () => {
      await publicar(page, "energia", energia, sufijo);
      await publicar(page, "divisas", divisas, sufijo);
    });

    await test.step("con sesión, «Elige qué seguir» de la portada guarda los temas de la cuenta", async () => {
      await crearCuenta(p, request, correo);
      await p.goto("/");
      const temas = p.getByRole("list", { name: "Temas disponibles" });
      const boton = temas.getByRole("button", { name: /Energía/ });
      await boton.scrollIntoViewIfNeeded();
      // Una cuenta nueva no sigue ningún tema: nada marcado y nada de «vista previa».
      await expect(boton).toHaveAttribute("aria-pressed", "false");
      await expect(p.getByText(/aún no se guardan/)).toHaveCount(0);
      const guardar = p.getByRole("form", { name: "Guardar mis temas" });
      await boton.click();
      await expect(guardar.getByRole("status")).toHaveText("Tienes cambios sin guardar.");
      await guardar.getByRole("button", { name: "Guardar mis temas" }).click();
      await expect(guardar.getByRole("status")).toHaveText("Tus temas quedaron guardados en tu cuenta.");
      await p.reload();
      await expect(p.getByRole("list", { name: "Temas disponibles" }).getByRole("button", { name: /Energía/ })).toHaveAttribute("aria-pressed", "true");
      await expect(p.getByRole("list", { name: "Temas disponibles" }).getByRole("button", { name: /Divisas/ })).toHaveAttribute("aria-pressed", "false");
      // El perfil muestra lo mismo: es el mismo dato.
      await p.goto("/cuenta");
      await expect(p.getByLabel(/^Energía/)).toBeChecked();
    });

    await test.step("/alertas muestra solo sus temas, con la opción de ver todas", async () => {
      await p.goto("/alertas");
      const nota = p.getByRole("note", { name: "Temas que se muestran" });
      await expect(nota).toContainText("Mostrando tus temas: Energía");
      await expect(p.locator("main article").filter({ hasText: energia })).toBeVisible();
      await expect(p.locator("main article").filter({ hasText: divisas })).toHaveCount(0);
      await nota.getByRole("link", { name: "Ver todas" }).click();
      await expect(p).toHaveURL(/\/alertas\?ver=todas$/);
      await expect(p.locator("main article").filter({ hasText: divisas })).toBeVisible();
      await expect(p.locator("main article").filter({ hasText: energia })).toBeVisible();
      await p.getByRole("note", { name: "Temas que se muestran" }).getByRole("link", { name: "Solo mis temas" }).click();
      await expect(p.locator("main article").filter({ hasText: divisas })).toHaveCount(0);
    });

    await test.step("pide el resumen en su perfil (casilla separada, con la fecha)", async () => {
      await p.goto("/cuenta");
      await p.getByLabel(/Quiero recibir por correo un resumen diario/).check();
      await enviar(p, p.getByRole("button", { name: "Guardar cambios" }));
      await expect(p.getByText("Cambios guardados.")).toBeVisible();
      await p.reload();
      await expect(p.getByLabel(/Quiero recibir por correo un resumen diario/)).toBeChecked();
      await expect(p.getByText(/^Lo pediste el /)).toBeVisible();
    });

    let baja = "";
    await test.step("el servicio de tareas le envía un resumen, uno solo aunque corra otra vez", async () => {
      const r = await correrResumen(request);
      expect(r.status()).toBe(200);
      const cuerpo = await r.json();
      expect(Object.keys(cuerpo).sort()).toEqual(["cuentas", "cupo_agotado", "enviados", "fallos", "resultado", "sin_novedades"]);
      expect(cuerpo.enviados).toBeGreaterThanOrEqual(1);
      const recibido = await esperarCorreo(request, correo, /Tu resumen de Otea Austral/);
      expect(recibido.texto).toContain(`Energía · confianza alta · ${energia}`);
      expect(recibido.texto).not.toContain(divisas);
      expect(recibido.texto).toContain("Información y análisis; no es asesoría.");
      expect(recibido.texto).not.toMatch(/Escenario ficticio|example\.org|Sector de prueba/);
      expect(recibido.cabeceras["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      baja = /^<(https?:\/\/[^>]+)>$/.exec(recibido.cabeceras["List-Unsubscribe"] ?? "")?.[1] ?? "";
      expect(new URL(baja).pathname).toBe("/api/resumen/baja");
      expect(recibido.texto).toContain(baja);

      expect((await correrResumen(request)).status()).toBe(200);
      expect((await correosPara(request, correo)).filter((c) => /Tu resumen/.test(c.asunto))).toHaveLength(1);
    });

    const rutaBaja = () => `${new URL(baja).pathname}${new URL(baja).search}`;
    await test.step("abrir el enlace de baja (GET) no cambia nada: la página pide confirmar", async () => {
      await p.goto(rutaBaja());
      await expect(p).toHaveURL(/\/resumen\/baja\?t=[A-Za-z0-9_-]{43}$/);
      await expect(p.getByRole("heading", { level: 1 })).toHaveText(/¿Dejar el resumen diario\?/);
      await p.goto("/cuenta");
      await expect(p.getByLabel(/Quiero recibir por correo un resumen diario/)).toBeChecked();
    });

    await test.step("el POST de la baja de un clic (como lo envía un programa de correo) lo apaga; el enlace no sirve dos veces", async () => {
      const r = await request.post(rutaBaja(), { form: { "List-Unsubscribe": "One-Click" } });
      expect(r.status()).toBe(200);
      expect(await r.text()).toMatch(/ya no recibirás el resumen/);
      await p.goto("/cuenta");
      await expect(p.getByLabel(/Quiero recibir por correo un resumen diario/)).not.toBeChecked();
      await p.goto("/cuenta/seguridad");
      await expect(p.locator("main")).toContainText("Dejaste el resumen diario por correo");
      // El botón de la página, con el mismo enlace ya usado: «no válido», y nada cambia.
      await p.goto(rutaBaja());
      await p.getByRole("button", { name: "Dejar de recibirlo" }).click();
      await expect(p).toHaveURL(/\/resumen\/baja\?estado=invalido$/);
      await expect(p.getByRole("heading", { level: 1 })).toHaveText(/Enlace no válido/);
    });

    expect(errores).toEqual([]);
  } finally {
    await persona.contexto.close();
  }
});

test("la tarea del resumen no existe en el sitio público, y en el de tareas exige el secreto", async ({ request }) => {
  for (const method of METODOS) {
    const r = await request.fetch(RUTA_TAREA, { method, headers: { "x-otea-tarea": SECRETO || "x".repeat(43) } });
    expect(r.status(), method).toBe(404);
    expect(r.headers().allow, method).toBeUndefined();
  }
  expect((await request.post(`${URL_IA}${RUTA_TAREA}`)).status()).toBe(404);
  expect((await request.post(`${URL_IA}${RUTA_TAREA}`, { headers: { "x-otea-tarea": `${SECRETO}x` } })).status()).toBe(404);
  expect((await request.get(`${URL_IA}${RUTA_TAREA}`, { headers: { "x-otea-tarea": SECRETO } })).status()).toBe(404);
});
