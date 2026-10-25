/** Puertos de los servidores auxiliares de las pruebas e2e (el principal es el 3200; ver `playwright.config.ts`). */

/** Segunda instancia de la aplicación, con el asistente en modo IA. */
export const PUERTO_IA = 3201;
/**
 * Tercera instancia (solo con base de datos): las cuentas en modo `invitacion` (acceso anticipado privado), con la misma
 * base y el mismo `CUENTAS_SECRETO` que la principal: los códigos que emite el panel del 3200 sirven aquí.
 */
export const PUERTO_INVITACION = 3202;
/** Servidor que imita la API de Anthropic (`scripts/anthropic-falso.mjs`). */
export const PUERTO_API_FALSA = 3299;

/** Servidor que imita la API de correo de Resend (`scripts/resend-falso.mjs`): ahí «llegan» los correos de las cuentas. */
export const PUERTO_CORREO = 3298;

export const URL_IA = `http://localhost:${PUERTO_IA}`;
export const URL_INVITACION = `http://localhost:${PUERTO_INVITACION}`;
export const URL_API_FALSA = `http://127.0.0.1:${PUERTO_API_FALSA}`;
export const URL_CORREO = `http://127.0.0.1:${PUERTO_CORREO}`;
