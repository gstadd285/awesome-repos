import { describe, expect, it, vi } from "vitest";
import {
  bajaResumenDisponible,
  borradoresActivos,
  cuentasAbiertas,
  cuentasPorInvitacion,
  donacionesActivas,
  enlaceDonaciones,
  EnvSchema,
  resumenActivo,
  MODELOS_ASISTENTE,
  tareasActivas,
} from "./env";

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

  it("HTTPS_FORZADO está activo por omisión y solo admite 0 o 1", () => {
    expect(EnvSchema.parse({}).HTTPS_FORZADO).toBe("1");
    expect(EnvSchema.parse({ HTTPS_FORZADO: "0" }).HTTPS_FORZADO).toBe("0");
    for (const malo of ["true", "2", "no", " 1"]) expect(EnvSchema.safeParse({ HTTPS_FORZADO: malo }).success, malo).toBe(false);
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
  const LISTA = "l".repeat(43);

  it("la lista abierta exige base de datos, clave de correo y secreto de la lista", () => {
    const completa = { WAITLIST_MODE: "abierta", DATABASE_URL: DB, RESEND_API_KEY: "re_1234567890ab", WAITLIST_SECRETO: LISTA };
    expect(EnvSchema.safeParse({ WAITLIST_MODE: "abierta" }).success).toBe(false);
    expect(EnvSchema.safeParse(completa).success).toBe(true);
    for (const falta of ["DATABASE_URL", "RESEND_API_KEY", "WAITLIST_SECRETO"] as const) {
      const { [falta]: _omitida, ...incompleta } = completa;
      void _omitida;
      expect(EnvSchema.safeParse(incompleta).success, falta).toBe(false);
    }
  });

  it("el secreto de la lista debe tener 256 bits en base64url", () => {
    expect(EnvSchema.safeParse({ WAITLIST_SECRETO: LISTA }).success).toBe(true);
    for (const malo of ["corto", "l".repeat(42), `${"l".repeat(43)} `, `${"l".repeat(42)}+`]) {
      expect(EnvSchema.safeParse({ WAITLIST_SECRETO: malo }).success, malo).toBe(false);
    }
  });

  it("en producción exige la URL https del sitio, pero no mientras se construye la imagen", () => {
    const base = {
      NODE_ENV: "production",
      WAITLIST_MODE: "abierta",
      DATABASE_URL: DB,
      RESEND_API_KEY: "re_1234567890ab",
      WAITLIST_SECRETO: LISTA,
    };
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
      // La CI define una base local sin TLS durante el build de las pruebas e2e.
      const sinTls = "postgresql://otea_web:clave@localhost:5432/postgres";
      expect(EnvSchema.safeParse({ NODE_ENV: "production", DATABASE_URL: sinTls }).success).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    // Al ejecutar sí se exige.
    const sinTls = "postgresql://otea_web:clave@localhost:5432/postgres";
    expect(
      EnvSchema.safeParse({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com", DATABASE_URL: sinTls })
        .success,
    ).toBe(false);
  });

  it("en producción la base de datos debe verificar el certificado", () => {
    const sinTls = "postgresql://otea_web:clave@host.neon.tech/neondb?sslmode=require";
    const sitio = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" };
    expect(EnvSchema.safeParse({ ...sitio, DATABASE_URL: sinTls }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...sitio, DATABASE_URL: DB }).success).toBe(true);
  });

  it("el tope diario de correos tiene un valor por omisión y límites", () => {
    expect(EnvSchema.parse({}).WAITLIST_ENVIOS_DIARIOS).toBe(50);
    expect(EnvSchema.parse({ WAITLIST_ENVIOS_DIARIOS: "40" }).WAITLIST_ENVIOS_DIARIOS).toBe(40);
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

describe("EnvSchema · asistente de preguntas", () => {
  const CLAVE = `sk-ant-api03-${"x".repeat(40)}`;
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";
  const ia = {
    ASISTENTE_MODO: "ia",
    ANTHROPIC_API_KEY: CLAVE,
    ASISTENTE_MODELO: "claude-haiku-5-5",
    ASISTENTE_PRECIO_ENTRADA: "0.1",
    ASISTENTE_PRECIO_SALIDA: "0.5",
    ASISTENTE_TOPE_DIARIO_USD: "1",
  };

  it("por omisión responde con la base de conocimiento: sin IA, sin clave y sin costo", () => {
    const e = EnvSchema.parse({});
    expect(e.ASISTENTE_MODO).toBe("base");
    expect(e.ANTHROPIC_API_KEY).toBeUndefined();
    expect(EnvSchema.safeParse({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" }).success).toBe(true);
  });

  it("el modo ia pide todo de forma explícita: clave, modelo, precios y tope de gasto", () => {
    expect(EnvSchema.safeParse(ia).success).toBe(true);
    for (const falta of Object.keys(ia).filter((k) => k !== "ASISTENTE_MODO")) {
      const { [falta]: _omitida, ...incompleta } = ia as Record<string, string>;
      void _omitida;
      const r = EnvSchema.safeParse(incompleta);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
  });

  it("el modo ia no trae valores por omisión para el gasto", () => {
    const e = EnvSchema.parse(ia);
    expect(e.ASISTENTE_TOPE_DIARIO_USD).toBe(1);
    expect(EnvSchema.parse({}).ASISTENTE_TOPE_DIARIO_USD).toBeUndefined();
    expect(EnvSchema.parse({}).ASISTENTE_MODELO).toBeUndefined();
    expect(EnvSchema.parse({}).ASISTENTE_PRECIO_ENTRADA).toBeUndefined();
  });

  it("solo admite los modelos con los que se probó", () => {
    for (const ok of MODELOS_ASISTENTE) expect(EnvSchema.safeParse({ ...ia, ASISTENTE_MODELO: ok }).success, ok).toBe(true);
    for (const malo of ["claude-haiku-4-5", "claude-opus-4-8", "gpt-5", "claude-haiku-5-5 ", "haiku"]) {
      expect(EnvSchema.safeParse({ ...ia, ASISTENTE_MODELO: malo }).success, malo).toBe(false);
    }
  });

  it("valida la clave y las cifras", () => {
    for (const mala of ["corta", "sk-ant-", "re_1234567890abcdef", ` ${CLAVE}`, `${CLAVE}\n`]) {
      expect(EnvSchema.safeParse({ ...ia, ANTHROPIC_API_KEY: mala }).success, mala).toBe(false);
    }
    for (const campo of ["ASISTENTE_PRECIO_ENTRADA", "ASISTENTE_PRECIO_SALIDA", "ASISTENTE_TOPE_DIARIO_USD"]) {
      for (const malo of ["0", "-1", "abc", "1000"]) {
        expect(EnvSchema.safeParse({ ...ia, [campo]: malo }).success, `${campo}=${malo}`).toBe(false);
      }
    }
    expect(EnvSchema.safeParse({ ...ia, ASISTENTE_LLAMADAS_DIARIAS: "0" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ia, ASISTENTE_IA_POR_PERSONA_DIA: "9999" }).success).toBe(false);
    expect(EnvSchema.parse(ia).ASISTENTE_LLAMADAS_DIARIAS).toBe(300);
    expect(EnvSchema.parse(ia).ASISTENTE_IA_POR_PERSONA_DIA).toBe(30);
  });

  it("en producción el tope diario se cuenta en la base: sin DATABASE_URL no se activa", () => {
    const produccion = { ...ia, NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com" };
    expect(EnvSchema.safeParse(produccion).success).toBe(false);
    expect(EnvSchema.safeParse({ ...produccion, DATABASE_URL: DB }).success).toBe(true);
    // Fuera de producción (desarrollo y pruebas) basta la memoria.
    expect(EnvSchema.safeParse(ia).success).toBe(true);
  });

  it("la dirección de pruebas de la API solo se admite en las pruebas e2e", () => {
    const prueba = { ...ia, ASISTENTE_URL_API_PRUEBA: "http://127.0.0.1:3299" };
    expect(EnvSchema.safeParse(prueba).success).toBe(false);
    expect(EnvSchema.safeParse({ ...prueba, OTEA_E2E: "1" }).success).toBe(true);
    expect(EnvSchema.safeParse({ ...prueba, OTEA_E2E: "1", NODE_ENV: "production" }).success).toBe(true);
    expect(EnvSchema.safeParse({ ASISTENTE_URL_API_PRUEBA: "http://127.0.0.1:3299" }).success).toBe(false);
  });
});

describe("EnvSchema · cuentas de personas usuarias", () => {
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";
  const SECRETO = "c".repeat(43);
  const completas = { CUENTAS_MODO: "abiertas", DATABASE_URL: DB, RESEND_API_KEY: "re_1234567890ab", CUENTAS_SECRETO: SECRETO };

  it("por omisión están cerradas: no guardan nada ni piden nada", () => {
    const e = EnvSchema.parse({});
    expect(e.CUENTAS_MODO).toBe("cerradas");
    expect(e.CUENTAS_SECRETO).toBeUndefined();
    expect(e.CUENTAS_ENVIOS_DIARIOS).toBe(20);
  });

  it("abiertas exige base de datos, clave de correo y el secreto de las cuentas", () => {
    expect(EnvSchema.safeParse({ CUENTAS_MODO: "abiertas" }).success).toBe(false);
    expect(EnvSchema.safeParse(completas).success).toBe(true);
    for (const falta of ["DATABASE_URL", "RESEND_API_KEY", "CUENTAS_SECRETO"] as const) {
      const { [falta]: _omitida, ...incompleta } = completas;
      void _omitida;
      const r = EnvSchema.safeParse(incompleta);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
  });

  it("la modalidad solo admite cerradas, memoria, abiertas o invitacion", () => {
    for (const mala of ["abierta", "cerrada", "invitación", "invitaciones", "on", "1", ""]) {
      expect(EnvSchema.safeParse({ CUENTAS_MODO: mala }).success, mala).toBe(false);
    }
  });

  it("invitacion (acceso anticipado privado) exige lo mismo que abiertas, y nace apagada", () => {
    expect(EnvSchema.parse({}).CUENTAS_MODO).not.toBe("invitacion");
    expect(cuentasPorInvitacion(EnvSchema.parse({}))).toBe(false);
    expect(EnvSchema.safeParse({ CUENTAS_MODO: "invitacion" }).success).toBe(false);
    const porInvitacion = { ...completas, CUENTAS_MODO: "invitacion" };
    expect(EnvSchema.safeParse(porInvitacion).success).toBe(true);
    expect(cuentasPorInvitacion(EnvSchema.parse(porInvitacion))).toBe(true);
    expect(cuentasAbiertas(EnvSchema.parse(porInvitacion))).toBe(true);
    for (const falta of ["DATABASE_URL", "RESEND_API_KEY", "CUENTAS_SECRETO"] as const) {
      const { [falta]: _omitida, ...incompleta } = porInvitacion;
      void _omitida;
      const r = EnvSchema.safeParse(incompleta);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
  });

  it("memoria no se permite en producción, salvo para las pruebas e2e", () => {
    expect(EnvSchema.safeParse({ NODE_ENV: "production", CUENTAS_MODO: "memoria" }).success).toBe(false);
    expect(EnvSchema.safeParse({ NODE_ENV: "production", CUENTAS_MODO: "memoria", OTEA_E2E: "1" }).success).toBe(true);
    expect(EnvSchema.safeParse({ NODE_ENV: "development", CUENTAS_MODO: "memoria" }).success).toBe(true);
  });

  it("el secreto debe tener 256 bits en base64url y no repetirse en otro uso", () => {
    expect(EnvSchema.safeParse({ CUENTAS_SECRETO: SECRETO }).success).toBe(true);
    for (const malo of ["corto", "c".repeat(42), `${"c".repeat(42)}+`, `${"c".repeat(43)} `]) {
      expect(EnvSchema.safeParse({ CUENTAS_SECRETO: malo }).success, malo).toBe(false);
    }
    expect(EnvSchema.safeParse({ CUENTAS_SECRETO: SECRETO, WAITLIST_SECRETO: SECRETO }).success).toBe(false);
    expect(EnvSchema.safeParse({ CUENTAS_SECRETO: SECRETO, ADMIN_SESION_SECRETO: SECRETO }).success).toBe(false);
    expect(EnvSchema.safeParse({ CUENTAS_SECRETO: SECRETO, WAITLIST_SECRETO: "d".repeat(43) }).success).toBe(true);
  });

  it("el tope diario de correos es un entero positivo", () => {
    expect(EnvSchema.parse({ CUENTAS_ENVIOS_DIARIOS: "15" }).CUENTAS_ENVIOS_DIARIOS).toBe(15);
    for (const malo of ["0", "-1", "2.5", "abc", "5001"]) expect(EnvSchema.safeParse({ CUENTAS_ENVIOS_DIARIOS: malo }).success, malo).toBe(false);
  });

  it("la dirección de pruebas del correo solo existe con OTEA_E2E=1 (si no, la clave de Resend podría viajar a un servidor ajeno)", () => {
    expect(EnvSchema.safeParse({ RESEND_URL_API_PRUEBA: "http://127.0.0.1:3298/emails" }).success).toBe(false);
    expect(EnvSchema.safeParse({ RESEND_URL_API_PRUEBA: "http://127.0.0.1:3298/emails", OTEA_E2E: "1" }).success).toBe(true);
    expect(EnvSchema.safeParse({ RESEND_URL_API_PRUEBA: "no es una url", OTEA_E2E: "1" }).success).toBe(false);
  });
});

describe("EnvSchema · tareas programadas (ingesta)", () => {
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";
  const SECRETO = "t".repeat(43);
  const activas = { TAREAS_MODO: "activo", DATABASE_URL: DB, TAREAS_SECRETO: SECRETO, INGESTA_CONTACTO: "mailto:ingesta@oteaustral.com" };

  it("por omisión están inactivas: nada sale a internet y las rutas responden 404", () => {
    const e = EnvSchema.parse({});
    expect(e.TAREAS_MODO).toBe("inactivo");
    expect(tareasActivas(e)).toBe(false);
  });

  it("activo exige base de datos, secreto y contacto", () => {
    expect(EnvSchema.safeParse({ TAREAS_MODO: "activo" }).success).toBe(false);
    const completa = EnvSchema.safeParse(activas);
    expect(completa.success).toBe(true);
    expect(tareasActivas(completa.data!)).toBe(true);
    for (const falta of ["DATABASE_URL", "TAREAS_SECRETO", "INGESTA_CONTACTO"] as const) {
      const { [falta]: _omitida, ...incompleta } = activas;
      void _omitida;
      const r = EnvSchema.safeParse(incompleta);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
    for (const malo of ["activa", "on", "1", ""]) expect(EnvSchema.safeParse({ ...activas, TAREAS_MODO: malo }).success, malo).toBe(false);
  });

  it("el secreto tiene 256 bits en base64url y no repite otro secreto", () => {
    expect(EnvSchema.safeParse({ ...activas, TAREAS_SECRETO: "t".repeat(42) }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...activas, TAREAS_SECRETO: `${"t".repeat(42)}+` }).success).toBe(false);
    for (const otro of ["WAITLIST_SECRETO", "CUENTAS_SECRETO", "ADMIN_SESION_SECRETO"]) {
      expect(EnvSchema.safeParse({ ...activas, [otro]: SECRETO }).success, otro).toBe(false);
    }
  });

  it("el contacto es un mailto: sin espacios, paréntesis ni saltos de línea (viaja en el User-Agent)", () => {
    for (const bueno of ["mailto:ingesta@oteaustral.com", "mailto:datos.ingesta@sub.oteaustral.cl"]) {
      expect(EnvSchema.safeParse({ INGESTA_CONTACTO: bueno }).success, bueno).toBe(true);
    }
    for (const malo of [
      "ingesta@oteaustral.com",
      "https://oteaustral.com/contacto",
      "mailto:ingesta@oteaustral.com)",
      "mailto:ingesta@oteaustral.com; X",
      "mailto:ingesta@oteaustral.com\r\nX-Inyectada: 1",
      "mailto:in gesta@oteaustral.com",
    ]) {
      expect(EnvSchema.safeParse({ INGESTA_CONTACTO: malo }).success, malo).toBe(false);
    }
  });

  it("la dirección de las fuentes falsas solo existe con OTEA_E2E=1", () => {
    expect(EnvSchema.safeParse({ INGESTA_URL_PRUEBA: "http://127.0.0.1:3297" }).success).toBe(false);
    expect(EnvSchema.safeParse({ INGESTA_URL_PRUEBA: "http://127.0.0.1:3297", OTEA_E2E: "1" }).success).toBe(true);
  });
});

describe("EnvSchema · borradores con IA (docs/alertas-reales.md §4 y §8.2)", () => {
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";
  const tareas = { TAREAS_MODO: "activo", DATABASE_URL: DB, TAREAS_SECRETO: "t".repeat(43), INGESTA_CONTACTO: "mailto:ingesta@oteaustral.com" };
  const ia = {
    ...tareas,
    BORRADORES_MODO: "ia",
    BORRADORES_ANTHROPIC_API_KEY: `sk-ant-api03-${"b".repeat(40)}`,
    BORRADORES_MODELO: "claude-haiku-5-5",
    BORRADORES_PRECIO_ENTRADA: "0.1",
    BORRADORES_PRECIO_SALIDA: "0.5",
    BORRADORES_TOPE_MENSUAL_USD: "5",
  };

  it("por omisión están apagados: ninguna llamada a un modelo, sin clave ni valores de pago", () => {
    const e = EnvSchema.parse({});
    expect(e.BORRADORES_MODO).toBe("apagado");
    expect(borradoresActivos(e)).toBe(false);
    for (const k of ["BORRADORES_ANTHROPIC_API_KEY", "BORRADORES_MODELO", "BORRADORES_PRECIO_ENTRADA", "BORRADORES_PRECIO_SALIDA", "BORRADORES_TOPE_MENSUAL_USD", "IA_TOPE_TOTAL_USD"] as const) {
      expect(e[k], k).toBeUndefined();
    }
    expect(e.BORRADORES_LLAMADAS_MES).toBe(600);
    expect(e.BORRADORES_POR_CORRIDA).toBe(5);
    // La clave sola no los enciende.
    expect(borradoresActivos(EnvSchema.parse({ ...tareas, BORRADORES_ANTHROPIC_API_KEY: ia.BORRADORES_ANTHROPIC_API_KEY }))).toBe(false);
  });

  it("ia pide todo de forma explícita: clave, modelo, precios y tope del mes", () => {
    const completa = EnvSchema.safeParse(ia);
    expect(completa.success).toBe(true);
    expect(borradoresActivos(completa.data!)).toBe(true);
    for (const falta of Object.keys(ia).filter((k) => k.startsWith("BORRADORES_") && k !== "BORRADORES_MODO")) {
      const { [falta]: _omitida, ...incompleta } = ia as Record<string, string>;
      void _omitida;
      const r = EnvSchema.safeParse(incompleta);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
  });

  it("solo en el servicio de tareas: el sitio público nunca redacta", () => {
    const { TAREAS_MODO: _t, ...sinTareas } = ia;
    void _t;
    const r = EnvSchema.safeParse(sinTareas);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain("BORRADORES_MODO");
  });

  it("el tope del mes no pasa del techo autorizado (US$ 5) y el modelo es de una lista cerrada", () => {
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_TOPE_MENSUAL_USD: "5.01" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_TOPE_MENSUAL_USD: "0" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_TOPE_MENSUAL_USD: "2.5" }).success).toBe(true);
    for (const malo of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5", "gpt-5"]) {
      expect(EnvSchema.safeParse({ ...ia, BORRADORES_MODELO: malo }).success, malo).toBe(false);
    }
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_LLAMADAS_MES: "1401" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_POR_CORRIDA: "21" }).success).toBe(false);
  });

  it("la clave es la de su propio espacio de trabajo: distinta de la del asistente", () => {
    expect(EnvSchema.safeParse({ ...ia, ANTHROPIC_API_KEY: ia.BORRADORES_ANTHROPIC_API_KEY }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ia, BORRADORES_ANTHROPIC_API_KEY: "clave-cualquiera" }).success).toBe(false);
  });

  it("el tope acumulado de toda la IA es opcional y acotado al presupuesto del proyecto", () => {
    expect(EnvSchema.parse({ ...ia, IA_TOPE_TOTAL_USD: "15" }).IA_TOPE_TOTAL_USD).toBe(15);
    expect(EnvSchema.safeParse({ IA_TOPE_TOTAL_USD: "41" }).success).toBe(false);
    expect(EnvSchema.safeParse({ IA_TOPE_TOTAL_USD: "0" }).success).toBe(false);
  });

  it("la dirección de pruebas solo con OTEA_E2E=1", () => {
    expect(EnvSchema.safeParse({ BORRADORES_URL_API_PRUEBA: "http://127.0.0.1:3299" }).success).toBe(false);
    expect(EnvSchema.safeParse({ BORRADORES_URL_API_PRUEBA: "http://127.0.0.1:3299", OTEA_E2E: "1" }).success).toBe(true);
  });
});

describe("EnvSchema · aportes por Mercado Pago (docs/despliegue.md §15)", () => {
  // Direcciones de prueba de dominios permitidos: el link real de la dueña todavía no existe.
  const PRUEBA = "https://link.mercadopago.cl/prueba-otea";

  it("apagados por omisión: sin DONACIONES_URL no hay apartado", () => {
    const e = EnvSchema.parse({});
    expect(e.DONACIONES_URL).toBeUndefined();
    expect(donacionesActivas(e)).toBe(false);
    expect(enlaceDonaciones(e)).toBeUndefined();
  });

  it("con un link de pago de un dominio permitido, el apartado existe y entrega el enlace normalizado", () => {
    for (const valido of [PRUEBA, "https://mpago.la/2AbC9xZ"]) {
      const e = EnvSchema.parse({ DONACIONES_URL: valido });
      expect(donacionesActivas(e), valido).toBe(true);
      expect(enlaceDonaciones(e)).toBe(valido);
    }
    // También en producción: no depende de OTEA_E2E.
    const r = EnvSchema.safeParse({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://oteaustral.com", DONACIONES_URL: PRUEBA });
    expect(r.success).toBe(true);
  });

  it("uno inválido hace fallar el arranque (http, dominio parecido, subdominio engañoso, parámetros)", () => {
    for (const malo of [
      "http://link.mercadopago.cl/prueba-otea",
      "https://mpago.co/2AbC9xZ",
      "https://link.mercadopago.cl.example.org/prueba-otea",
      "https://mpago.la/2AbC9xZ?redirect=https://example.org",
      "https://link.mercadopago.cl/",
      "javascript:alert(1)",
    ]) {
      const r = EnvSchema.safeParse({ DONACIONES_URL: malo });
      expect(r.success, malo).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0])).toContain("DONACIONES_URL");
    }
  });

  it("las funciones de ayuda no confían en un objeto armado a mano: vuelven a validar", () => {
    expect(donacionesActivas({ DONACIONES_URL: "https://mpago.co/2AbC9xZ" })).toBe(false);
    expect(enlaceDonaciones({ DONACIONES_URL: "" })).toBeUndefined();
  });
});

describe("EnvSchema · resumen diario y cupo de Resend", () => {
  const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb?sslmode=verify-full";
  const tareas = { TAREAS_MODO: "activo", TAREAS_SECRETO: "t".repeat(43), INGESTA_CONTACTO: "mailto:ingesta@example.org", DATABASE_URL: DB };
  const completo = { ...tareas, RESUMEN_MODO: "activo", RESEND_API_KEY: "re_1234567890ab", CUENTAS_SECRETO: "c".repeat(43) };

  it("nace apagado, con 30 resúmenes al día, y la baja solo existe con base", () => {
    const e = EnvSchema.parse({});
    expect(e.RESUMEN_MODO).toBe("apagado");
    expect(e.RESUMEN_ENVIOS_DIARIOS).toBe(30);
    expect(resumenActivo(e)).toBe(false);
    expect(bajaResumenDisponible(e)).toBe(false);
    expect(bajaResumenDisponible(EnvSchema.parse({ DATABASE_URL: DB }))).toBe(true);
    // Con las tareas activas pero sin pedirlo, tampoco.
    expect(resumenActivo(EnvSchema.parse(tareas))).toBe(false);
  });

  it("activo solo en el servicio de tareas y con correo y el secreto de las cuentas", () => {
    expect(EnvSchema.safeParse(completo).success).toBe(true);
    expect(resumenActivo(EnvSchema.parse(completo))).toBe(true);
    const { TAREAS_MODO: _modo, ...sinTareas } = completo;
    void _modo;
    expect(EnvSchema.safeParse(sinTareas).error?.issues.map((i) => i.path[0])).toContain("RESUMEN_MODO");
    for (const falta of ["RESEND_API_KEY", "CUENTAS_SECRETO"] as const) {
      const { [falta]: _omitida, ...incompleto } = completo;
      void _omitida;
      const r = EnvSchema.safeParse(incompleto);
      expect(r.success, falta).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), falta).toContain(falta);
    }
    for (const malo of ["si", "on", "activa", "1"]) expect(EnvSchema.safeParse({ ...completo, RESUMEN_MODO: malo }).success, malo).toBe(false);
  });

  it("los tres cupos de Resend suman 100 o menos (por omisión 50 + 20 + 30); si no, no arranca", () => {
    const e = EnvSchema.parse({});
    expect(e.WAITLIST_ENVIOS_DIARIOS + e.CUENTAS_ENVIOS_DIARIOS + e.RESUMEN_ENVIOS_DIARIOS).toBe(100);
    for (const exceso of [{ WAITLIST_ENVIOS_DIARIOS: "80" }, { CUENTAS_ENVIOS_DIARIOS: "21" }, { RESUMEN_ENVIOS_DIARIOS: "31" }]) {
      const r = EnvSchema.safeParse(exceso);
      expect(r.success, JSON.stringify(exceso)).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0])).toContain("RESUMEN_ENVIOS_DIARIOS");
    }
    expect(EnvSchema.safeParse({ WAITLIST_ENVIOS_DIARIOS: "70", CUENTAS_ENVIOS_DIARIOS: "20", RESUMEN_ENVIOS_DIARIOS: "10" }).success).toBe(true);
    for (const malo of ["0", "101", "2.5", "x"]) expect(EnvSchema.safeParse({ RESUMEN_ENVIOS_DIARIOS: malo }).success, malo).toBe(false);
    // Solo las pruebas e2e, con el correo yendo al servidor que imita a Resend, suben los topes sin límite.
    expect(EnvSchema.safeParse({ CUENTAS_ENVIOS_DIARIOS: "5000", RESEND_URL_API_PRUEBA: "http://127.0.0.1:3298/emails", OTEA_E2E: "1" }).success).toBe(true);
  });
});
