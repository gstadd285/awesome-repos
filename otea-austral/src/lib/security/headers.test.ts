import { describe, expect, it } from "vitest";
import { securityHeaders } from "./headers";

const valor = (nombre: string) => securityHeaders.find((h) => h.key.toLowerCase() === nombre.toLowerCase())?.value;

describe("cabeceras de seguridad estáticas", () => {
  it("HSTS dura al menos un año, cubre subdominios y no lleva preload hasta tener el dominio definitivo", () => {
    const hsts = valor("Strict-Transport-Security") ?? "";
    const edad = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
    expect(edad).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });

  it("evita el rastreo del tipo de contenido, el marco ajeno y el envío del origen completo", () => {
    expect(valor("X-Content-Type-Options")).toBe("nosniff");
    expect(valor("X-Frame-Options")).toBe("DENY");
    expect(valor("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("aísla el origen: COOP y CORP del mismo origen, sin políticas entre dominios", () => {
    expect(valor("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(valor("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(valor("X-Permitted-Cross-Domain-Policies")).toBe("none");
    expect(valor("Origin-Agent-Cluster")).toBe("?1");
  });

  it("Permissions-Policy desactiva las funciones que el sitio no usa", () => {
    const politica = valor("Permissions-Policy") ?? "";
    for (const f of ["camera", "microphone", "geolocation", "payment", "usb"]) expect(politica).toContain(`${f}=()`);
  });

  it("declara el destino de los reportes de la CSP", () => {
    expect(valor("Reporting-Endpoints")).toBe('csp-endpoint="/api/csp-report"');
  });

  it("no repite cabeceras ni declara X-Powered-By", () => {
    const nombres = securityHeaders.map((h) => h.key.toLowerCase());
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombres).not.toContain("x-powered-by");
  });
});
