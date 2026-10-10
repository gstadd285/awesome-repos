import type { Page } from "@playwright/test";

/** Junta errores de consola y de página (incluidas violaciones de la CSP). */
export function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });
  page.on("pageerror", (e) => errores.push(e.message));
  return errores;
}

export async function sinScrollHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/** Sesión del panel guardada por `admin.setup.ts` para las pruebas con sesión. */
export const SESION_ADMIN = "e2e/.auth/admin.json";
