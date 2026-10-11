import { randomBytes } from "node:crypto";
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { codigoTotp, decodificarBase32, pasoTotp } from "../src/lib/admin/totp";
import { expect } from "./fixtures";
import { URL_CORREO } from "./puertos";

/** Contraseñas de las pruebas: frases largas, que pasan la política (ni comunes ni con el correo o el nombre del sitio). */
export const CLAVE = "lluvia sobre el cerro azul";
export const CLAVE_NUEVA = "tres gatos viajan en tren";

/** La trampa de tiempo de los formularios que envían correo descarta los envíos hechos antes de 3 s: se espera un poco más. */
export const ESPERA_TRAMPA_MS = 3300;

export const COOKIE_CUENTA = "__Host-otea_sesion";

/** Un correo que no se repite entre corridas (la base de pruebas puede reutilizarse) ni entre pruebas. */
export function correoUnico(prefijo = "e2e"): string {
  return `${prefijo}.${Date.now().toString(36)}${randomBytes(4).toString("hex")}@example.org`;
}

export type CorreoRecibido = { para: string; de: string; asunto: string; texto: string; html: string; recibido: string };

export async function correosPara(request: APIRequestContext, para: string): Promise<CorreoRecibido[]> {
  const respuesta = await request.get(`${URL_CORREO}/__correos`, { params: { para } });
  expect(respuesta.ok()).toBe(true);
  return (await respuesta.json()) as CorreoRecibido[];
}

/** Espera a que «llegue» el correo con ese asunto (el `cuantos`-ésimo, si ya había otros del mismo tipo). */
export async function esperarCorreo(request: APIRequestContext, para: string, asunto: RegExp, cuantos = 1): Promise<CorreoRecibido> {
  const limite = Date.now() + 15_000;
  while (Date.now() < limite) {
    const hallados = (await correosPara(request, para)).filter((c) => asunto.test(c.asunto));
    if (hallados.length >= cuantos) return hallados[cuantos - 1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó el correo «${asunto}» a ${para}.`);
}

/** Camino y parámetros del enlace con token del correo (el origen es el del sitio configurado, no el del servidor de pruebas). */
export function rutaDelEnlace(correo: CorreoRecibido): string {
  const enlace = /https?:\/\/\S+token=\S+/.exec(correo.texto)?.[0];
  if (!enlace) throw new Error("El correo no trae un enlace con token.");
  const url = new URL(enlace);
  return `${url.pathname}${url.search}`;
}

/** Código de seis dígitos de la app de autenticación para el secreto que muestra la página. */
export function codigoDe(secreto: string, paso = pasoTotp(Date.now())): string {
  return codigoTotp(decodificarBase32(secreto), paso);
}

/** Otro navegador (otro dispositivo) de la misma persona de prueba, con la misma IP de la prueba y un agente propio. */
export async function otroNavegador(
  browser: Browser,
  ip: string,
  agente = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip }, userAgent: agente, viewport: { width: 1280, height: 800 } });
  return { contexto, page: await contexto.newPage() };
}

/** El aviso de error o de estado de la página (sin el anunciador de rutas de Next.js, que también es un `alert`). */
export const alerta = (page: Page): Locator => page.locator("main").getByRole("alert");

/** El mensaje de error de un campo (los enlazados con `aria-describedby`), distinto del texto de ayuda que lo acompaña. */
export const errorDeCampo = (page: Page, texto: string): Locator => page.locator("p[id$='-error']").filter({ hasText: texto });

/** Envía el formulario y espera la respuesta de la Server Action (un POST a la propia página). */
export async function enviar(page: Page, boton: Locator): Promise<void> {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), boton.click()]);
}

/** «Salir», y espera a que la acción termine: el servidor revoca la sesión y manda a la entrada con el aviso. */
export async function salir(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/cuenta\/entrar\?aviso=salida$/);
}

/** Paso 1 y paso 2: pide el alta, abre el enlace del correo y elige la contraseña. Termina en la página de bienvenida. */
export async function crearCuenta(page: Page, request: APIRequestContext, correo: string, clave = CLAVE): Promise<void> {
  await page.goto("/cuenta/crear");
  await page.getByLabel("Tu correo").fill(correo);
  await page.getByLabel(/Acepto las condiciones de uso/).check();
  await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
  await page.waitForTimeout(ESPERA_TRAMPA_MS);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByText(/Paso 1 de 2 listo/)).toBeVisible();
  const recibido = await esperarCorreo(request, correo, /Confirma tu correo/);
  await page.goto(rutaDelEnlace(recibido));
  await page.getByLabel("Elige tu contraseña").fill(clave);
  await page.getByLabel("Repite tu contraseña").fill(clave);
  await page.getByRole("button", { name: "Crear mi cuenta y entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta\?aviso=bienvenida$/);
}

/** Entra con correo y contraseña desde el formulario (no espera nada después: cada prueba mira lo que le toca). */
export async function entrar(page: Page, correo: string, clave = CLAVE): Promise<void> {
  await page.goto("/cuenta/entrar");
  await page.getByLabel("Tu correo").fill(correo);
  await page.getByLabel("Tu contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Lo básico de accesibilidad que se comprueba a mano: un solo h1, idioma, y cada campo con su nombre. */
export async function comprobarAccesibilidadBasica(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", /^es/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const sinNombre = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), select, textarea")]
      .filter((el) => el.closest("[aria-hidden=true]") === null)
      .filter((el) => !(el.labels && el.labels.length > 0) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
      .map((el) => el.name || el.id),
  );
  expect(sinNombre, "campos sin nombre accesible").toEqual([]);
  const repetidos = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(repetidos, "ids repetidos").toEqual([]);
  const sinNombreBoton = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((b) => !(b.textContent ?? "").trim() && !b.getAttribute("aria-label")).length,
  );
  expect(sinNombreBoton, "botones sin nombre").toBe(0);
}
