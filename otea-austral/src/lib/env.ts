import "server-only";
import { z } from "zod";
import { MODELOS_BORRADOR } from "@/lib/borradores/esquema";
import { Actor } from "@/lib/domain/schemas";
import { parseHttpsUrl, httpsUrl } from "@/lib/domain/url";

/**
 * Configuración del servidor, validada al arrancar. Los secretos llegan como
 * variables de entorno (Secret Manager en producción) y nunca se escriben en
 * el repositorio ni en los registros. Este módulo solo se usa en el
 * servidor: Next.js no copia al navegador variables sin `NEXT_PUBLIC_`.
 */

/**
 * Canal privado para reportar vulnerabilidades: `mailto:` o una URL https.
 * Por defecto, el formulario privado de GitHub del repositorio.
 */
export const CONTACTO_SEGURIDAD_POR_DEFECTO =
  "https://github.com/gstadd285/awesome-repos/security/advisories/new";

export const REMITENTE_POR_DEFECTO = "Otea Austral <alertas@oteaustral.com>";

/**
 * Modelos con los que se probó el asistente (ver `docs/asistente-ia.md`). Lista cerrada a propósito: un identificador
 * mal escrito, o un modelo anterior que rechaza los parámetros que se le envían, fallaría en cada pregunta.
 */
export const MODELOS_ASISTENTE = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;

/** Techo del gasto en borradores que autorizó la dueña: US$ 5 al mes. El esquema no admite un tope mayor. */
export const TOPE_MENSUAL_BORRADORES_MAXIMO_USD = 5;

/** Iteraciones mínimas de PBKDF2-SHA256 (recomendación OWASP 2023). */
export const ITERACIONES_MINIMAS = 600_000;

const contactoSeguridad = z
  .string()
  .refine(
    (v) => /^mailto:[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i.test(v) || parseHttpsUrl(v) !== null,
    "Debe ser mailto:correo o una URL https",
  );

/** Precio en dólares por millón de tokens, tal como lo publica Anthropic. */
const precioPorMillon = z.coerce.number().positive().max(100);

const urlPostgres = z.string().regex(/^postgres(ql)?:\/\/\S+$/, "Debe ser una URL postgres:// o postgresql://");

const remitente = z
  .string()
  .regex(
    /^[^<>\r\n@]{1,60} <[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}>$/i,
    "Usa el formato «Nombre <correo@dominio>»",
  );

/**
 * Contacto que la ingesta declara en su User-Agent (la SEC exige organización y contacto): un `mailto:` de **rol**
 * (p. ej. ingesta@…), nunca personal. Sin espacios ni paréntesis: viaja dentro de una cabecera.
 */
const contactoIngesta = z
  .string()
  .regex(/^mailto:[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i, "Debe ser mailto:correo-de-rol@dominio");

const secreto256 = (mensaje: string) => z.string().regex(/^[A-Za-z0-9_-]{43,}$/, mensaje);

/** `pbkdf2-sha256$iteraciones$sal$hash` (lo genera `npm run admin:credenciales`). */
const hashClave = z
  .string()
  .regex(/^pbkdf2-sha256\$\d{6,7}\$[A-Za-z0-9_-]{22,}\$[A-Za-z0-9_-]{43}$/, "Formato de hash inválido")
  .refine((v) => Number(v.split("$")[1]) >= ITERACIONES_MINIMAS, "Muy pocas iteraciones");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** URL base pública del sitio. En producción debe ser https. */
    NEXT_PUBLIC_SITE_URL: z
      .union([httpsUrl, z.literal("http://localhost:3000")])
      .default("http://localhost:3000"),
    SECURITY_CONTACT: contactoSeguridad.default(CONTACTO_SEGURIDAD_POR_DEFECTO),
    /**
     * `cerrada` (por defecto): no guarda correos. `memoria`: solo desarrollo y
     * pruebas. `abierta`: Postgres y correo de confirmación real.
     */
    WAITLIST_MODE: z.enum(["cerrada", "memoria", "abierta"]).default("cerrada"),
    /** Permite `memoria` y bases sin TLS en un build de producción, solo para pruebas e2e. */
    OTEA_E2E: z.enum(["0", "1"]).default("0"),
    /** Conexión de la aplicación (usuario miembro de `otea_app`, nunca el dueño). */
    DATABASE_URL: urlPostgres.optional(),
    RESEND_API_KEY: z.string().regex(/^re_[A-Za-z0-9_-]{10,200}$/, "Clave de Resend inválida").optional(),
    EMAIL_REMITENTE: remitente.default(REMITENTE_POR_DEFECTO),
    /** Tope diario de correos de confirmación (Resend gratuito permite 100 al día). */
    WAITLIST_ENVIOS_DIARIOS: z.coerce.number().int().min(1).max(5000).default(80),
    /**
     * Secreto maestro de la lista de espera: 256 bits en base64url (`npm run lista:secreto`). De él se derivan,
     * con HKDF, la clave de la marca de tiempo del formulario y las del cifrado de correos y su índice. Debe
     * ser el mismo en todas las instancias y vivir en Secret Manager.
     */
    WAITLIST_SECRETO: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43,}$/, "Secreto de la lista demasiado corto (256 bits en base64url)")
      .optional(),
    /**
     * Cuentas de personas usuarias. `cerradas` (por omisión): las páginas existen pero no guardan nada. `memoria`: solo
     * desarrollo y pruebas (se pierde al reiniciar; los enlaces salen en el registro del servidor, no por correo).
     * `abiertas`: Postgres y correo real; exige DATABASE_URL, RESEND_API_KEY y CUENTAS_SECRETO. `invitacion`: como
     * `abiertas` (exige lo mismo), pero una cuenta solo se crea con un código de invitación de un solo uso emitido en
     * /admin/invitaciones (acceso anticipado privado, `docs/alertas-reales.md` §6).
     */
    CUENTAS_MODO: z.enum(["cerradas", "memoria", "abiertas", "invitacion"]).default("cerradas"),
    /**
     * Secreto maestro de las cuentas: 256 bits en base64url (`npm run cuentas:secreto`). De él se derivan, con HKDF, las
     * claves que cifran el correo y el secreto de la verificación en dos pasos, el índice ciego del correo y el token
     * anti-CSRF. Debe ser el mismo en todas las instancias, vivir en Secret Manager y ser distinto de los otros secretos.
     */
    CUENTAS_SECRETO: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43,}$/, "Secreto de las cuentas demasiado corto (256 bits en base64url)")
      .optional(),
    /** Tope diario de correos de cuentas (confirmación, restablecimiento y avisos). Con la lista de espera, que sume 100 o menos. */
    CUENTAS_ENVIOS_DIARIOS: z.coerce.number().int().min(1).max(5000).default(20),
    /** Solo pruebas e2e: dirección de un servidor que imita la API de Resend (el correo de las cuentas no sale a internet). */
    RESEND_URL_API_PRUEBA: z.string().url().optional(),
    ADMIN_CLAVE_HASH: hashClave.optional(),
    /** Secreto TOTP en base32: 160 bits. */
    ADMIN_TOTP_SECRETO: z.string().regex(/^[A-Z2-7]{32}$/, "Secreto TOTP inválido (32 caracteres base32)").optional(),
    /** Firma de la cookie de sesión: al menos 256 bits en base64url. */
    ADMIN_SESION_SECRETO: z.string().regex(/^[A-Za-z0-9_-]{43,}$/, "Secreto de sesión demasiado corto").optional(),
    /** Alias del panel en la auditoría (nunca un correo). */
    ADMIN_ALIAS: Actor.default("admin"),
    /**
     * Proxies de confianza que agregan su entrada a `X-Forwarded-For`
     * (Cloud Run: 1). La IP del cliente es la que dejó el último de ellos;
     * las anteriores las puede inventar cualquiera.
     */
    IP_PROXIES_CONFIABLES: z.coerce.number().int().min(0).max(3).default(1),
    /**
     * Redirige a https (308) las solicitudes que el proxy marca como http (`X-Forwarded-Proto`; Cloud Run
     * siempre lo envía). Está activo por omisión en producción. Es el interruptor de emergencia: con `0`, si
     * una plataforma no enviara esa cabecera y el sitio entrara en un bucle de redirecciones. También sirve
     * para probar la imagen en local por http.
     */
    HTTPS_FORZADO: z.enum(["0", "1"]).default("1"),
    /**
     * Asistente de preguntas. `base` (por omisión): responde con las preguntas frecuentes del sitio, sin IA, sin
     * clave y sin costo. `ia`: un modelo de Anthropic redacta la respuesta con ese mismo contenido. Es un servicio de
     * pago (CLAUDE.md, regla 1): se activa solo con la clave, el modelo, los precios y el tope de gasto diario que
     * decida la persona responsable, sin valores por omisión (ver `docs/asistente-ia.md`).
     */
    ASISTENTE_MODO: z.enum(["base", "ia"]).default("base"),
    ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{16,}$/, "Clave de Anthropic inválida").optional(),
    ASISTENTE_MODELO: z.enum(MODELOS_ASISTENTE).optional(),
    ASISTENTE_PRECIO_ENTRADA: precioPorMillon.optional(),
    ASISTENTE_PRECIO_SALIDA: precioPorMillon.optional(),
    /** Gasto máximo de IA por día (hora de Chile), en dólares. */
    ASISTENTE_TOPE_DIARIO_USD: z.coerce.number().positive().max(50).optional(),
    ASISTENTE_LLAMADAS_DIARIAS: z.coerce.number().int().min(1).max(10_000).default(300),
    /** Respuestas con IA por persona y día; pasado el cupo recibe la respuesta de la base. */
    ASISTENTE_IA_POR_PERSONA_DIA: z.coerce.number().int().min(1).max(500).default(30),
    /** Solo pruebas e2e: dirección de un servidor que imita la API de Anthropic. */
    ASISTENTE_URL_API_PRUEBA: z.string().url().optional(),
    /**
     * Tareas programadas (`POST /api/tareas/*`, `docs/alertas-reales.md` §2.1). `inactivo` (por omisión): las rutas
     * responden 404 y nada sale a internet. `activo`: solo en el servicio privado `otea-tareas`, que llama Cloud
     * Scheduler con OIDC y el encabezado `X-Otea-Tarea`; exige DATABASE_URL, TAREAS_SECRETO e INGESTA_CONTACTO.
     */
    TAREAS_MODO: z.enum(["inactivo", "activo"]).default("inactivo"),
    /** Secreto del encabezado `X-Otea-Tarea`: 256 bits en base64url, distinto de los demás secretos. */
    TAREAS_SECRETO: secreto256("Secreto de las tareas demasiado corto (256 bits en base64url)").optional(),
    INGESTA_CONTACTO: contactoIngesta.optional(),
    /** Solo pruebas e2e: reescribe el origen de cada solicitud de la ingesta hacia un servidor de fuentes falsas. */
    INGESTA_URL_PRUEBA: z.string().url().optional(),
    /**
     * Borradores con IA (`docs/alertas-reales.md` §4). `apagado` (por omisión): ninguna llamada a un modelo; la cola manual
     * de `/admin/eventos` sigue igual. `ia`: solo en `otea-tareas` (exige TAREAS_MODO=activo), Claude redacta un borrador por
     * evento al final de cada corrida. Es de pago (CLAUDE.md, regla 1): clave propia, modelo, precios y tope mensual sin
     * valores por omisión; el tope no puede pasar de US$ 5 al mes.
     */
    BORRADORES_MODO: z.enum(["apagado", "ia"]).default("apagado"),
    /** Clave del espacio de trabajo de Anthropic para borradores (con su propio límite de gasto), distinta de la del asistente. */
    BORRADORES_ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{16,}$/, "Clave de Anthropic inválida").optional(),
    BORRADORES_MODELO: z.enum(MODELOS_BORRADOR).optional(),
    BORRADORES_PRECIO_ENTRADA: precioPorMillon.optional(),
    BORRADORES_PRECIO_SALIDA: precioPorMillon.optional(),
    /** Gasto máximo de los borradores por mes (hora de Chile), en dólares: como mucho el techo autorizado. */
    BORRADORES_TOPE_MENSUAL_USD: z.coerce.number().positive().max(TOPE_MENSUAL_BORRADORES_MAXIMO_USD).optional(),
    BORRADORES_LLAMADAS_MES: z.coerce.number().int().min(1).max(1400).default(600),
    BORRADORES_POR_CORRIDA: z.coerce.number().int().min(1).max(20).default(5),
    /**
     * Tope acumulado de toda la IA (asistente + borradores), en dólares, contado en la base desde el primer día. Opcional:
     * decisión pendiente de la dueña (`docs/alertas-reales.md` §11). Si se fija, va en los dos servicios.
     */
    IA_TOPE_TOTAL_USD: z.coerce.number().positive().max(40).optional(),
    /** Solo pruebas e2e: dirección de un servidor que imita la API de Anthropic para los borradores. */
    BORRADORES_URL_API_PRUEBA: z.string().url().optional(),
  })
  .superRefine((e, ctx) => {
    // `next build` también corre con NODE_ENV=production, pero la configuración del servidor llega al
    // ejecutar (la imagen se construye una vez; la CI define una base local sin TLS solo para sus
    // pruebas): las reglas de producción no se exigen mientras se construye.
    const construyendo = process.env.NEXT_PHASE === "phase-production-build";
    const produccion = e.NODE_ENV === "production" && e.OTEA_E2E !== "1" && !construyendo;
    const problema = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (produccion && !e.NEXT_PUBLIC_SITE_URL.startsWith("https://")) {
      problema(
        "NEXT_PUBLIC_SITE_URL",
        "En producción falta NEXT_PUBLIC_SITE_URL con la URL https del sitio: sin ella el sitio publicaría enlaces a localhost.",
      );
    }
    if (produccion && e.WAITLIST_MODE === "memoria") {
      problema("WAITLIST_MODE", "WAITLIST_MODE=memoria no se permite en producción: los correos se perderían.");
    }
    if (e.WAITLIST_MODE === "abierta") {
      if (!e.DATABASE_URL) problema("DATABASE_URL", "La lista abierta necesita DATABASE_URL.");
      if (!e.RESEND_API_KEY) problema("RESEND_API_KEY", "La lista abierta necesita RESEND_API_KEY.");
      if (!e.WAITLIST_SECRETO) problema("WAITLIST_SECRETO", "La lista abierta necesita WAITLIST_SECRETO.");
    }
    if (produccion && e.DATABASE_URL && !/[?&]sslmode=verify-full(&|$)/.test(e.DATABASE_URL)) {
      problema("DATABASE_URL", "En producción la conexión debe verificar el certificado: agrega sslmode=verify-full.");
    }
    if (produccion && e.CUENTAS_MODO === "memoria") {
      problema("CUENTAS_MODO", "CUENTAS_MODO=memoria no se permite en producción: las cuentas se perderían al reiniciar.");
    }
    if (e.CUENTAS_MODO === "abiertas" || e.CUENTAS_MODO === "invitacion") {
      const cuales = e.CUENTAS_MODO === "abiertas" ? "Las cuentas abiertas" : "Las cuentas por invitación";
      if (!e.DATABASE_URL) problema("DATABASE_URL", `${cuales} necesitan DATABASE_URL.`);
      if (!e.RESEND_API_KEY) problema("RESEND_API_KEY", `${cuales} necesitan RESEND_API_KEY (confirmación y restablecimiento por correo).`);
      if (!e.CUENTAS_SECRETO) problema("CUENTAS_SECRETO", `${cuales} necesitan CUENTAS_SECRETO (\`npm run cuentas:secreto\`).`);
    }
    if (e.CUENTAS_SECRETO && (e.CUENTAS_SECRETO === e.WAITLIST_SECRETO || e.CUENTAS_SECRETO === e.ADMIN_SESION_SECRETO)) {
      problema("CUENTAS_SECRETO", "Debe ser distinto de WAITLIST_SECRETO y de ADMIN_SESION_SECRETO: cada secreto protege una sola cosa.");
    }
    if (e.RESEND_URL_API_PRUEBA && e.OTEA_E2E !== "1") {
      problema(
        "RESEND_URL_API_PRUEBA",
        "Solo se admite con OTEA_E2E=1: en cualquier otro caso la clave de Resend y los correos podrían viajar a un servidor ajeno.",
      );
    }
    const admin = [e.ADMIN_CLAVE_HASH, e.ADMIN_TOTP_SECRETO, e.ADMIN_SESION_SECRETO].filter(Boolean).length;
    if (admin > 0 && admin < 3) {
      problema("ADMIN_CLAVE_HASH", "El panel necesita ADMIN_CLAVE_HASH, ADMIN_TOTP_SECRETO y ADMIN_SESION_SECRETO juntas.");
    }
    if (admin === 3 && !e.DATABASE_URL) problema("DATABASE_URL", "El panel necesita DATABASE_URL.");

    if (e.ASISTENTE_MODO === "ia") {
      if (!e.ANTHROPIC_API_KEY) problema("ANTHROPIC_API_KEY", "El modo ia necesita ANTHROPIC_API_KEY (en Secret Manager).");
      if (!e.ASISTENTE_MODELO) {
        problema("ASISTENTE_MODELO", `El modo ia necesita ASISTENTE_MODELO: ${MODELOS_ASISTENTE.join(", ")}.`);
      }
      for (const precio of ["ASISTENTE_PRECIO_ENTRADA", "ASISTENTE_PRECIO_SALIDA"] as const) {
        if (e[precio] === undefined) {
          problema(precio, `El modo ia necesita ${precio}: dólares por millón de tokens, de la página de precios de Anthropic.`);
        }
      }
      if (e.ASISTENTE_TOPE_DIARIO_USD === undefined) {
        problema("ASISTENTE_TOPE_DIARIO_USD", "El modo ia necesita ASISTENTE_TOPE_DIARIO_USD: el gasto máximo por día, en dólares.");
      }
      if (produccion && !e.DATABASE_URL) {
        problema(
          "DATABASE_URL",
          "El modo ia necesita DATABASE_URL en producción: el tope diario se cuenta en la base, que comparten todas las instancias.",
        );
      }
    }
    if (e.TAREAS_MODO === "activo") {
      if (!e.DATABASE_URL) problema("DATABASE_URL", "TAREAS_MODO=activo necesita DATABASE_URL (turno, estado de los feeds y corridas).");
      if (!e.TAREAS_SECRETO) problema("TAREAS_SECRETO", "TAREAS_MODO=activo necesita TAREAS_SECRETO (encabezado X-Otea-Tarea).");
      if (!e.INGESTA_CONTACTO) {
        problema("INGESTA_CONTACTO", "TAREAS_MODO=activo necesita INGESTA_CONTACTO: un mailto: de rol para el User-Agent.");
      }
    }
    if (
      e.TAREAS_SECRETO &&
      [e.WAITLIST_SECRETO, e.CUENTAS_SECRETO, e.ADMIN_SESION_SECRETO].includes(e.TAREAS_SECRETO)
    ) {
      problema("TAREAS_SECRETO", "Debe ser distinto de los demás secretos: cada secreto protege una sola cosa.");
    }
    if (e.INGESTA_URL_PRUEBA && e.OTEA_E2E !== "1") {
      problema(
        "INGESTA_URL_PRUEBA",
        "Solo se admite con OTEA_E2E=1: en cualquier otro caso la ingesta saldría hacia un servidor fuera del registro de fuentes.",
      );
    }
    if (e.BORRADORES_MODO === "ia") {
      if (e.TAREAS_MODO !== "activo") {
        problema(
          "BORRADORES_MODO",
          "BORRADORES_MODO=ia solo en el servicio de tareas (TAREAS_MODO=activo): el sitio público nunca redacta ni tiene la clave.",
        );
      }
      if (!e.BORRADORES_ANTHROPIC_API_KEY) {
        problema("BORRADORES_ANTHROPIC_API_KEY", "BORRADORES_MODO=ia necesita BORRADORES_ANTHROPIC_API_KEY (en Secret Manager).");
      }
      if (!e.BORRADORES_MODELO) {
        problema("BORRADORES_MODELO", `BORRADORES_MODO=ia necesita BORRADORES_MODELO: ${MODELOS_BORRADOR.join(", ")}.`);
      }
      for (const precio of ["BORRADORES_PRECIO_ENTRADA", "BORRADORES_PRECIO_SALIDA"] as const) {
        if (e[precio] === undefined) {
          problema(precio, `BORRADORES_MODO=ia necesita ${precio}: dólares por millón de tokens, de la página de precios de Anthropic.`);
        }
      }
      if (e.BORRADORES_TOPE_MENSUAL_USD === undefined) {
        problema(
          "BORRADORES_TOPE_MENSUAL_USD",
          `BORRADORES_MODO=ia necesita BORRADORES_TOPE_MENSUAL_USD: el gasto máximo por mes, en dólares (como mucho ${TOPE_MENSUAL_BORRADORES_MAXIMO_USD}).`,
        );
      }
    }
    if (e.BORRADORES_ANTHROPIC_API_KEY && e.BORRADORES_ANTHROPIC_API_KEY === e.ANTHROPIC_API_KEY) {
      problema(
        "BORRADORES_ANTHROPIC_API_KEY",
        "Debe ser distinta de ANTHROPIC_API_KEY: los borradores van en su propio espacio de trabajo, con su propio límite de gasto.",
      );
    }
    if (e.BORRADORES_URL_API_PRUEBA && e.OTEA_E2E !== "1") {
      problema(
        "BORRADORES_URL_API_PRUEBA",
        "Solo se admite con OTEA_E2E=1: en cualquier otro caso la clave de los borradores podría viajar a un servidor ajeno.",
      );
    }
    if (e.ASISTENTE_URL_API_PRUEBA && e.OTEA_E2E !== "1") {
      problema(
        "ASISTENTE_URL_API_PRUEBA",
        "Solo se admite con OTEA_E2E=1: en cualquier otro caso la clave de Anthropic podría viajar a un servidor ajeno.",
      );
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const leer = (nombre: string) => process.env[nombre] || undefined;

export const env: Env = EnvSchema.parse({
  NODE_ENV: leer("NODE_ENV"),
  NEXT_PUBLIC_SITE_URL: leer("NEXT_PUBLIC_SITE_URL"),
  SECURITY_CONTACT: leer("SECURITY_CONTACT"),
  WAITLIST_MODE: leer("WAITLIST_MODE"),
  OTEA_E2E: leer("OTEA_E2E"),
  DATABASE_URL: leer("DATABASE_URL"),
  RESEND_API_KEY: leer("RESEND_API_KEY"),
  EMAIL_REMITENTE: leer("EMAIL_REMITENTE"),
  WAITLIST_ENVIOS_DIARIOS: leer("WAITLIST_ENVIOS_DIARIOS"),
  WAITLIST_SECRETO: leer("WAITLIST_SECRETO"),
  CUENTAS_MODO: leer("CUENTAS_MODO"),
  CUENTAS_SECRETO: leer("CUENTAS_SECRETO"),
  CUENTAS_ENVIOS_DIARIOS: leer("CUENTAS_ENVIOS_DIARIOS"),
  RESEND_URL_API_PRUEBA: leer("RESEND_URL_API_PRUEBA"),
  ADMIN_CLAVE_HASH: leer("ADMIN_CLAVE_HASH"),
  ADMIN_TOTP_SECRETO: leer("ADMIN_TOTP_SECRETO"),
  ADMIN_SESION_SECRETO: leer("ADMIN_SESION_SECRETO"),
  ADMIN_ALIAS: leer("ADMIN_ALIAS"),
  IP_PROXIES_CONFIABLES: leer("IP_PROXIES_CONFIABLES"),
  HTTPS_FORZADO: leer("HTTPS_FORZADO"),
  ASISTENTE_MODO: leer("ASISTENTE_MODO"),
  ANTHROPIC_API_KEY: leer("ANTHROPIC_API_KEY"),
  ASISTENTE_MODELO: leer("ASISTENTE_MODELO"),
  ASISTENTE_PRECIO_ENTRADA: leer("ASISTENTE_PRECIO_ENTRADA"),
  ASISTENTE_PRECIO_SALIDA: leer("ASISTENTE_PRECIO_SALIDA"),
  ASISTENTE_TOPE_DIARIO_USD: leer("ASISTENTE_TOPE_DIARIO_USD"),
  ASISTENTE_LLAMADAS_DIARIAS: leer("ASISTENTE_LLAMADAS_DIARIAS"),
  ASISTENTE_IA_POR_PERSONA_DIA: leer("ASISTENTE_IA_POR_PERSONA_DIA"),
  ASISTENTE_URL_API_PRUEBA: leer("ASISTENTE_URL_API_PRUEBA"),
  TAREAS_MODO: leer("TAREAS_MODO"),
  TAREAS_SECRETO: leer("TAREAS_SECRETO"),
  INGESTA_CONTACTO: leer("INGESTA_CONTACTO"),
  INGESTA_URL_PRUEBA: leer("INGESTA_URL_PRUEBA"),
  BORRADORES_MODO: leer("BORRADORES_MODO"),
  BORRADORES_ANTHROPIC_API_KEY: leer("BORRADORES_ANTHROPIC_API_KEY"),
  BORRADORES_MODELO: leer("BORRADORES_MODELO"),
  BORRADORES_PRECIO_ENTRADA: leer("BORRADORES_PRECIO_ENTRADA"),
  BORRADORES_PRECIO_SALIDA: leer("BORRADORES_PRECIO_SALIDA"),
  BORRADORES_TOPE_MENSUAL_USD: leer("BORRADORES_TOPE_MENSUAL_USD"),
  BORRADORES_LLAMADAS_MES: leer("BORRADORES_LLAMADAS_MES"),
  BORRADORES_POR_CORRIDA: leer("BORRADORES_POR_CORRIDA"),
  IA_TOPE_TOTAL_USD: leer("IA_TOPE_TOTAL_USD"),
  BORRADORES_URL_API_PRUEBA: leer("BORRADORES_URL_API_PRUEBA"),
});

/** El panel interno existe solo si está configurado por completo; si no, responde 404. */
export function panelActivo(e: Env = env): boolean {
  return Boolean(e.ADMIN_CLAVE_HASH && e.ADMIN_TOTP_SECRETO && e.ADMIN_SESION_SECRETO && e.DATABASE_URL);
}

/** Las tareas programadas existen solo en el servicio privado y configurado por completo; si no, sus rutas responden 404. */
export function tareasActivas(
  e: Pick<Env, "TAREAS_MODO" | "TAREAS_SECRETO" | "INGESTA_CONTACTO" | "DATABASE_URL"> = env,
): boolean {
  return e.TAREAS_MODO === "activo" && Boolean(e.TAREAS_SECRETO && e.INGESTA_CONTACTO && e.DATABASE_URL);
}

/**
 * Los borradores con IA existen solo en el servicio de tareas activo y configurado por completo (clave, modelo, precios y
 * tope). En cualquier otro caso no se llama a ningún modelo y la cola de `/admin/eventos` es la manual de siempre.
 */
export function borradoresActivos(e: Env = env): boolean {
  return (
    e.BORRADORES_MODO === "ia" &&
    tareasActivas(e) &&
    Boolean(e.BORRADORES_ANTHROPIC_API_KEY && e.BORRADORES_MODELO) &&
    e.BORRADORES_PRECIO_ENTRADA !== undefined &&
    e.BORRADORES_PRECIO_SALIDA !== undefined &&
    e.BORRADORES_TOPE_MENSUAL_USD !== undefined
  );
}

/** Las cuentas guardan datos solo si no están cerradas (también en modo `invitacion`: quien tiene cuenta entra). */
export function cuentasAbiertas(e: Env = env): boolean {
  return e.CUENTAS_MODO !== "cerradas";
}

/** Acceso anticipado privado: una cuenta nueva solo con un código de invitación. */
export function cuentasPorInvitacion(e: Env = env): boolean {
  return e.CUENTAS_MODO === "invitacion";
}
