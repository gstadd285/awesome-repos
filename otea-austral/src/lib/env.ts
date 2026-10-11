import "server-only";
import { z } from "zod";
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

/** Iteraciones mínimas de PBKDF2-SHA256 (recomendación OWASP 2023). */
export const ITERACIONES_MINIMAS = 600_000;

const contactoSeguridad = z
  .string()
  .refine(
    (v) => /^mailto:[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i.test(v) || parseHttpsUrl(v) !== null,
    "Debe ser mailto:correo o una URL https",
  );

const urlPostgres = z.string().regex(/^postgres(ql)?:\/\/\S+$/, "Debe ser una URL postgres:// o postgresql://");

const remitente = z
  .string()
  .regex(
    /^[^<>\r\n@]{1,60} <[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}>$/i,
    "Usa el formato «Nombre <correo@dominio>»",
  );

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
    const admin = [e.ADMIN_CLAVE_HASH, e.ADMIN_TOTP_SECRETO, e.ADMIN_SESION_SECRETO].filter(Boolean).length;
    if (admin > 0 && admin < 3) {
      problema("ADMIN_CLAVE_HASH", "El panel necesita ADMIN_CLAVE_HASH, ADMIN_TOTP_SECRETO y ADMIN_SESION_SECRETO juntas.");
    }
    if (admin === 3 && !e.DATABASE_URL) problema("DATABASE_URL", "El panel necesita DATABASE_URL.");
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
  ADMIN_CLAVE_HASH: leer("ADMIN_CLAVE_HASH"),
  ADMIN_TOTP_SECRETO: leer("ADMIN_TOTP_SECRETO"),
  ADMIN_SESION_SECRETO: leer("ADMIN_SESION_SECRETO"),
  ADMIN_ALIAS: leer("ADMIN_ALIAS"),
  IP_PROXIES_CONFIABLES: leer("IP_PROXIES_CONFIABLES"),
  HTTPS_FORZADO: leer("HTTPS_FORZADO"),
});

/** El panel interno existe solo si está configurado por completo; si no, responde 404. */
export function panelActivo(e: Env = env): boolean {
  return Boolean(e.ADMIN_CLAVE_HASH && e.ADMIN_TOTP_SECRETO && e.ADMIN_SESION_SECRETO && e.DATABASE_URL);
}
