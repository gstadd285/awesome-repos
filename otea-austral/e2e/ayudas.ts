import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
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

/** Imagen decodificada de una captura: píxeles RGB(A) de 8 bits, fila a fila. */
export type Pixeles = { ancho: number; alto: number; canales: number; datos: Uint8Array };

/**
 * Decodifica el PNG que devuelve `page.screenshot()` (8 bits, RGB o RGBA, sin entrelazado: lo que produce Chromium)
 * sin dependencias, para leer píxeles de un fotograma en las pruebas.
 */
export function leerPng(png: Buffer): Pixeles {
  let pos = 8;
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const largo = png.readUInt32BE(pos);
    const tipo = png.toString("ascii", pos + 4, pos + 8);
    const cuerpo = png.subarray(pos + 8, pos + 8 + largo);
    if (tipo === "IHDR") {
      ancho = cuerpo.readUInt32BE(0);
      alto = cuerpo.readUInt32BE(4);
      if (cuerpo[8] !== 8 || cuerpo[12] !== 0) throw new Error("PNG no admitido");
      canales = cuerpo[9] === 6 ? 4 : cuerpo[9] === 2 ? 3 : 0;
      if (!canales) throw new Error("PNG no admitido");
    } else if (tipo === "IDAT") idat.push(cuerpo);
    else if (tipo === "IEND") break;
    pos += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const datos = new Uint8Array(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let x = 0; x < fila; x++) {
      const v = crudo[y * (fila + 1) + 1 + x];
      const a = x >= canales ? datos[y * fila + x - canales] : 0;
      const b = y > 0 ? datos[(y - 1) * fila + x] : 0;
      const c = x >= canales && y > 0 ? datos[(y - 1) * fila + x - canales] : 0;
      let pred = 0;
      if (filtro === 1) pred = a;
      else if (filtro === 2) pred = b;
      else if (filtro === 3) pred = (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      datos[y * fila + x] = (v + pred) & 0xff;
    }
  }
  return { ancho, alto, canales, datos };
}

/** Color [r, g, b] de un píxel. */
export function pixel(img: Pixeles, x: number, y: number): [number, number, number] {
  const i = (y * img.ancho + x) * img.canales;
  return [img.datos[i], img.datos[i + 1], img.datos[i + 2]];
}
