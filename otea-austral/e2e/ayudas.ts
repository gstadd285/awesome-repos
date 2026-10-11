import { createHash } from "node:crypto";
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

/** Código TOTP que usó `admin.setup.ts` para entrar (ya gastado). */
export const CODIGO_USADO = "e2e/.auth/codigo-usado.txt";

/**
 * IP de prueba propia de cada test. Los límites del asistente (por minuto y por día, y el cupo de IA por persona)
 * cuentan por IP y todas las pruebas comparten servidor: sin esto se agotarían entre ellas. El servidor confía en la
 * última entrada de `X-Forwarded-For` (un proxy de confianza), igual que detrás de Cloud Run. `ejecucion` distingue
 * las repeticiones y los reintentos de una misma prueba (`--repeat-each`, `retries`): llegarían con el cupo ya gastado.
 */
export function ipDePrueba(titulo: string, proyecto: string, ejecucion = 0): string {
  const huella = createHash("sha256").update(`${proyecto}|${titulo}|${ejecucion}`).digest();
  return `10.${huella[0]}.${huella[1]}.${huella[2] || 1}`;
}

type VentanaConCapturas = Window & { __respuestasAsistente?: Promise<string>[] };

/**
 * Guarda dentro de la página una copia de lo que responde `/api/asistente`, sin tocar el flujo que lee la aplicación
 * (se clona la respuesta). Se llama ANTES de `goto`. Sirve para comprobar también lo que NO llegó al navegador;
 * `response.text()` de Playwright falla a veces con las respuestas que se leen como flujo.
 */
export async function capturarRespuestasDelAsistente(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const ventana = window as VentanaConCapturas;
    ventana.__respuestasAsistente = [];
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const respuesta = await original(...args);
      const entrada = args[0];
      const url = entrada instanceof Request ? entrada.url : String(entrada);
      if (url.includes("/api/asistente")) ventana.__respuestasAsistente?.push(respuesta.clone().text().catch(() => ""));
      return respuesta;
    };
  });
}

/** Lo que respondió la última vez `/api/asistente` (espera a que el flujo termine). */
export async function ultimaRespuestaDelAsistente(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const copias = (window as VentanaConCapturas).__respuestasAsistente ?? [];
    return (await Promise.all(copias)).at(-1) ?? "";
  });
}
