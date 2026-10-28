import { z } from "zod";

/**
 * Versión de los textos que acepta la persona al inscribirse (el consentimiento para guardar su correo y las
 * condiciones de uso); se guarda con el registro. Cambia cada vez que cambie cualquiera de los dos, o lo que la
 * política de privacidad y las condiciones aclaran sobre lo aceptado. Es la misma versión que usan las cuentas
 * (`VERSION_TEXTOS`): son las mismas dos páginas, y una prueba vigila que no se separen.
 */
export const VERSION_CONSENTIMIENTO = "2026-10-borrador-5";

export const SolicitudListaSchema = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "El correo es demasiado largo.")
    .pipe(z.email({ message: "Escribe un correo válido." })),
  /** Consentimiento para guardar el correo y avisar del lanzamiento (política de privacidad). */
  acepta: z.literal("on", { message: "Necesitamos tu consentimiento para guardar el correo." }),
  /** Aceptación de las condiciones de uso. */
  condiciones: z.literal("on", { message: "Para inscribirte necesitas aceptar las condiciones de uso." }),
});
export type SolicitudLista = z.infer<typeof SolicitudListaSchema>;

/** Token de confirmación: 32 bytes en base64url. */
export const TokenConfirmacion = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
