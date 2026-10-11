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
      // Lo mismo para las cuentas de personas usuarias. Las dos páginas a las que se llega con un enlace de correo (el
      // token va en la dirección) solo entregan su origen como referente, nunca la dirección con el token. No es
      // `no-referrer`: con esa política el navegador manda `Origin: null` en el envío de un formulario sin JavaScript y
      // Next.js lo rechaza (500) en vez de procesarlo.
      { source: "/cuenta/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/cuenta/activar", headers: [{ key: "Referrer-Policy", value: "strict-origin" }] },
      { source: "/cuenta/restablecer", headers: [{ key: "Referrer-Policy", value: "strict-origin" }] },
    ];
  },
};

export default nextConfig;
