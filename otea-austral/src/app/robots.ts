import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/site";

// Usa la URL del sitio de la configuración del servidor: se lee en cada solicitud, no al construir
// la imagen, para que una sola imagen sirva a cualquier dominio.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/lista-de-espera/", "/admin"] },
    sitemap: new URL("/sitemap.xml", SITIO.url).href,
  };
}
