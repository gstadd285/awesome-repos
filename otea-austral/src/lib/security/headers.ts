import { CSP_REPORT_GROUP, CSP_REPORT_PATH } from "./csp";

/** Cabeceras de seguridad estáticas para todas las respuestas. La CSP va en `src/proxy.ts`. */
export const securityHeaders: { key: string; value: string }[] = [
  // Sin `preload` hasta tener el dominio definitivo (ver SECURITY.md).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Respaldo para navegadores sin `frame-ancestors`.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Destino de la Reporting API para `report-to` de la CSP.
  { key: "Reporting-Endpoints", value: `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"` },
];
