import { describe, expect, it } from "vitest";
import { EnvSchema } from "./env";

describe("EnvSchema", () => {
  it("por defecto la lista de espera está cerrada", () => {
    expect(EnvSchema.parse({}).WAITLIST_MODE).toBe("cerrada");
  });

  it("no permite la lista en memoria en producción", () => {
    const r = EnvSchema.safeParse({ NODE_ENV: "production", WAITLIST_MODE: "memoria" });
    expect(r.success).toBe(false);
  });

  it("la permite en producción solo para pruebas e2e", () => {
    const r = EnvSchema.safeParse({ NODE_ENV: "production", WAITLIST_MODE: "memoria", OTEA_E2E: "1" });
    expect(r.success).toBe(true);
  });

  it("exige https en la URL del sitio (salvo localhost)", () => {
    expect(EnvSchema.safeParse({ NEXT_PUBLIC_SITE_URL: "http://oteaustral.com" }).success).toBe(false);
    expect(EnvSchema.safeParse({ NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" }).success).toBe(true);
  });

  it("valida el contacto de seguridad", () => {
    expect(EnvSchema.safeParse({ SECURITY_CONTACT: "javascript:alert(1)" }).success).toBe(false);
    expect(EnvSchema.safeParse({ SECURITY_CONTACT: "mailto:seguridad@oteaustral.com" }).success).toBe(true);
  });
});
