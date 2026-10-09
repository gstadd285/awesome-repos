import { env } from "@/lib/env";

export const SITIO = {
  nombre: "Otea Austral",
  descriptor: "Inteligencia de eventos para mercados.",
  eslogan: "Del horizonte al mercado.",
  descripcion:
    "Avisos de eventos globales y de los sectores y activos que podrían verse afectados, con nivel de confianza y fuentes. Información y análisis; no constituye asesoría financiera.",
  url: env.NEXT_PUBLIC_SITE_URL,
} as const;

/** Rutas públicas indexables (sitemap). */
export const RUTAS_PUBLICAS = [
  "/",
  "/metodologia",
  "/fuentes",
  "/seguridad",
  "/privacidad",
  "/terminos",
  "/aviso-legal",
] as const;
