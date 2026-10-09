import { z } from "zod";
import { httpsUrl } from "@/lib/domain/url";

const EnvSchema = z.object({
  /** URL base pública del sitio. En producción debe ser https. */
  NEXT_PUBLIC_SITE_URL: z.union([httpsUrl, z.literal("http://localhost:3000")]).default("http://localhost:3000"),
});

export const env = EnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
});
