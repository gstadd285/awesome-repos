import { readFileSync } from "node:fs";
import { ipDePrueba, sinScrollHorizontal, vigilarErrores } from "./ayudas";
import {
  CLAVE,
  CLAVE_NUEVA,
  COOKIE_CUENTA,
  ESPERA_TRAMPA_MS,
  alerta,
  errorDeCampo,
  codigoDe,
  comprobarAccesibilidadBasica,
  correoUnico,
  correosPara,
  crearCuenta,
  entrar,
  enviar,
  esperarCorreo,
  otroNavegador,
  rutaDelEnlace,
  salir,
} from "./cuentas-ayudas";
import { expect, test } from "./fixtures";
import { URL_IA } from "./puertos";

const hayBase = Boolean(process.env.DATABASE_URL);
const MENSAJE_RECHAZO = "El correo o la contraseña no son correctos.";

// ── Sin base de datos: las cuentas vienen cerradas ───────────────────────────────────────────────────────────────────
// La segunda instancia de la aplicación (la del asistente con IA) no abre las cuentas: es el estado con el que sale el sitio.
test.describe("cuentas cerradas (por omisión)", () => {
  test.use({ baseURL: URL_IA });

  for (const [ruta, titulo] of [
    ["/cuenta/entrar", "Entra a tu cuenta."],
    ["/cuenta/crear", "Crea tu cuenta."],
    ["/cuenta/olvide", "¿Olvidaste tu contraseña?"],
  ] as const) {
    test(`${ruta} avisa que las cuentas abren con el lanzamiento y no ofrece ningún formulario`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      await expect(page.getByRole("note")).toContainText("Las cuentas abren junto con el lanzamiento");
      await expect(page.getByRole("link", { name: "Unirme a la lista de espera" })).toHaveAttribute("href", "/#lista-de-espera");
      await expect(page.locator("main form")).toHaveCount(0);
      expect(await sinScrollHorizontal(page)).toBe(true);
      expect(errores).toEqual([]);
    });
  }

  test("la cabecera y el pie no ofrecen entrar a algo que todavía no existe", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header").getByRole("link", { name: /^(Entrar|Mi cuenta)$/ })).toHaveCount(0);
    await expect(page.locator("footer").getByRole("link", { name: /^(Entrar|Crear cuenta|Mi cuenta)$/ })).toHaveCount(0);
  });

  test("las páginas privadas mandan a la entrada y la descarga de datos no entrega nada", async ({ page, request, ip }) => {
    for (const ruta of ["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/cuenta\/entrar$/);
    }
    const descarga = await request.get("/cuenta/exportar", { maxRedirects: 0, headers: { "x-forwarded-for": ip } });
    expect([302, 303, 307, 308]).toContain(descarga.status());
    expect(descarga.headers()["location"]).toContain("/cuenta/entrar");
    expect(descarga.headers()["content-disposition"]).toBeUndefined();
  });

  test("los enlaces de correo no revelan nada mientras las cuentas estén cerradas", async ({ page }) => {
    for (const ruta of ["/cuenta/activar?token=x", `/cuenta/restablecer?token=${"a".repeat(43)}`]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1, name: "Cuentas cerradas." })).toBeVisible();
    }
  });

  test("no se indexan: robots.txt, X-Robots-Tag y la etiqueta meta, y nada se guarda en cachés", async ({ request, ip }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/cuenta/);
    const pagina = await request.get("/cuenta/entrar", { headers: { "x-forwarded-for": ip } });
    expect(pagina.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(pagina.headers()["cache-control"]).toContain("no-store");
    expect(await pagina.text()).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });
});

// ── Con base de datos: las cuentas abiertas de punta a punta (Postgres real y correo a un servidor que imita a Resend) ──
test.describe("cuentas abiertas", () => {
  test.beforeEach(({}, info) => {
    test.skip(!hayBase, "Sin base de datos no hay cuentas abiertas.");
    test.skip(info.project.name !== "escritorio", "Una sola pasada (las pruebas del teléfono están al final).");
  });

  test("crea la cuenta de punta a punta: correo, enlace por correo, contraseña y primera sesión", async ({ page, request }) => {
    test.slow();
    const errores = vigilarErrores(page);
    const correo = correoUnico("alta");

    await page.goto("/cuenta/crear");
    await expect(page.getByRole("heading", { level: 1, name: "Crea tu cuenta." })).toBeVisible();
    await comprobarAccesibilidadBasica(page);
    const pasos = page.getByRole("list", { name: "La cuenta se crea en dos pasos" });
    await expect(pasos.getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step");

    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByText(/Paso 1 de 2 listo/)).toBeVisible();
    await expect(pasos.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");

    // El enlace llega por correo: asunto, vigencia y un token de 256 bits; en el HTML es el mismo enlace.
    const recibido = await esperarCorreo(request, correo, /Confirma tu correo/);
    expect(recibido.texto).toContain("72 horas");
    expect(recibido.html).toContain("/cuenta/activar?token=");
    const ruta = rutaDelEnlace(recibido);
    expect(ruta).toMatch(/^\/cuenta\/activar\?token=[A-Za-z0-9_-]{43}$/);

    // Abrir el enlace solo muestra el formulario: todavía no hay sesión, y la dirección (con el token) no sale como referente.
    const respuesta = await page.goto(ruta);
    expect(respuesta?.headers()["referrer-policy"]).toBe("strict-origin");
    await expect(page.getByText(/Vas a crear la cuenta de/)).toContainText(`${correo[0]}***@example.org`);
    expect((await page.context().cookies()).some((c) => c.name === COOKIE_CUENTA)).toBe(false);
    await comprobarAccesibilidadBasica(page);

    await page.getByLabel("Elige tu contraseña").fill(CLAVE);
    await page.getByLabel("Repite tu contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Crear mi cuenta y entrar" }).click();
    await expect(page).toHaveURL(/\/cuenta\?aviso=bienvenida$/);
    await expect(page.getByText("Tu cuenta está lista. Ya iniciaste sesión.")).toBeVisible();

    // La cookie de sesión: prefijo __Host-, HttpOnly, Secure, SameSite y un token al azar que vence a los 30 días como mucho.
    const [cookie] = (await page.context().cookies()).filter((c) => c.name === COOKIE_CUENTA);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const dias = (cookie.expires - Date.now() / 1000) / 86_400;
    expect(dias).toBeGreaterThan(29);
    expect(dias).toBeLessThanOrEqual(30);
    // …y el navegador no puede leerla desde la página.
    expect(await page.evaluate(() => document.cookie)).not.toContain("otea_sesion");

    await expect(page.locator("header").getByRole("link", { name: "Mi cuenta" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Entrar" })).toHaveCount(0);
    await comprobarAccesibilidadBasica(page);

    // Un enlace de correo se usa una sola vez.
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: "Enlace no válido." })).toBeVisible();
    expect(errores).toEqual([]);
  });

  test("valida en el servidor y no pierde lo escrito: correo inválido, casillas sin marcar y envío demasiado rápido", async ({ page, request }) => {
    test.slow();
    const correo = correoUnico("valida");
    await page.goto("/cuenta/crear");
    const campo = page.getByLabel("Tu correo");
    await campo.fill("no-es-correo");
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByText("Escribe un correo válido.")).toBeVisible();
    await expect(page.getByText("Para crear tu cuenta necesitas aceptar las condiciones de uso.")).toBeVisible();
    await expect(page.getByText("Necesitamos tu consentimiento para guardar los datos de tu cuenta.")).toBeVisible();
    await expect(campo).toHaveAttribute("aria-invalid", "true");
    await expect(campo).toHaveValue("no-es-correo");

    // Cada texto se acepta por separado: con una casilla marcada, solo falta la otra, y lo escrito sigue ahí.
    await campo.fill(correo);
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByText("Necesitamos tu consentimiento para guardar los datos de tu cuenta.")).toBeVisible();
    await expect(page.getByText("Para crear tu cuenta necesitas aceptar las condiciones de uso.")).toHaveCount(0);
    await expect(campo).toHaveValue(correo);
    await expect(page.getByLabel(/Acepto las condiciones de uso/)).toBeChecked();

    // Enviar demasiado pronto (menos de 3 s desde que se abrió el formulario) no envía nada y no borra lo escrito.
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.reload();
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(alerta(page)).toContainText("Espera unos segundos");
    await expect(page.getByLabel("Tu correo")).toHaveValue(correo);
    expect(await correosPara(request, correo)).toHaveLength(0);

    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByText(/Paso 1 de 2 listo/)).toBeVisible();
    await esperarCorreo(request, correo, /Confirma tu correo/);
  });

  test("la contraseña se valida en el servidor: corta, común, con el nombre del sitio, repetitiva y distinta de su repetición", async ({ page, request }) => {
    test.slow();
    const correo = correoUnico("clave");
    await page.goto("/cuenta/crear");
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await page.goto(rutaDelEnlace(await esperarCorreo(request, correo, /Confirma tu correo/)));

    const clave = page.getByLabel("Elige tu contraseña");
    const repetir = page.getByLabel("Repite tu contraseña");
    const boton = page.getByRole("button", { name: "Crear mi cuenta y entrar" });
    const casos: [string, string][] = [
      ["corta123", "al menos 12 caracteres"],
      ["password1234", "entre las más usadas"],
      ["oteaustral-2027-x", "No uses tu correo, tu nombre ni el nombre del sitio"],
      ["aaaaaaaaaaaaaaaa", "repite los mismos caracteres"],
    ];
    for (const [texto, motivo] of casos) {
      await clave.fill(texto);
      await repetir.fill(texto);
      await enviar(page, boton);
      await expect(errorDeCampo(page, motivo)).toBeVisible();
      await expect(clave).toHaveAttribute("aria-invalid", "true");
      // La contraseña nunca vuelve del servidor: el campo queda vacío.
      await expect(clave).toHaveValue("");
    }
    await clave.fill(CLAVE);
    await repetir.fill(CLAVE_NUEVA);
    await enviar(page, boton);
    await expect(errorDeCampo(page, "Las contraseñas no coinciden.")).toBeVisible();
    await expect(repetir).toHaveAttribute("aria-invalid", "true");

    // Nada de lo anterior gastó el enlace: con una buena contraseña, la cuenta se crea.
    await clave.fill(CLAVE);
    await repetir.fill(CLAVE);
    await boton.click();
    await expect(page).toHaveURL(/\/cuenta\?aviso=bienvenida$/);
  });

  test("el botón «Mostrar» deja ver la contraseña y vuelve a ocultarla", async ({ page }) => {
    await page.goto("/cuenta/entrar");
    const campo = page.getByLabel("Tu contraseña");
    await expect(campo).toHaveAttribute("type", "password");
    await expect(campo).toHaveAttribute("autocomplete", "current-password");
    await page.getByRole("button", { name: /Mostrar la contraseña/ }).click();
    await expect(campo).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /Ocultar la contraseña/ }).click();
    await expect(campo).toHaveAttribute("type", "password");
  });

  test("entrar, salir y volver a entrar; sin sesión las páginas privadas mandan a la entrada, y nunca se redirige fuera del sitio", async ({ page, request }) => {
    test.slow();
    const correo = correoUnico("sesion");
    await crearCuenta(page, request, correo);

    await salir(page);
    await expect(page).toHaveURL(/\/cuenta\/entrar\?aviso=salida$/);
    await expect(page.getByText("Cerraste tu sesión.")).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === COOKIE_CUENTA)).toBe(false);
    for (const ruta of ["/cuenta", "/cuenta/seguridad", "/cuenta/datos", "/cuenta/exportar"]) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/cuenta\/entrar$/);
    }

    // Contraseña errónea y correo sin cuenta responden lo mismo, y el campo de la contraseña queda vacío.
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel("Tu contraseña").fill("otra contraseña cualquiera");
    await enviar(page, page.getByRole("button", { name: "Entrar" }));
    await expect(alerta(page)).toContainText(MENSAJE_RECHAZO);
    await expect(page.getByLabel("Tu correo")).toHaveValue(correo);
    await expect(page.getByLabel("Tu contraseña")).toHaveValue("");
    const textoConCuenta = await alerta(page).innerText();
    await page.getByLabel("Tu correo").fill(correoUnico("nadie"));
    await page.getByLabel("Tu contraseña").fill(CLAVE);
    await enviar(page, page.getByRole("button", { name: "Entrar" }));
    expect(await alerta(page).innerText()).toBe(textoConCuenta);

    // Entrar: la respuesta fija la cookie con sus atributos.
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel("Tu contraseña").fill(CLAVE);
    const [respuesta] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Entrar" }).click()]);
    const fijar = (await respuesta.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith(`${COOKIE_CUENTA}=`));
    expect(fijar).toHaveLength(1);
    expect(fijar[0].value).toMatch(/;\s*Path=\//i);
    expect(fijar[0].value).toMatch(/;\s*HttpOnly/i);
    expect(fijar[0].value).toMatch(/;\s*Secure/i);
    expect(fijar[0].value).toMatch(/;\s*SameSite=lax/i);
    expect(fijar[0].value).not.toMatch(/Domain=/i);
    await expect(page).toHaveURL(/\/cuenta$/);
    await expect(page.getByTestId("correo-cuenta")).toHaveText(correo);

    // Con la sesión puesta, la entrada y el alta mandan al perfil.
    for (const ruta of ["/cuenta/entrar", "/cuenta/crear"]) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/cuenta$/);
    }

    // «Entrar» vuelve a donde se pedía solo si es una página de la cuenta; una dirección de fuera se ignora.
    await salir(page);
    await page.goto("/cuenta/entrar?siguiente=%2Fcuenta%2Fdatos");
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel("Tu contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cuenta\/datos$/);
    await salir(page);
    await page.goto("/cuenta/entrar?siguiente=https%3A%2F%2Fmalo.example%2F");
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel("Tu contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cuenta$/);
  });

  test("el perfil guarda el nombre, los temas y la preferencia del resumen, y todo sigue ahí al recargar", async ({ page, request }) => {
    test.slow();
    const errores = vigilarErrores(page);
    await crearCuenta(page, request, correoUnico("perfil"));
    await comprobarAccesibilidadBasica(page);
    await page.getByLabel(/Cómo te llamamos/).fill("  Ana   María ");
    await page.getByLabel(/Energía/).check();
    await page.getByLabel(/Cobre/).check();
    await page.getByLabel(/Quiero recibir por correo el resumen/).check();
    await enviar(page, page.getByRole("button", { name: "Guardar cambios" }));
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    // Lo guardado vuelve al formulario (React vacía los campos al terminar la acción).
    await expect(page.getByLabel(/Cómo te llamamos/)).toHaveValue("Ana María");
    await expect(page.getByLabel(/Energía/)).toBeChecked();

    await page.reload();
    await expect(page.getByText("Hola, Ana María.")).toBeVisible();
    await expect(page.getByLabel(/Cómo te llamamos/)).toHaveValue("Ana María");
    await expect(page.getByLabel(/Energía/)).toBeChecked();
    await expect(page.getByLabel(/Cobre/)).toBeChecked();
    await expect(page.getByLabel(/Chips/)).not.toBeChecked();
    await expect(page.getByLabel(/Quiero recibir por correo el resumen/)).toBeChecked();

    // Un nombre con caracteres invisibles se rechaza con su mensaje y sin perder lo escrito.
    await page.getByLabel(/Cómo te llamamos/).fill("Ana‮oña");
    await enviar(page, page.getByRole("button", { name: "Guardar cambios" }));
    await expect(page.getByText("El nombre tiene caracteres que no se pueden mostrar.")).toBeVisible();
    expect(errores).toEqual([]);
  });

  test("sin JavaScript los formularios siguen funcionando: crear la cuenta, salir, entrar y restablecer la contraseña", async ({ browser, request, ip }) => {
    test.slow();
    const correo = correoUnico("sinjs");
    const contexto = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-forwarded-for": ip } });
    const page = await contexto.newPage();
    try {
      // Crear la cuenta: el correo y, con el enlace (página con `Referrer-Policy`), la contraseña.
      await page.goto("/cuenta/crear");
      await page.getByLabel("Tu correo").fill(correo);
      await page.getByLabel(/Acepto las condiciones de uso/).check();
      await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
      await page.waitForTimeout(ESPERA_TRAMPA_MS);
      await page.getByRole("button", { name: "Crear mi cuenta" }).click();
      await expect(page.getByText(/Paso 1 de 2 listo/)).toBeVisible();
      await page.goto(rutaDelEnlace(await esperarCorreo(request, correo, /Confirma tu correo/)));
      await page.getByLabel("Elige tu contraseña").fill(CLAVE);
      await page.getByLabel("Repite tu contraseña").fill(CLAVE);
      await page.getByRole("button", { name: "Crear mi cuenta y entrar" }).click();
      await expect(page).toHaveURL(/\/cuenta\?aviso=bienvenida$/);

      // Salir y entrar (primero con una contraseña equivocada: el error vuelve en la misma página).
      await salir(page);
      await entrar(page, correo, "una contraseña equivocada");
      await expect(alerta(page)).toContainText(MENSAJE_RECHAZO);
      await entrar(page, correo);
      await expect(page).toHaveURL(/\/cuenta$/);
      await salir(page);

      // Olvidé mi contraseña: el enlace del correo abre el formulario y la contraseña nueva entra.
      await page.goto("/cuenta/olvide");
      await page.getByLabel("Tu correo").fill(correo);
      await page.waitForTimeout(ESPERA_TRAMPA_MS);
      await page.getByRole("button", { name: "Enviarme el enlace" }).click();
      await expect(page.getByText(/Si hay una cuenta con ese correo/)).toBeVisible();
      await page.goto(rutaDelEnlace(await esperarCorreo(request, correo, /Restablece tu contraseña/)));
      await page.getByLabel("Tu contraseña nueva", { exact: true }).fill(CLAVE_NUEVA);
      await page.getByLabel("Repite tu contraseña nueva").fill(CLAVE_NUEVA);
      await page.getByRole("button", { name: "Cambiar mi contraseña" }).click();
      await expect(page).toHaveURL(/\/cuenta\/entrar\?aviso=restablecida$/);
      await entrar(page, correo, CLAVE_NUEVA);
      await expect(page).toHaveURL(/\/cuenta$/);
    } finally {
      await contexto.close();
    }
  });

  test("¿Olvidaste tu contraseña?: responde lo mismo exista o no la cuenta, el enlace sirve una vez y cierra las demás sesiones", async ({ page, request, browser, ip }) => {
    test.slow();
    const correo = correoUnico("olvide");
    await crearCuenta(page, request, correo);
    // Otro dispositivo con la sesión abierta: el restablecimiento la cierra.
    const otro = await otroNavegador(browser, ip);
    await entrar(otro.page, correo);
    await expect(otro.page).toHaveURL(/\/cuenta$/);

    await salir(page);
    await page.goto("/cuenta/olvide");
    await expect(page.getByRole("heading", { level: 1, name: "¿Olvidaste tu contraseña?" })).toBeVisible();
    await page.getByLabel("Tu correo").fill(correo);
    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    const aviso = page.getByText(/Si hay una cuenta con ese correo/);
    await expect(aviso).toBeVisible();
    const textoExiste = await aviso.innerText();

    // Un correo sin cuenta recibe exactamente el mismo aviso, y no se le envía nada.
    const sinCuenta = correoUnico("nadie");
    await page.goto("/cuenta/olvide");
    await page.getByLabel("Tu correo").fill(sinCuenta);
    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByText(/Si hay una cuenta con ese correo/)).toBeVisible();
    expect(await page.getByText(/Si hay una cuenta con ese correo/).innerText()).toBe(textoExiste);
    expect(await correosPara(request, sinCuenta)).toHaveLength(0);

    const recibido = await esperarCorreo(request, correo, /Restablece tu contraseña/);
    expect(recibido.texto).toContain("1 hora");
    const ruta = rutaDelEnlace(recibido);
    expect(ruta).toMatch(/^\/cuenta\/restablecer\?token=[A-Za-z0-9_-]{43}$/);
    const respuesta = await page.goto(ruta);
    expect(respuesta?.headers()["referrer-policy"]).toBe("strict-origin");
    await comprobarAccesibilidadBasica(page);

    await page.getByLabel("Tu contraseña nueva", { exact: true }).fill("corta");
    await page.getByLabel("Repite tu contraseña nueva").fill("corta");
    await enviar(page, page.getByRole("button", { name: "Cambiar mi contraseña" }));
    await expect(errorDeCampo(page, "al menos 12 caracteres")).toBeVisible();

    await page.getByLabel("Tu contraseña nueva", { exact: true }).fill(CLAVE_NUEVA);
    await page.getByLabel("Repite tu contraseña nueva").fill(CLAVE_NUEVA);
    await page.getByRole("button", { name: "Cambiar mi contraseña" }).click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\?aviso=restablecida$/);
    await expect(page.getByText(/Tu contraseña cambió y cerramos todas tus sesiones/)).toBeVisible();
    await esperarCorreo(request, correo, /La contraseña de tu cuenta de Otea Austral cambió/);

    // El enlace ya no sirve; la contraseña vieja tampoco; la sesión del otro dispositivo se cerró; la nueva funciona.
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: "Enlace no válido." })).toBeVisible();
    await entrar(page, correo, CLAVE);
    await expect(alerta(page)).toContainText(MENSAJE_RECHAZO);
    await otro.page.goto("/cuenta");
    await expect(otro.page).toHaveURL(/\/cuenta\/entrar$/);
    await entrar(page, correo, CLAVE_NUEVA);
    await expect(page).toHaveURL(/\/cuenta$/);
    await otro.contexto.close();
  });

  test("cambiar la contraseña: pide la actual, avisa por correo y cierra las demás sesiones pero no esta", async ({ page, request, browser, ip }) => {
    test.slow();
    const correo = correoUnico("cambio");
    await crearCuenta(page, request, correo);
    const otro = await otroNavegador(browser, ip);
    await entrar(otro.page, correo);
    await expect(otro.page).toHaveURL(/\/cuenta$/);

    await page.goto("/cuenta/seguridad");
    const formulario = page.getByRole("form", { name: "Cambiar la contraseña" });
    await formulario.getByLabel("Tu contraseña actual").fill("no es esta contraseña");
    await formulario.getByLabel("Tu contraseña nueva", { exact: true }).fill(CLAVE_NUEVA);
    await formulario.getByLabel("Repite tu contraseña nueva").fill(CLAVE_NUEVA);
    await enviar(page, formulario.getByRole("button", { name: "Cambiar mi contraseña" }));
    await expect(formulario.getByText(/contraseña actual no es correcta|no es correcta/i)).toBeVisible();

    await formulario.getByLabel("Tu contraseña actual").fill(CLAVE);
    await formulario.getByLabel("Tu contraseña nueva", { exact: true }).fill(CLAVE);
    await formulario.getByLabel("Repite tu contraseña nueva").fill(CLAVE);
    await enviar(page, formulario.getByRole("button", { name: "Cambiar mi contraseña" }));
    await expect(formulario.getByText("La contraseña nueva debe ser distinta de la actual.")).toBeVisible();

    await formulario.getByLabel("Tu contraseña actual").fill(CLAVE);
    await formulario.getByLabel("Tu contraseña nueva", { exact: true }).fill(CLAVE_NUEVA);
    await formulario.getByLabel("Repite tu contraseña nueva").fill(CLAVE_NUEVA);
    await enviar(page, formulario.getByRole("button", { name: "Cambiar mi contraseña" }));
    await expect(formulario.getByText(/Contraseña cambiada/)).toBeVisible();
    await esperarCorreo(request, correo, /La contraseña de tu cuenta de Otea Austral cambió/);

    await page.reload();
    await expect(page).toHaveURL(/\/cuenta\/seguridad$/); // esta sesión sigue abierta
    await otro.page.goto("/cuenta");
    await expect(otro.page).toHaveURL(/\/cuenta\/entrar$/);
    await salir(page);
    await entrar(page, correo, CLAVE_NUEVA);
    await expect(page).toHaveURL(/\/cuenta$/);
    await otro.contexto.close();
  });

  test("verificación en dos pasos: código QR y secreto, activar con un código, entrar con ella, un código de recuperación vale una vez y se puede desactivar", async ({
    page,
    request,
    browser,
    ip,
  }) => {
    test.slow();
    const errores = vigilarErrores(page);
    const correo = correoUnico("dospasos");
    await crearCuenta(page, request, correo);
    await page.goto("/cuenta/seguridad");

    // Pide la contraseña para empezar.
    const activar = page.getByRole("form", { name: "Activar la verificación en dos pasos" });
    await activar.getByLabel("Tu contraseña actual").fill("no es la contraseña");
    await enviar(page, activar.getByRole("button", { name: "Activar la verificación en dos pasos" }));
    await expect(activar.getByText(/no es correcta/i)).toBeVisible();
    await activar.getByLabel("Tu contraseña actual").fill(CLAVE);
    await activar.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();

    // El código QR se dibuja (módulos negros sobre fondo blanco: sin eso la app no lo lee) y el secreto también está escrito.
    const qr = page.getByRole("img", { name: /Código QR para agregar Otea Austral/ });
    await expect(qr).toBeVisible();
    await expect(qr.locator("rect")).toHaveCSS("fill", "rgb(255, 255, 255)");
    await expect(qr.locator("path")).toHaveCSS("fill", "rgb(0, 0, 0)");
    const caja = (await qr.boundingBox())!;
    expect(caja.width).toBeGreaterThan(150);
    expect(Math.abs(caja.width - caja.height)).toBeLessThan(1);
    const secreto = (await page.getByTestId("secreto-dos-pasos").innerText()).replace(/\s/g, "");
    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    await expect(page.getByRole("link", { name: "abrir el enlace en tu app" })).toHaveAttribute("href", new RegExp(`^otpauth://totp/.*secret=${secreto}`));
    await comprobarAccesibilidadBasica(page);

    // Si se recarga a mitad de camino, la configuración sigue ahí (mismo secreto).
    await page.reload();
    expect((await page.getByTestId("secreto-dos-pasos").innerText()).replace(/\s/g, "")).toBe(secreto);

    const confirmar = page.getByRole("form", { name: "Confirmar la verificación en dos pasos" });
    await confirmar.getByLabel("Código de seis dígitos").fill("000000");
    await enviar(page, confirmar.getByRole("button", { name: "Confirmar y activar" }));
    await expect(confirmar.getByText(/no coincide/i)).toBeVisible();
    const paso = Math.floor(Date.now() / 30_000);
    await confirmar.getByLabel("Código de seis dígitos").fill(codigoDe(secreto, paso));
    await confirmar.getByRole("button", { name: "Confirmar y activar" }).click();
    const lista = page.getByRole("list", { name: "Códigos de recuperación" });
    await expect(lista.getByRole("listitem")).toHaveCount(10);
    const codigos = (await lista.getByRole("listitem").allInnerTexts()).map((c) => c.trim());
    for (const c of codigos) expect(c).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
    expect(new Set(codigos).size).toBe(10);
    await esperarCorreo(request, correo, /Se activó la verificación en dos pasos/);

    await page.reload();
    const panel = page.getByRole("region", { name: "Verificación en dos pasos" });
    await expect(panel).toContainText("Activada");
    await expect(panel).toContainText("Te quedan 10 códigos de recuperación");
    // Con la verificación activa, las acciones delicadas piden también el código.
    await expect(page.getByRole("form", { name: "Cambiar la contraseña" }).getByLabel(/Código de tu app o de recuperación/)).toBeVisible();

    // Entrar pide el código; la sesión «a medias» no abre nada.
    await salir(page);
    await entrar(page, correo);
    await expect(page).toHaveURL(/\/cuenta\/verificar$/);
    await page.goto("/cuenta/seguridad");
    await expect(page).toHaveURL(/\/cuenta\/entrar$/);
    await entrar(page, correo);
    await expect(page).toHaveURL(/\/cuenta\/verificar$/);
    await comprobarAccesibilidadBasica(page);
    await page.getByLabel(/Código de tu app/).fill("123456");
    await enviar(page, page.getByRole("button", { name: "Verificar" }));
    await expect(alerta(page)).toContainText("no es correcto o ya se usó");
    // El código del paso que ya se usó para activar no sirve otra vez; el del paso siguiente sí.
    await page.getByLabel(/Código de tu app/).fill(codigoDe(secreto, paso));
    await enviar(page, page.getByRole("button", { name: "Verificar" }));
    await expect(alerta(page)).toContainText("no es correcto o ya se usó");
    await page.getByLabel(/Código de tu app/).fill(codigoDe(secreto, paso + 1));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/cuenta$/);

    // Otro dispositivo, con un código de recuperación: entra, va a «Seguridad» con el aviso y el código ya no sirve más.
    const otro = await otroNavegador(browser, ip);
    await entrar(otro.page, correo);
    await expect(otro.page).toHaveURL(/\/cuenta\/verificar$/);
    await otro.page.getByRole("button", { name: /No puedo usar mi app/ }).click();
    await otro.page.getByLabel("Código de recuperación").fill(codigos[0].toUpperCase());
    await otro.page.getByRole("button", { name: "Verificar" }).click();
    await expect(otro.page).toHaveURL(/\/cuenta\/seguridad\?aviso=recuperacion$/);
    await expect(otro.page.getByText(/Entraste con un código de recuperación y ya no sirve/)).toBeVisible();
    await expect(otro.page.getByRole("region", { name: "Verificación en dos pasos" })).toContainText("Te quedan 9 códigos de recuperación");
    await expect(otro.page.getByRole("region", { name: "Actividad reciente" })).toContainText("Entraste con un código de recuperación");

    const tercero = await otroNavegador(browser, ip, "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0");
    await entrar(tercero.page, correo);
    await tercero.page.getByRole("button", { name: /No puedo usar mi app/ }).click();
    await tercero.page.getByLabel("Código de recuperación").fill(codigos[0]);
    await tercero.page.getByRole("button", { name: "Verificar" }).click();
    await expect(alerta(tercero.page)).toContainText("no es correcto o ya se usó");
    await expect(tercero.page).toHaveURL(/\/cuenta\/verificar$/);
    await tercero.contexto.close();

    // Desactivar: contraseña y un código (aquí, otro de recuperación).
    await page.goto("/cuenta/seguridad");
    const desactivar = page.getByRole("form", { name: "Desactivar la verificación en dos pasos" });
    await desactivar.getByLabel("Tu contraseña actual").fill(CLAVE);
    await desactivar.getByLabel(/Código de tu app o de recuperación/).fill(codigos[2]);
    await desactivar.getByRole("button", { name: "Desactivar la verificación en dos pasos" }).click();
    await expect(page.getByRole("form", { name: "Activar la verificación en dos pasos" })).toBeVisible();
    await esperarCorreo(request, correo, /Se desactivó la verificación en dos pasos/);
    await salir(page);
    await entrar(page, correo);
    await expect(page).toHaveURL(/\/cuenta$/);
    expect(errores).toEqual([]);
    await otro.contexto.close();
  });

  test("sesiones abiertas: se ve cada dispositivo, se cierra una a distancia y se pueden cerrar todas las demás", async ({ page, request, browser, ip }) => {
    test.slow();
    const correo = correoUnico("sesiones");
    await crearCuenta(page, request, correo);
    const firefox = await otroNavegador(browser, ip);
    const iphone = await otroNavegador(
      browser,
      ip,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    await entrar(firefox.page, correo);
    await expect(firefox.page).toHaveURL(/\/cuenta$/);
    await entrar(iphone.page, correo);
    await expect(iphone.page).toHaveURL(/\/cuenta$/);

    await page.goto("/cuenta/seguridad");
    const sesiones = page.getByRole("region", { name: "Sesiones abiertas" });
    await expect(sesiones.getByRole("listitem")).toHaveCount(3);
    await expect(sesiones.getByText("Esta sesión")).toHaveCount(1);
    await expect(sesiones).toContainText("Firefox en macOS");
    await expect(sesiones).toContainText("Safari en iOS");
    // Sin dirección IP ni agente completo en pantalla.
    await expect(sesiones).not.toContainText("Mozilla");
    await expect(sesiones).not.toContainText(ip);

    await sesiones.getByRole("listitem").filter({ hasText: "Firefox en macOS" }).getByRole("button", { name: /Cerrar/ }).click();
    await expect(sesiones.getByRole("listitem")).toHaveCount(2);
    await firefox.page.goto("/cuenta");
    await expect(firefox.page).toHaveURL(/\/cuenta\/entrar$/);
    await iphone.page.goto("/cuenta");
    await expect(iphone.page).toHaveURL(/\/cuenta$/);

    await sesiones.getByRole("button", { name: "Cerrar todas las demás sesiones" }).click();
    await expect(page.getByText("Cerramos 1 sesión.")).toBeVisible();
    await iphone.page.goto("/cuenta");
    await expect(iphone.page).toHaveURL(/\/cuenta\/entrar$/);
    await page.reload();
    await expect(page).toHaveURL(/\/cuenta\/seguridad$/);
    await expect(sesiones.getByRole("listitem")).toHaveCount(1);
    await firefox.contexto.close();
    await iphone.contexto.close();
  });

  test("tus datos: se descargan en un archivo sin secretos, y la descarga exige sesión y rechaza lo iniciado desde otro sitio", async ({ page, request, browser, ip }) => {
    test.slow();
    const correo = correoUnico("datos");
    await crearCuenta(page, request, correo);
    await page.getByLabel(/Cómo te llamamos/).fill("Ana");
    await page.getByLabel(/Divisas/).check();
    await enviar(page, page.getByRole("button", { name: "Guardar cambios" }));
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    await page.goto("/cuenta/datos");
    await comprobarAccesibilidadBasica(page);
    await expect(page.getByRole("region", { name: "Qué guardamos" })).toContainText("Tu contraseña");

    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Descargar mis datos/ }).click()]);
    expect(descarga.suggestedFilename()).toBe("otea-austral-mis-datos.json");
    const texto = readFileSync((await descarga.path())!, "utf8");
    const datos = JSON.parse(texto) as { cuenta: Record<string, unknown>; sesionesAbiertas: unknown[]; actividad: { tipo: string }[] };
    expect(datos.cuenta).toMatchObject({ correo, nombre: "Ana", temas: ["divisas"], resumenPrevio: false, verificacionEnDosPasos: false });
    expect(datos.sesionesAbiertas).toHaveLength(1);
    expect(datos.actividad.map((a) => a.tipo)).toEqual(expect.arrayContaining(["alta", "acceso"]));
    // Nada de secretos: ni la contraseña (ni su hash), ni el secreto de los dos pasos, ni tokens, ni la IP (la nota final
    // explica en palabras que la contraseña se guarda como un hash: eso no es un dato).
    const sinNota = { ...datos, nota: undefined };
    expect(JSON.stringify(sinNota)).not.toMatch(/scrypt|clave_hash|totp|secret|token|hash|"ip"/i);
    expect(texto).not.toContain(CLAVE);

    const cabeceras = (await page.request.get("/cuenta/exportar")).headers();
    expect(cabeceras["content-type"]).toBe("application/json; charset=utf-8");
    expect(cabeceras["content-disposition"]).toBe('attachment; filename="otea-austral-mis-datos.json"');
    expect(cabeceras["cache-control"]).toContain("no-store");
    // Lo que el navegador marca como iniciado desde otro sitio se rechaza, aunque lleve la cookie.
    const ajeno = await page.request.get("/cuenta/exportar", { headers: { "sec-fetch-site": "cross-site" } });
    expect(ajeno.status()).toBe(403);
    expect(await ajeno.text()).toBe("");

    // Sin sesión: a la entrada, sin ningún dato.
    const sinSesion = await otroNavegador(browser, ip);
    const respuesta = await sinSesion.page.request.get("/cuenta/exportar", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(respuesta.status());
    expect(respuesta.headers()["location"]).toContain("/cuenta/entrar");
    expect(await respuesta.text()).not.toContain(correo);
    await sinSesion.contexto.close();
  });

  test("eliminar la cuenta: pide la contraseña y una casilla, borra todo y avisa por correo", async ({ page, request }) => {
    test.slow();
    const correo = correoUnico("eliminar");
    await crearCuenta(page, request, correo);
    const [cookie] = (await page.context().cookies()).filter((c) => c.name === COOKIE_CUENTA);
    await page.goto("/cuenta/datos");
    const formulario = page.getByRole("form", { name: "Eliminar mi cuenta" });

    // Sin la casilla de confirmación, el navegador no deja enviar.
    await formulario.getByLabel("Tu contraseña actual").fill(CLAVE);
    await formulario.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }).click();
    await expect(page).toHaveURL(/\/cuenta\/datos$/);
    expect(await formulario.getByRole("checkbox").evaluate((c: HTMLInputElement) => c.validity.valueMissing)).toBe(true);

    await formulario.getByRole("checkbox").check();
    await formulario.getByLabel("Tu contraseña actual").fill("no es la contraseña");
    await enviar(page, formulario.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }));
    await expect(formulario.getByText(/no es correcta/i)).toBeVisible();
    await expect(page).toHaveURL(/\/cuenta\/datos$/);

    await formulario.getByLabel("Tu contraseña actual").fill(CLAVE);
    await formulario.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }).click();
    await expect(page).toHaveURL(/\/cuenta\/eliminada$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tu cuenta fue eliminada." })).toBeVisible();
    await esperarCorreo(request, correo, /Eliminamos tu cuenta/);
    expect((await page.context().cookies()).some((c) => c.name === COOKIE_CUENTA)).toBe(false);

    // La cuenta ya no existe: ni la contraseña sirve, ni la cookie vieja abre nada.
    await entrar(page, correo);
    await expect(alerta(page)).toContainText(MENSAJE_RECHAZO);
    await page.context().addCookies([{ ...cookie, value: cookie.value }]);
    await page.goto("/cuenta");
    await expect(page).toHaveURL(/\/cuenta\/entrar$/);
  });

  test("tras ocho contraseñas erróneas desde un lugar, ese correo se frena para ese lugar (aunque la siguiente sea la correcta) y la dueña entra desde otro", async ({
    page,
    request,
    browser,
    ip,
  }) => {
    test.slow();
    const correo = correoUnico("freno");
    await crearCuenta(page, request, correo);
    await salir(page);
    await page.goto("/cuenta/entrar");
    const campoCorreo = page.getByLabel("Tu correo");
    const campoClave = page.getByLabel("Tu contraseña");
    const boton = page.getByRole("button", { name: "Entrar" });
    for (let i = 1; i <= 8; i++) {
      await campoCorreo.fill(correo);
      await campoClave.fill(`contraseña equivocada número ${i}`);
      await enviar(page, boton);
      await expect(alerta(page)).toContainText(MENSAJE_RECHAZO);
    }
    await campoCorreo.fill(correo);
    await campoClave.fill(CLAVE);
    await enviar(page, boton);
    await expect(alerta(page)).toContainText("Demasiados intentos");
    await expect(page).toHaveURL(/\/cuenta\/entrar$/);
    expect((await page.context().cookies()).some((c) => c.name === COOKIE_CUENTA)).toBe(false);

    // Quien probaba contraseñas se bloqueó a sí mismo: la dueña de la cuenta, desde su casa, no ve ningún freno.
    const otra = await otroNavegador(browser, ipDePrueba(`la dueña de ${ip}, desde su casa`, "cuentas"));
    try {
      await entrar(otra.page, correo);
      await expect(otra.page).toHaveURL(/\/cuenta(\?aviso=.*)?$/);
      expect((await otra.contexto.cookies()).some((c) => c.name === COOKIE_CUENTA)).toBe(true);
    } finally {
      await otra.contexto.close();
    }
  });

  test("el correo de una cuenta que ya existe no recibe un enlace de alta, sino un aviso, y la respuesta es la misma", async ({ page, request }) => {
    test.slow();
    const correo = correoUnico("repetida");
    await crearCuenta(page, request, correo);
    await salir(page);
    await page.goto("/cuenta/crear");
    await page.getByLabel("Tu correo").fill(correo);
    await page.getByLabel(/Acepto las condiciones de uso/).check();
    await page.getByLabel(/Acepto que Otea guarde mi correo/).check();
    await page.waitForTimeout(ESPERA_TRAMPA_MS);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page.getByText(/Paso 1 de 2 listo/)).toBeVisible();
    const aviso = await esperarCorreo(request, correo, /Intentaron crear una cuenta con tu correo/);
    expect(aviso.texto).not.toMatch(/token=/);
    expect((await correosPara(request, correo)).filter((c) => /Confirma tu correo/.test(c.asunto))).toHaveLength(1); // solo el de la primera vez
  });

  test("las páginas de la cuenta no se guardan en cachés ni se indexan, y piden contraseñas con el autocompletado correcto", async ({ page, request }) => {
    test.slow();
    const respuesta = await page.goto("/cuenta/entrar");
    expect(respuesta?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(respuesta?.headers()["cache-control"]).toContain("no-store");
    await comprobarAccesibilidadBasica(page);
    await expect(page.getByLabel("Tu correo")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByLabel("Tu contraseña")).toHaveAttribute("autocomplete", "current-password");
    expect(await sinScrollHorizontal(page)).toBe(true);

    await crearCuenta(page, request, correoUnico("cabeceras"));
    for (const ruta of ["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]) {
      const r = await page.goto(ruta);
      expect(r?.headers()["x-robots-tag"], ruta).toBe("noindex, nofollow");
      expect(r?.headers()["cache-control"], ruta).toContain("no-store");
      await comprobarAccesibilidadBasica(page);
    }
    await page.goto("/cuenta/seguridad");
    await expect(page.getByRole("form", { name: "Cambiar la contraseña" }).getByLabel("Tu contraseña nueva", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  });
});

// ── En el teléfono ───────────────────────────────────────────────────────────────────────────────────────────────────
test.describe("cuentas en el teléfono", () => {
  test.beforeEach(({}, info) => {
    test.skip(!hayBase, "Sin base de datos no hay cuentas abiertas.");
    test.skip(info.project.name !== "movil", "Solo en el proyecto del teléfono.");
  });

  test("las páginas de la cuenta caben en la pantalla y el menú ofrece «Entrar» y luego «Mi cuenta»", async ({ page, request }) => {
    test.slow();
    const errores = vigilarErrores(page);
    for (const ruta of ["/cuenta/entrar", "/cuenta/crear", "/cuenta/olvide"]) {
      await page.goto(ruta);
      expect(await sinScrollHorizontal(page), ruta).toBe(true);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Principal (móvil)" }).getByRole("link", { name: "Entrar" })).toBeVisible();

    await crearCuenta(page, request, correoUnico("movil"));
    for (const ruta of ["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]) {
      await page.goto(ruta);
      expect(await sinScrollHorizontal(page), ruta).toBe(true);
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Principal (móvil)" }).getByRole("link", { name: "Mi cuenta" })).toBeVisible();
    expect(errores).toEqual([]);
  });
});
