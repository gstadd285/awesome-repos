import { describe, expect, it, vi } from "vitest";
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

describe("EnvSchema · tercio 3", () => {
  const HASH = `pbkdf2-sha256$600000$${"s".repeat(22)}$${"h".repeat(43)}`;
  const TOTP = "A".repeat(32);
  const SESION = "x".repeat(43);
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";

  it("la lista abierta exige base de datos y clave de correo", () => {
    expect(EnvSchema.safeParse({ WAITLIST_MODE: "abierta" }).success).toBe(false);
    expect(EnvSchema.safeParse({ WAITLIST_MODE: "abierta", DATABASE_URL: DB, RESEND_API_KEY: "re_1234567890ab" }).success).toBe(
      true,
    );
  });

  it("en producción exige la URL https del sitio, pero no mientras se construye la imagen", () => {
    const base = { NODE_ENV: "production", WAITLIST_MODE: "abierta", DATABASE_URL: DB, RESEND_API_KEY: "re_1234567890ab" };
    expect(EnvSchema.safeParse(base).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" }).success).toBe(true);
    // Sin configuración alguna (la URL por omisión es localhost): tampoco se arranca.
    expect(EnvSchema.safeParse({ NODE_ENV: "production" }).success).toBe(false);
    // Las pruebas e2e y el desarrollo local siguen funcionando sin URL.
    expect(EnvSchema.safeParse({ NODE_ENV: "production", OTEA_E2E: "1" }).success).toBe(true);
    expect(EnvSchema.safeParse({ NODE_ENV: "development" }).success).toBe(true);

    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    try {
      expect(EnvSchema.safeParse({ NODE_ENV: "production" }).success).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("en producción la base de datos debe verificar el certificado", () => {
    const sinTls = "postgresql://otea_web:clave@host.neon.tech/neondb?sslmode=require";
    const sitio = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" };
    expect(EnvSchema.safeParse({ ...sitio, DATABASE_URL: sinTls }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...sitio, DATABASE_URL: DB }).success).toBe(true);
  });

  it("el tope diario de correos tiene un valor por omisión y límites", () => {
    expect(EnvSchema.parse({}).WAITLIST_ENVIOS_DIARIOS).toBe(80);
    expect(EnvSchema.parse({ WAITLIST_ENVIOS_DIARIOS: "50" }).WAITLIST_ENVIOS_DIARIOS).toBe(50);
    for (const malo of ["0", "-1", "10000", "mucho"]) {
      expect(EnvSchema.safeParse({ WAITLIST_ENVIOS_DIARIOS: malo }).success).toBe(false);
    }
  });

  it("el panel se configura completo o no se configura", () => {
    expect(EnvSchema.safeParse({ ADMIN_CLAVE_HASH: HASH }).success).toBe(false);
    expect(EnvSchema.safeParse({ ADMIN_CLAVE_HASH: HASH, ADMIN_TOTP_SECRETO: TOTP, ADMIN_SESION_SECRETO: SESION }).success).toBe(
      false,
    );
    expect(
      EnvSchema.safeParse({
        ADMIN_CLAVE_HASH: HASH,
        ADMIN_TOTP_SECRETO: TOTP,
        ADMIN_SESION_SECRETO: SESION,
        DATABASE_URL: DB,
      }).success,
    ).toBe(true);
  });

  it("rechaza hashes débiles, secretos cortos y alias con correo", () => {
    const debil = `pbkdf2-sha256$100000$${"s".repeat(22)}$${"h".repeat(43)}`;
    expect(EnvSchema.safeParse({ ADMIN_CLAVE_HASH: debil }).success).toBe(false);
    expect(EnvSchema.safeParse({ ADMIN_SESION_SECRETO: "corto" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ADMIN_ALIAS: "persona@correo.cl" }).success).toBe(false);
  });

  it("valida el remitente y los proxies de confianza", () => {
    expect(EnvSchema.parse({}).EMAIL_REMITENTE).toBe("Otea Austral <alertas@oteaustral.com>");
    expect(EnvSchema.safeParse({ EMAIL_REMITENTE: "x\r\nBcc: otro@x.cl" }).success).toBe(false);
    expect(EnvSchema.parse({ IP_PROXIES_CONFIABLES: "2" }).IP_PROXIES_CONFIABLES).toBe(2);
    expect(EnvSchema.safeParse({ IP_PROXIES_CONFIABLES: "9" }).success).toBe(false);
  });
});
