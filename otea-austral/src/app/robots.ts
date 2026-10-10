import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/lista-de-espera/", "/admin"] },
    sitemap: new URL("/sitemap.xml", SITIO.url).href,
  };
}
