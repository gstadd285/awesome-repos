import { z } from "zod";

/** Versión del texto de consentimiento que acepta la persona (se guarda con el registro). */
export const VERSION_CONSENTIMIENTO = "2026-10-borrador";

export const SolicitudListaSchema = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "El correo es demasiado largo.")
    .pipe(z.email({ message: "Escribe un correo válido." })),
  acepta: z.literal("on", { message: "Necesitamos tu consentimiento para guardar el correo." }),
});
export type SolicitudLista = z.infer<typeof SolicitudListaSchema>;

/** Token de confirmación: 32 bytes en base64url. */
export const TokenConfirmacion = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
