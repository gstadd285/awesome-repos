import { test as base } from "@playwright/test";
import { ipDePrueba } from "./ayudas";

/**
 * `test` con una IP propia por prueba (cabecera `X-Forwarded-For` en todo lo que hace el navegador): así los límites
 * por IP del asistente no se agotan entre pruebas que comparten servidor. (El parámetro que Playwright llama `use` se
 * llama `entregar` aquí: con ese nombre, la regla de hooks de React lo confunde con el hook `use`.) Para `request` (llamadas directas a la API)
 * úsala a mano: `{ headers: { "x-forwarded-for": ip } }`.
 */
export const test = base.extend<{ ip: string }>({
  ip: async ({}, entregar, info) => {
    await entregar(ipDePrueba(info.titlePath.join(" › "), info.project.name, info.repeatEachIndex * 100 + info.retry));
  },
  context: async ({ context, ip }, entregar) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await entregar(context);
  },
});

export { expect } from "@playwright/test";
