import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITIO.nombre,
    short_name: "Otea",
    description: SITIO.descriptor,
    lang: "es-CL",
    start_url: "/",
    display: "standalone",
    background_color: "#E7E5E0",
    theme_color: "#E7E5E0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
