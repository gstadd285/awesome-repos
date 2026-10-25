/**
 * Plazos, límites y formatos de las cuentas de personas usuarias. Un solo lugar: los pide el servicio, el almacén y
 * las pruebas, y cada número tiene su razón escrita aquí.
 */
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** El enlace para crear la cuenta vale 72 horas (igual que el de la lista de espera). */
export const VIGENCIA_ALTA_MS = 72 * HORA;
/** El enlace para restablecer la contraseña vale una hora: es el más delicado, porque cambia la puerta de entrada. */
export const VIGENCIA_RESTABLECER_MS = HORA;
/** Si no llegó el correo, se puede pedir otro enlace pasados 10 minutos (y no se envían dos seguidos). */
export const ESPERA_REENVIO_MS = 10 * MINUTO;
/** Entre la contraseña correcta y el código de la app hay 10 minutos: una sesión «a medias» no sirve para nada más. */
export const SESION_PENDIENTE_MS = 10 * MINUTO;
/** Una sesión completa dura 30 días como máximo, pase lo que pase. */
export const SESION_ABSOLUTA_MS = 30 * DIA;
/** …y se cierra sola si pasan 7 días sin usarla. */
export const SESION_INACTIVA_MS = 7 * DIA;
/** El «último uso» se anota como mucho cada 10 minutos: leer una página no debe escribir en la base cada vez. */
export const TOCAR_SESION_CADA_MS = 10 * MINUTO;

/** Los intentos fallidos de entrar (contraseña y segundo paso) se cuentan juntos, por cuenta, en ventanas de 15 minutos… */
export const VENTANA_FALLOS_MS = 15 * MINUTO;
/**
 * …y cada cuenta tiene 100 «puntos» por ventana: es el tope que fija NIST SP 800-63B (§5.2.2) para los intentos fallidos
 * seguidos de una misma cuenta. Pasado el tope, no se prueba nada más hasta que termine la ventana (o hasta que la persona
 * restablezca su contraseña con el enlace del correo, que lo borra).
 *
 * Es alto a propósito. Un tope bajo por cuenta le entrega a cualquiera que sepa un correo un bloqueo a distancia: ocho
 * intentos desde cualquier lugar bastarían para dejar a esa persona sin entrar, una y otra vez. El freno fino va por
 * (correo, cliente), que bloquea al atacante y no a la dueña de la cuenta; este de aquí solo acota las pruebas que logran
 * repartirse entre muchos clientes.
 */
export const PUNTOS_MAX_CUENTA = 100;
/** Una contraseña equivocada gasta 1 punto… */
export const PUNTOS_CLAVE = 1;
/**
 * …y un código del segundo paso equivocado gasta más: solo se llega a él con la contraseña correcta, y adivinar seis
 * dígitos es un riesgo distinto. Con 13 puntos caben exactamente 8 códigos equivocados por ventana (el tope de siempre).
 */
export const INTENTOS_CODIGO = 8;
export const PUNTOS_CODIGO = Math.ceil(PUNTOS_MAX_CUENTA / INTENTOS_CODIGO);
/** Contraseñas equivocadas que se toleran, por ventana, para un mismo correo desde un mismo cliente. */
export const INTENTOS_POR_CORREO_Y_CLIENTE = 8;
/**
 * Parte de la cuota diaria de correos que pueden usar los correos que cualquiera puede provocar (crear cuenta y el aviso
 * a quien ya la tiene). El resto queda reservado para restablecer contraseñas y avisos de seguridad: llenar el cupo con
 * altas no puede dejar a nadie sin su correo de recuperación.
 */
export const PARTE_DE_CUOTA_PARA_ALTAS = 0.6;

/**
 * Invitaciones (`CUENTAS_MODO=invitacion`, `docs/alertas-reales.md` §6). Un código vale 14 días por omisión y 30 como
 * máximo (la base no admite más); puede haber hasta 50 vigentes a la vez.
 */
export const VIGENCIA_INVITACION_DIAS = 14;
export const VIGENCIA_MAXIMA_INVITACION_DIAS = 30;
export const INVITACIONES_VIGENTES_MAX = 50;
/**
 * Correos de alta que puede provocar un mismo código, contados en la base (para todas las instancias): un código filtrado no
 * sirve para mandar correos sin fin. Pasado el tope, el código responde como uno que no existe.
 */
export const ENVIOS_POR_INVITACION = 5;
/** Pedidos de alta con código por cliente: 10 por hora y 30 por día (todos cuentan, el código sea bueno o no). */
export const INTENTOS_INVITACION_HORA = 10;
export const INTENTOS_INVITACION_DIA = 30;
/** Pedidos con un mismo código, desde cualquier cliente, por hora (en memoria; el tope firme es `ENVIOS_POR_INVITACION`). */
export const INTENTOS_POR_CODIGO_HORA = 5;

/** Las cuentas por confirmar se borran a los 7 días (no guardan contraseña: solo el correo cifrado). */
export const PLAZO_ALTAS_SIN_CONFIRMAR_MS = 7 * DIA;
/** La actividad de seguridad que ve la persona se guarda 90 días. */
export const RETENCION_EVENTOS_MS = 90 * DIA;
/** Cuántos códigos de recuperación se entregan al activar los dos pasos. */
export const CODIGOS_DE_RECUPERACION = 10;
/** Cuántas sesiones abiertas a la vez, como máximo, por cuenta (las más antiguas se cierran). */
export const MAX_SESIONES_POR_CUENTA = 10;

/** Contraseña: largo mínimo y máximo (el máximo acota el trabajo de quien envía textos enormes). */
export const LARGO_MIN_CLAVE = 12;
export const LARGO_MAX_CLAVE = 128;
export const LARGO_MAX_NOMBRE = 60;

/** Token de un solo uso (enlaces de los correos): 32 bytes en base64url. */
export const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Hash hexadecimal de 64 caracteres (SHA-256): lo que se guarda de tokens, sesiones y códigos. */
export const FORMATO_HASH = /^[0-9a-f]{64}$/;

/** Cookie de la sesión de la persona usuaria. `__Host-` obliga a `Secure`, `Path=/` y sin `Domain`. */
export const COOKIE_SESION_CUENTA = "__Host-otea_sesion";
/**
 * Atributos de la cookie. `SameSite=Lax` (y no `Strict`, que usa el panel): quien llega desde un enlace de un correo o de
 * un buscador entra con su sesión puesta en vez de ver «Entrar» hasta el siguiente clic. Nada que cambie datos se hace
 * con GET, y toda acción pasa por la comprobación de `Origin` de Next.js y por un token anti-CSRF.
 */
export const OPCIONES_COOKIE_CUENTA = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
