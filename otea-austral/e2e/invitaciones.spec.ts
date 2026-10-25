import { randomInt } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import pg from "pg";
import { crearCifradorCuentas } from "../src/lib/cuentas/cifrado";
import { SESION_ADMIN, vigilarErrores } from "./ayudas";
import { CLAVE, correosPara, correoUnico, ESPERA_TRAMPA_MS, esperarCorreo, otroNavegador, rutaDelEnlace } from "./cuentas-ayudas";
import { expect, test } from "./fixtures";
import { URL_INVITACION } from "./puertos";

/**
 * Acceso anticipado privado (`docs/alertas-reales.md` §6), de punta a punta y con Postgres real: una alerta real publicada
 * en el panel no aparece sin sesión (ni en el HTML, ni en el flujo RSC, ni en el mapa del sitio); la dueña emite una
 * invitación en el panel (3200); con ella se crea una cuenta en la instancia por invitación (3202, misma base y mismo
 * secreto); con sesión se ve lo real; el código usado, uno vencido, uno revocado y uno inventado reciben la misma respuesta
 * y no envían nada.
 *
 * DATOS DE PRUEBA: la alerta «real» es ficticia, con enlaces de example.org, en la base desechable de las pruebas.
 */
test.skip(!process.env.DATABASE_URL, "Sin base de datos no hay panel ni cuentas.");
test.use({ storageState: SESION_ADMIN });

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const codigoAlAzar = () =>
  Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ALFABETO[randomInt(32)]).join("")).join("-");

/** Otra IP para cada navegador de la prueba: los límites de alta son por IP. */
const otraIp = (ip: string, n: number) => ip.replace(/\.\d+$/, `.${(Number(ip.split(".")[3]) + n) % 250 + 2}`);

/** Un navegador nuevo y sin cookies (ni la del panel ni la de una cuenta). */
async function sinSesion(browser: Browser, ip: string) {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": ip } });
  return { contexto, page: await contexto.newPage() };
}

/** Pide el alta en la instancia por invitación; devuelve el aviso que se muestra (debe ser el mismo pase lo que pase). */
async function pedirAlta(page: Page, codigo: string, correo: string): Promise<string> {
  await page.goto(`${URL_INVITACION}/cuenta/crear`);
  await page.getByLabel("Código de invitación").fill(codigo);
  await page.getByLabel("Tu correo").fill(correo);
  await page.getByLabel(/Acepto las condiciones de uso/).check();
  await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
  await page.waitForTimeout(ESPERA_TRAMPA_MS);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  const aviso = page.locator("main").getByText(/Paso 1 de 2 listo/);
  await expect(aviso).toBeVisible();
  return (await aviso.textContent()) ?? "";
}

test("acceso privado: emitir en el panel, crear la cuenta con la invitación y ver lo real solo con sesión", async ({ page, browser, request, ip }) => {
  test.setTimeout(150_000);
  const errores = vigilarErrores(page);
  const sufijo = `${Date.now().toString(36)}${randomInt(1e6).toString(36)}`;
  const evento = `Evento de prueba real e2e ${sufijo} (prueba)`;
  const abiertos: { contexto: { close(): Promise<void> } }[] = [];

  try {
    await test.step("la dueña publica una alerta real (no de ejemplo) desde el panel", async () => {
      await page.goto("/admin/alertas/nueva");
      const form = page.getByRole("form", { name: "Nueva alerta" });
      await form.getByLabel("Tema").selectOption("cobre");
      await form.getByLabel("Impacto", { exact: true }).selectOption("medio");
      await form.getByLabel("Evento").fill(evento);
      await form.getByLabel("Resumen").fill("Escenario ficticio de las pruebas de navegador, escrito con palabras propias.");
      await form.locator('[name="fila_0_sector"]').fill("Mineras de prueba");
      await form.locator('[name="fila_0_direccion"]').selectOption("gana");
      await form.locator('[name="fila_0_condicion"]').fill("Si el precio se sostiene");
      await form.locator('[name="fila_0_confianza"]').selectOption("media");
      await expect(form.getByLabel(/Datos de ejemplo/)).not.toBeChecked();
      await form.getByRole("button", { name: "Guardar borrador" }).click();
      await expect(page).toHaveURL(/\/admin\/alertas\/[0-9a-f-]{36}\?hecho=creada$/);
      await expect(page.getByRole("note", { name: "Quién ve las alertas reales" })).toBeVisible();

      const enlace = page.getByRole("form", { name: "Enlazar fuente" });
      await enlace.getByLabel("Fuente del registro").selectOption("bcch");
      await enlace.getByLabel("Título del documento").fill(`Documento de prueba ${sufijo}`);
      await enlace.getByLabel("Enlace (solo https)").fill(`https://example.org/e2e/${sufijo}/real`);
      await enlace.getByLabel("Fecha de publicación").fill("2026-10-01");
      await enlace.getByRole("button", { name: "Enlazar fuente" }).click();
      await expect(page.getByText("Fuente enlazada.")).toBeVisible();
      await page.getByRole("form", { name: "Enviar a revisión" }).getByRole("button", { name: "Enviar a revisión" }).click();
      await expect(page.getByText("Alerta enviada a revisión.")).toBeVisible();
      await page.getByRole("form", { name: "Publicar" }).getByRole("button", { name: "Publicar" }).click();
      await expect(page.getByText("Alerta publicada.")).toBeVisible();
    });

    await test.step("sin sesión no aparece nada real: ni en el HTML, ni en el flujo RSC, ni en el mapa del sitio", async () => {
      const visita = await sinSesion(browser, otraIp(ip, 1));
      abiertos.push(visita);
      for (const [origen, aviso] of [
        [URL_INVITACION, "Las alertas reales son por invitación."],
        ["http://localhost:3200", "Las alertas reales se ven con tu cuenta."],
      ] as const) {
        const respuesta = await visita.page.goto(`${origen}/alertas`);
        const cache = respuesta?.headers()["cache-control"] ?? "";
        expect(cache, origen).toContain("private");
        expect(cache, origen).toContain("no-store");
        await expect(visita.page.getByRole("heading", { level: 1, name: "Alertas publicadas." })).toBeVisible();
        await expect(visita.page.getByRole("note", { name: "Acceso a las alertas reales" })).toContainText(aviso);
        const tarjetas = visita.page.locator("main article");
        expect(await tarjetas.count(), origen).toBeGreaterThan(0);
        for (const tarjeta of await tarjetas.all()) await expect(tarjeta.getByText("Datos de ejemplo").first()).toBeVisible();
        expect(await visita.page.content(), origen).not.toContain(sufijo);
        const rsc = await visita.page.request.get(`${origen}/alertas`, { headers: { RSC: "1" } });
        expect(await rsc.text(), `${origen} RSC`).not.toContain(sufijo);
        for (const ruta of ["/sitemap.xml", "/robots.txt", "/manifest.webmanifest"]) {
          expect(await (await visita.page.request.get(`${origen}${ruta}`)).text(), `${origen}${ruta}`).not.toContain(sufijo);
        }
      }
    });

    let codigo = "";
    await test.step("la dueña emite una invitación: el código se muestra una sola vez", async () => {
      await page.goto("/admin/invitaciones");
      await expect(page.getByRole("heading", { level: 1, name: "Invitaciones" })).toBeVisible();
      const form = page.getByRole("form", { name: "Emitir invitación" });
      await form.getByLabel("Alias").fill(`e2e-${sufijo}`);
      await form.getByLabel("Vigencia (días)").fill("3");
      await form.getByRole("button", { name: "Emitir invitación" }).click();
      const emitida = page.getByRole("status", { name: "Invitación emitida" });
      await expect(emitida).toContainText(`Invitación «e2e-${sufijo}» emitida`);
      codigo = (await emitida.locator("[data-codigo-invitacion]").textContent())?.trim() ?? "";
      expect(codigo).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
      await expect(page.locator("tr", { hasText: `e2e-${sufijo}` })).toHaveAttribute("data-estado", "vigente");
      await page.reload();
      expect(await page.content()).not.toContain(codigo);
      expect(await page.content()).not.toContain(codigo.replaceAll("-", ""));
    });

    const correo = correoUnico("invitada");
    let aviso = "";
    await test.step("con la invitación se crea la cuenta (el código no vuelve del servidor, y el campo lo conserva)", async () => {
      const invitada = await otroNavegador(browser, otraIp(ip, 2));
      abiertos.push(invitada);
      const p = invitada.page;
      await p.goto(`${URL_INVITACION}/cuenta/crear`);
      await expect(p.getByText(/las cuentas se crean por invitación/)).toBeVisible();
      // Sin la casilla de privacidad: el error vuelve sin el código, y el campo no se vacía.
      await p.getByLabel("Código de invitación").fill(codigo.toLowerCase());
      await p.getByLabel("Tu correo").fill(correo);
      await p.getByLabel(/Acepto las condiciones de uso/).check();
      const [respuesta] = await Promise.all([
        p.waitForResponse((r) => r.request().method() === "POST"),
        p.getByRole("button", { name: "Crear mi cuenta" }).click(),
      ]);
      const cuerpo = await respuesta.text();
      expect(cuerpo).not.toContain(codigo.toLowerCase());
      expect(cuerpo).not.toContain(codigo);
      await expect(p.locator("main").getByRole("alert").first()).toContainText("Revisa los datos marcados.");
      await expect(p.getByLabel("Código de invitación")).toHaveValue(codigo.toLowerCase());

      await p.getByLabel(/Acepto que Otea guarde mi correo/).check();
      await p.waitForTimeout(ESPERA_TRAMPA_MS);
      await p.getByRole("button", { name: "Crear mi cuenta" }).click();
      const listo = p.locator("main").getByText(/Paso 1 de 2 listo/);
      await expect(listo).toContainText("Si el código de invitación y el correo son válidos");
      aviso = (await listo.textContent()) ?? "";

      const recibido = await esperarCorreo(request, correo, /Confirma tu correo/);
      expect(recibido.texto + recibido.html).not.toContain(codigo);
      await p.goto(`${URL_INVITACION}${rutaDelEnlace(recibido)}`);
      await p.getByLabel("Elige tu contraseña").fill(CLAVE);
      await p.getByLabel("Repite tu contraseña").fill(CLAVE);
      await p.getByRole("button", { name: "Crear mi cuenta y entrar" }).click();
      await expect(p).toHaveURL(/\/cuenta\?aviso=bienvenida$/);

      await test.step("con sesión, /alertas muestra lo real publicado y nada de ejemplo, en una respuesta privada", async () => {
        const r = await p.goto(`${URL_INVITACION}/alertas`);
        expect(r?.headers()["cache-control"] ?? "").toContain("private");
        expect(r?.headers()["cache-control"] ?? "").toContain("no-store");
        await expect(p.getByRole("note", { name: "Acceso anticipado privado" })).toContainText("textos legales en revisión");
        await expect(p.locator("main article").filter({ hasText: evento })).toBeVisible();
        await expect(p.locator("main").getByText("Datos de ejemplo")).toHaveCount(0);
      });
    });

    await test.step("el panel la muestra usada, con su fila en la auditoría", async () => {
      await page.goto("/admin/invitaciones");
      await expect(page.locator("tr", { hasText: `e2e-${sufijo}` })).toHaveAttribute("data-estado", "usada");
      await expect(page.getByRole("list", { name: "Últimos movimientos" })).toContainText(`Usada · e2e-${sufijo} · al crear la cuenta`);
    });

    // Una invitación vencida, escrita directo en la base (no se puede esperar 14 días), con un código conocido.
    const vencido = codigoAlAzar();
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await cliente.connect();
    try {
      const huella = crearCifradorCuentas(process.env.E2E_CUENTAS_SECRETO ?? "").hashInvitacion(vencido.replaceAll("-", ""));
      await cliente.query(
        "insert into invitaciones (codigo_hash, alias, emitida, vence) values ($1, $2, now() - interval '20 days', now() - interval '6 days')",
        [huella, `e2e-vencida-${sufijo}`],
      );
    } finally {
      await cliente.end();
    }

    let revocado = "";
    await test.step("una invitación revocada en el panel", async () => {
      await page.goto("/admin/invitaciones");
      const form = page.getByRole("form", { name: "Emitir invitación" });
      await form.getByLabel("Alias").fill(`e2e-revocada-${sufijo}`);
      await form.getByRole("button", { name: "Emitir invitación" }).click();
      revocado = (await page.locator("[data-codigo-invitacion]").textContent())?.trim() ?? "";
      expect(revocado).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
      await page.getByRole("form", { name: `Revocar e2e-revocada-${sufijo}` }).getByRole("button", { name: "Revocar" }).click();
      await expect(page.getByText("Invitación revocada. Queda en la auditoría.")).toBeVisible();
      await expect(page.locator("tr", { hasText: `e2e-revocada-${sufijo}` })).toHaveAttribute("data-estado", "revocada");
    });

    await test.step("el código usado, uno vencido, uno revocado y uno inventado: la misma respuesta y ningún correo", async () => {
      for (const [n, [nombre, otro]] of ([
        ["usado", codigo],
        ["vencido", vencido],
        ["revocado", revocado],
        ["inventado", codigoAlAzar()],
      ] as const).entries()) {
        const visita = await sinSesion(browser, otraIp(ip, 10 + n));
        abiertos.push(visita);
        const destino = correoUnico(`invitacion-${nombre}`);
        expect(await pedirAlta(visita.page, otro, destino), nombre).toBe(aviso);
        expect(await correosPara(request, destino), nombre).toEqual([]);
      }
      // Y la persona invitada no recibió nada más: su cuenta ya existe y el código no se volvió a usar con su correo.
      expect((await correosPara(request, correo)).length).toBe(1);
    });
  } finally {
    for (const { contexto } of abiertos) await contexto.close();
  }
  expect(errores).toEqual([]);
});
