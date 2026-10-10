import { expect, test } from "@playwright/test";
import { SESION_ADMIN } from "./ayudas";

/**
 * Control 1 (ocultar claves) en tiempo de ejecución: se recorren las páginas y los endpoints, con y
 * sin sesión del panel, y se comprueba que ninguna respuesta (cuerpo ni cabeceras, ni siquiera el
 * flujo RSC de Next.js) contiene los secretos con los que corre el servidor. Complementa a
 * `npm run seguridad:canarios`, que mira lo que queda escrito en el build.
 *
 * El nombre del archivo lleva «admin» para que el proyecto móvil (sin sesión del panel) lo omita.
 */
test.describe("ninguna respuesta del servidor contiene secretos", () => {
  test.skip(!process.env.DATABASE_URL, "Sin base de datos no hay panel con el que comparar.");
  test.use({ storageState: SESION_ADMIN });

  const secretos = () => {
    const url = new URL(process.env.DATABASE_URL ?? "postgres://x:y@localhost/z");
    return [
      process.env.E2E_ADMIN_HASH,
      process.env.E2E_ADMIN_TOTP,
      process.env.E2E_ADMIN_SESION,
      process.env.E2E_ADMIN_FRASE,
      process.env.DATABASE_URL,
      decodeURIComponent(url.password),
    ].filter((s): s is string => Boolean(s) && (s as string).length >= 8);
  };

  const RUTAS = [
    "/",
    "/alertas",
    "/metodologia",
    "/fuentes",
    "/seguridad",
    "/privacidad",
    "/terminos",
    "/aviso-legal",
    `/lista-de-espera/confirmar?token=${"a".repeat(43)}`,
    "/lista-de-espera/confirmar",
    "/no-existe",
    "/.well-known/security.txt",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/api/salud",
    "/admin",
    "/admin/alertas",
    "/admin/alertas/nueva",
  ];

  for (const ruta of RUTAS) {
    test(`${ruta}`, async ({ request }) => {
      // HTML y flujo de datos de React Server Components (lo que viaja al navegador al navegar).
      for (const cabeceras of [{}, { RSC: "1" }] as Record<string, string>[]) {
        const r = await request.get(ruta, { headers: cabeceras, maxRedirects: 0 });
        const texto = `${[...Object.entries(r.headers())].map(([k, v]) => `${k}: ${v}`).join("\n")}\n${await r.text()}`;
        for (const secreto of secretos()) {
          expect(texto.includes(secreto), `${ruta} ${JSON.stringify(cabeceras)} contiene un secreto (${secreto.slice(0, 4)}…)`).toBe(false);
        }
      }
    });
  }

  test("las páginas del panel no se guardan en ninguna caché", async ({ request }) => {
    for (const ruta of ["/admin", "/admin/alertas", "/admin/alertas/nueva"]) {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect(r.headers()["cache-control"] ?? "", ruta).toMatch(/no-store/);
      expect(r.headers()["x-robots-tag"] ?? "", ruta).toContain("noindex");
    }
  });
});
