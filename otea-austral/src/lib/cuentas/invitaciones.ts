import { randomInt } from "node:crypto";
import { z } from "zod";
import { Actor } from "@/lib/domain/schemas";
import { logSecurityEvent } from "@/lib/security/log";
import type { AlmacenCuentas, AuditoriaInvitacion, InvitacionGuardada } from "./almacen";
import type { CifradorCuentas } from "./cifrado";
import {
  ENVIOS_POR_INVITACION,
  INVITACIONES_VIGENTES_MAX,
  VIGENCIA_INVITACION_DIAS,
  VIGENCIA_MAXIMA_INVITACION_DIAS,
} from "./constantes";

/**
 * Códigos de invitación del acceso anticipado (`CUENTAS_MODO=invitacion`, `docs/alertas-reales.md` §6).
 *
 *   · 20 caracteres al azar del alfabeto base32 (RFC 4648: A–Z y 2–7) = 100 bits, en cuatro grupos de cinco
 *     (`XXXXX-XXXXX-XXXXX-XXXXX`). Con 100 bits no hay nada que adivinar, y aun así cada intento se limita.
 *   · Se muestra **una sola vez**, al emitirlo; la base guarda solo su HMAC-SHA256 (`cifrado.ts`, propósito `invitaciones`).
 *   · Vale un solo alta: se gasta en la misma transacción que crea la cuenta. Vence (14 días por omisión, 30 como máximo) y
 *     se puede revocar. Cada emisión, revocación y uso deja una fila en `invitacion_auditoria` (solo agregar).
 */
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const LARGO = 20;
const FORMATO = /^[A-Z2-7]{20}$/;

export function generarCodigoInvitacion(): string {
  const caracteres = Array.from({ length: LARGO }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return formatearCodigoInvitacion(caracteres);
}

/** `ABCDEFGHIJKLMNOPQRST` → `ABCDE-FGHIJ-KLMNO-PQRST`. */
export function formatearCodigoInvitacion(normalizado: string): string {
  return normalizado.match(/.{1,5}/g)?.join("-") ?? normalizado;
}

/**
 * Lo que se compara: sin espacios ni guiones y en mayúsculas. Los dígitos que el alfabeto no usa porque se confunden con
 * letras (0, 1, 8) se leen como esas letras (O, I, B).
 */
export function normalizarCodigoInvitacion(texto: string): string {
  return texto
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/8/g, "B");
}

/**
 * Código escrito en el formulario de alta. Solo se comprueba la **forma** (no dice nada de si existe): el mismo mensaje
 * para cualquier texto mal formado.
 */
export const CodigoInvitacionSchema = z
  .string({ message: "Escribe tu código de invitación." })
  .max(64, "Revisa el código de invitación: son 20 letras y números, en cuatro grupos de cinco.")
  .transform(normalizarCodigoInvitacion)
  .pipe(
    z
      .string()
      .min(1, "Escribe tu código de invitación.")
      .regex(FORMATO, "Revisa el código de invitación: son 20 letras y números, en cuatro grupos de cinco."),
  );

/** Lo que pide el panel para emitir una invitación. El alias es interno y sin datos personales (la forma del actor). */
export const EmisionSchema = z.object({
  alias: z
    .string({ message: "Escribe un alias." })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{0,39}$/, "El alias admite minúsculas, números, punto, guion y guion bajo (hasta 40), sin datos personales.")
    .pipe(Actor),
  dias: z.coerce
    .number({ message: "Elige la vigencia en días." })
    .int("La vigencia es un número entero de días.")
    .min(1, "La vigencia es de 1 día como mínimo.")
    .max(VIGENCIA_MAXIMA_INVITACION_DIAS, `La vigencia es de ${VIGENCIA_MAXIMA_INVITACION_DIAS} días como máximo.`)
    .default(VIGENCIA_INVITACION_DIAS),
});

export type EstadoInvitacion = "vigente" | "agotada" | "vencida" | "usada" | "revocada";

/** Estado para el panel. `agotada`: ya provocó todos los correos de alta que admite (no sirve para pedir otro). */
export function estadoInvitacion(i: InvitacionGuardada, ahora: Date): EstadoInvitacion {
  if (i.usada) return "usada";
  if (i.revocada) return "revocada";
  if (Date.parse(i.vence) <= ahora.getTime()) return "vencida";
  if (i.envios >= ENVIOS_POR_INVITACION) return "agotada";
  return "vigente";
}

export type InvitacionListada = InvitacionGuardada & { estado: EstadoInvitacion };

export type ResultadoEmision =
  | { ok: true; id: string; codigo: string; alias: string; vence: string }
  | { ok: false; motivos: string[] };

const ID = z.string().uuid();
const DIA_MS = 24 * 60 * 60_000;

/**
 * Lo que hace el panel con las invitaciones. Quien llama ya comprobó la sesión y el token CSRF del panel
 * (`exigirAccionAdmin`); `actor` es el alias del panel, que firma la auditoría.
 */
export function crearServicioInvitaciones({
  almacen,
  cifrador,
  ahora = () => new Date(),
  generar = generarCodigoInvitacion,
}: {
  almacen: AlmacenCuentas;
  cifrador: Pick<CifradorCuentas, "hashInvitacion">;
  ahora?: () => Date;
  generar?: () => string;
}) {
  const falla = (codigo: string) => logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo });

  return {
    async emitir(entrada: { alias: unknown; dias: unknown }, actor: string): Promise<ResultadoEmision> {
      const datos = EmisionSchema.safeParse({ alias: entrada.alias, dias: entrada.dias === "" ? undefined : entrada.dias });
      if (!datos.success) return { ok: false, motivos: [...new Set(datos.error.issues.map((i) => i.message))] };
      const instante = ahora();
      const vence = new Date(instante.getTime() + datos.data.dias * DIA_MS);
      const codigo = generar();
      try {
        const r = await almacen.emitirInvitacion({
          codigoHash: cifrador.hashInvitacion(normalizarCodigoInvitacion(codigo)),
          alias: datos.data.alias,
          actor,
          ahora: instante.toISOString(),
          vence: vence.toISOString(),
          maximoVigentes: INVITACIONES_VIGENTES_MAX,
        });
        if (r === "tope") {
          return { ok: false, motivos: [`Ya hay ${INVITACIONES_VIGENTES_MAX} invitaciones vigentes: revoca alguna o espera a que venzan.`] };
        }
        logSecurityEvent({ tipo: "invitacion", evento: "emitida" });
        return { ok: true, id: r.id, codigo, alias: datos.data.alias, vence: vence.toISOString() };
      } catch {
        falla("invitaciones_emitir");
        return { ok: false, motivos: ["No se pudo guardar la invitación. Inténtalo de nuevo en unos minutos."] };
      }
    },

    async revocar(id: unknown, actor: string): Promise<{ ok: true } | { ok: false; motivos: string[] }> {
      const valido = ID.safeParse(id);
      if (!valido.success) return { ok: false, motivos: ["Esa invitación no existe."] };
      try {
        if (!(await almacen.revocarInvitacion(valido.data, actor, ahora().toISOString()))) {
          return { ok: false, motivos: ["Esa invitación ya estaba usada o revocada."] };
        }
      } catch {
        falla("invitaciones_revocar");
        return { ok: false, motivos: ["No se pudo revocar la invitación. Inténtalo de nuevo en unos minutos."] };
      }
      logSecurityEvent({ tipo: "invitacion", evento: "revocada" });
      return { ok: true };
    },

    async listar(): Promise<{ invitaciones: InvitacionListada[]; vigentes: number; auditoria: AuditoriaInvitacion[] }> {
      const instante = ahora();
      const [guardadas, auditoria] = await Promise.all([almacen.listarInvitaciones(200), almacen.auditoriaInvitaciones(50)]);
      const invitaciones = guardadas.map((i) => ({ ...i, estado: estadoInvitacion(i, instante) }));
      // Para el tope cuenta lo que no se usó, no se revocó y no venció (aunque haya agotado sus correos).
      const vigentes = invitaciones.filter((i) => i.estado === "vigente" || i.estado === "agotada").length;
      return { invitaciones, vigentes, auditoria };
    },
  };
}

export type ServicioInvitaciones = ReturnType<typeof crearServicioInvitaciones>;
