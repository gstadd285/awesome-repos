import type { MetadataRoute } from "next";
import { RUTAS_PUBLICAS, SITIO } from "@/lib/site";

// Ver `robots.ts`: la URL base se lee al responder, no al construir la imagen.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return RUTAS_PUBLICAS.map((ruta) => ({
    url: new URL(ruta, SITIO.url).href,
    changeFrequency: ruta === "/" ? "weekly" : "monthly",
    priority: ruta === "/" ? 1 : 0.6,
  }));
}
