import { crearManejadorReportesCsp } from "@/lib/security/csp-report";

/** Los navegadores envían aquí las violaciones de la CSP (`report-uri` / `report-to`). */
export const POST = crearManejadorReportesCsp();
