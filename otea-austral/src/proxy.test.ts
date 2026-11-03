import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const configuracion = vi.hoisted(() => ({
  env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.example.org", HTTPS_FORZADO: "1" },
}));
vi.mock("@/lib/env", () => configuracion);

const { proxy } = await import("./proxy");

const pedir = (url: string, cabeceras: Record<string, string> = {}) =>
  proxy(new NextRequest(url, { headers: cabeceras }));

describe("proxy", () => {
  it("redirige con 308 a https cuando el proxy dice que la solicitud llegó por http", () => {
    const r = pedir("http://localhost:8080/alertas?x=1", { "x-forwarded-proto": "http" });
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://oteaustral.example.org/alertas?x=1");
  });

  it("con https aplica la CSP con nonce y no redirige", () => {
    const r = pedir("https://oteaustral.example.org/", { "x-forwarded-proto": "https" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
    expect(r.headers.get("location")).toBeNull();
  });

  it("sin cabecera de protocolo (sondas, pruebas locales) no redirige", () => {
    expect(pedir("http://localhost:8080/").status).toBe(200);
  });

  it("el interruptor HTTPS_FORZADO=0 apaga la redirección (bucle de emergencia, pruebas locales por http)", () => {
    configuracion.env.HTTPS_FORZADO = "0";
    try {
      expect(pedir("http://localhost:8080/alertas", { "x-forwarded-proto": "http" }).status).toBe(200);
    } finally {
      configuracion.env.HTTPS_FORZADO = "1";
    }
  });

  it("cada solicitud lleva su propio nonce", () => {
    const nonce = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce(pedir("https://x.example/"))).not.toBe(nonce(pedir("https://x.example/")));
  });
});
