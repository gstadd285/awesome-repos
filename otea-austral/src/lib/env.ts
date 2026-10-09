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

const EnvSchema = z.object({
  /** URL base pública del sitio. En producción debe ser https. */
  NEXT_PUBLIC_SITE_URL: z
    .union([httpsUrl, z.literal("http://localhost:3000")])
    .default("http://localhost:3000"),
  SECURITY_CONTACT: contactoSeguridad.default(CONTACTO_SEGURIDAD_POR_DEFECTO),
});

export const env = EnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  SECURITY_CONTACT: process.env.SECURITY_CONTACT || undefined,
});
