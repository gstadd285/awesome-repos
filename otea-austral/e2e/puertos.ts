/** Puertos de los servidores auxiliares de las pruebas e2e (el principal es el 3200; ver `playwright.config.ts`). */

/** Segunda instancia de la aplicación, con el asistente en modo IA. */
export const PUERTO_IA = 3201;
/** Servidor que imita la API de Anthropic (`scripts/anthropic-falso.mjs`). */
export const PUERTO_API_FALSA = 3299;

/** Servidor que imita la API de correo de Resend (`scripts/resend-falso.mjs`): ahí «llegan» los correos de las cuentas. */
export const PUERTO_CORREO = 3298;

export const URL_IA = `http://localhost:${PUERTO_IA}`;
export const URL_API_FALSA = `http://127.0.0.1:${PUERTO_API_FALSA}`;
export const URL_CORREO = `http://127.0.0.1:${PUERTO_CORREO}`;
