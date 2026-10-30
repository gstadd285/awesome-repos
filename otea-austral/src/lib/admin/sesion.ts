import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Sesión del panel en una cookie firmada con HMAC-SHA256 y registrada en la base
 * (`admin_sesiones`): la firma descarta falsificaciones sin tocar la base y la
 * base decide si sigue vigente, así que «Salir» la revoca de verdad. `__Host-`
 * obliga a `Secure`, `Path=/` y sin `Domain`, así un subdominio no puede plantar
 * la cookie. Se cierra al vencer, al revocarla o al rotar `ADMIN_SESION_SECRETO`.
 */
export const COOKIE_SESION = "__Host-otea_admin";
export const DURACION_SESION_MS = 8 * 60 * 60_000;

/**
 * Atributos de la cookie de sesión del panel. Una prueba los fija: `HttpOnly` (el JavaScript de la
 * página no la lee), `Secure` y `Path=/` sin `Domain` (requisitos de `__Host-`) y `SameSite=Strict`
 * (el navegador no la envía desde otros sitios).
 */
export const OPCIONES_COOKIE = { httpOnly: true, secure: true, sameSite: "strict", path: "/" } as const;

const SesionSchema = z.strictObject({
  v: z.literal(1),
  sid: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});
export type Sesion = z.infer<typeof SesionSchema>;

const firmar = (secreto: string, proposito: string, dato: string) =>
  createHmac("sha256", secreto).update(`${proposito}.${dato}`).digest("base64url");

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function crearSesion(secreto: string, ahoraMs: number): { valor: string; sesion: Sesion } {
  const sesion: Sesion = {
    v: 1,
    sid: randomBytes(16).toString("base64url"),
    iat: ahoraMs,
    exp: ahoraMs + DURACION_SESION_MS,
  };
  const carga = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  return { valor: `${carga}.${firmar(secreto, "sesion", carga)}`, sesion };
}

/** La sesión si la firma es válida y no venció; si no, `null`. */
export function leerSesion(secreto: string, valor: string | undefined, ahoraMs: number): Sesion | null {
  if (!valor || valor.length > 512) return null;
  const partes = valor.split(".");
  if (partes.length !== 2) return null;
  const [carga, firma] = partes;
  if (!iguales(firma, firmar(secreto, "sesion", carga))) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(Buffer.from(carga, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const r = SesionSchema.safeParse(datos);
  if (!r.success) return null;
  const s = r.data;
  if (s.exp <= ahoraMs || s.iat > ahoraMs + 60_000 || s.exp - s.iat > DURACION_SESION_MS) return null;
  return s;
}

/** Token anti-CSRF ligado a la sesión: va oculto en cada formulario del panel. */
export function tokenCsrf(secreto: string, sid: string): string {
  return firmar(secreto, "csrf", sid);
}

export function verificarCsrf(secreto: string, sid: string, recibido: unknown): boolean {
  return typeof recibido === "string" && recibido.length < 100 && iguales(recibido, tokenCsrf(secreto, sid));
}
