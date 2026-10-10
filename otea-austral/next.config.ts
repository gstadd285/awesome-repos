import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // La CSP con nonce exige renderizado dinámico, incompatible con el
  // prerenderizado parcial de Cache Components. Ver SECURITY.md.
  cacheComponents: false,
  poweredByHeader: false,
  // Carpeta autocontenida (.next/standalone) para la imagen de contenedor de Cloud Run.
  output: "standalone",
  // El sitio no usa `next/image`: sin optimizador no existe el endpoint público `/_next/image`.
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Todos los formularios son pequeños (el mayor, una alerta con 8 filas, no llega a 20 KB). El tope
      // por defecto de 1 MB solo deja más margen para gastar memoria al procesar cuerpos enormes.
      bodySizeLimit: "100kb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El panel interno no se indexa (Next.js ya lo sirve con `no-store`: es dinámico).
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
