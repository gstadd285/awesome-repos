import { parseHttpsUrl } from "@/lib/domain/url";

/**
 * Dominios oficiales de Mercado Pago para links de pago, verificados el 2026-10-28 (`docs/despliegue.md` §15):
 *
 * - `link.mercadopago.cl`: el link de cobro de una cuenta de Chile (`/nombre`; con monto abierto, «Ingresa el monto a pagar»).
 * - `mpago.la`: el dominio corto de los links de pago en la documentación oficial de Mercado Pago para desarrolladores.
 *
 * Lista cerrada y host exacto: ni subdominios, ni dominios parecidos (`mpago.co` es de un tercero), ni dominios que no se
 * pudieron confirmar como de links de pago (`mpago.li` solo aparece en enlaces de promociones; `mpago.cl/link`, como dibujo).
 * Sumar uno exige verificarlo en una fuente oficial y agregar su caso a `enlace.test.ts`.
 */
export const DOMINIOS_DONACIONES = ["link.mercadopago.cl", "mpago.la"] as const;

/** La ruta del link: uno o más tramos con letras, dígitos, `.`, `_`, `~` o `-` (sin `%`, sin espacios). */
const RUTA = /^(\/[A-Za-z0-9._~-]{1,120}){1,4}\/?$/;

/**
 * El link de pago para aportes, normalizado, si es https, de un dominio de la lista (exacto), sin puerto, sin credenciales,
 * con una ruta y sin parámetros ni ancla; si no, `null`. Así el enlace de `/apoyar` solo puede llevar a Mercado Pago.
 */
export function enlaceDonacion(valor: string): string | null {
  const url = parseHttpsUrl(valor);
  if (!url) return null;
  if (!(DOMINIOS_DONACIONES as readonly string[]).includes(url.hostname)) return null;
  if (url.port !== "" || /[?#]/.test(valor)) return null;
  if (!RUTA.test(url.pathname)) return null;
  return url.href;
}
