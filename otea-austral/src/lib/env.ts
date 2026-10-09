import { z } from "zod";
import { parseHttpsUrl, httpsUrl } from "@/lib/domain/url";

/**
 * Canal privado para reportar vulnerabilidades: `mailto:` o una URL https.
 * Por defecto, el formulario privado de GitHub del repositorio (hay que
 * activarlo en Settings → Security → Private vulnerability reporting).
 */
export const CONTACTO_SEGURIDAD_POR_DEFECTO =
  "https://github.com/gstadd285/awesome-repos/security/advisories/new";

const contactoSeguridad = z
  .string()
  .refine(
    (v) => /^mailto:[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i.test(v) || parseHttpsUrl(v) !== null,
    "Debe ser mailto:correo o una URL https",
  );

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** URL base pública del sitio. En producción debe ser https. */
    NEXT_PUBLIC_SITE_URL: z
      .union([httpsUrl, z.literal("http://localhost:3000")])
      .default("http://localhost:3000"),
    SECURITY_CONTACT: contactoSeguridad.default(CONTACTO_SEGURIDAD_POR_DEFECTO),
    /**
     * `cerrada` (por defecto): la lista no guarda correos. `memoria`: solo
     * desarrollo y pruebas (se pierde al reiniciar y no envía correos).
     */
    WAITLIST_MODE: z.enum(["cerrada", "memoria"]).default("cerrada"),
    /** Permite `memoria` en un build de producción solo para pruebas e2e. */
    OTEA_E2E: z.enum(["0", "1"]).default("0"),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.WAITLIST_MODE === "memoria" && e.OTEA_E2E !== "1"), {
    message: "WAITLIST_MODE=memoria no se permite en producción: los correos se perderían.",
    path: ["WAITLIST_MODE"],
  });

export const env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  SECURITY_CONTACT: process.env.SECURITY_CONTACT || undefined,
  WAITLIST_MODE: process.env.WAITLIST_MODE || undefined,
  OTEA_E2E: process.env.OTEA_E2E || undefined,
});
