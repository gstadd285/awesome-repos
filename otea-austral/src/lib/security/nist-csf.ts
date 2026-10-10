/**
 * Perfil de ciberseguridad de Otea Austral según el NIST Cybersecurity
 * Framework (CSF) 2.0. Es una autoevaluación: el NIST no certifica
 * organizaciones. Fuente única para la página /seguridad.
 *
 * Los identificadores (GV.OC-01, PR.DS-02…) son los del CSF 2.0; los nombres
 * y descripciones en español son de Otea. Cada control "implementado" o
 * "parcial" cita su evidencia en el repositorio, y una prueba verifica que
 * esos archivos existan.
 */
import { z } from "zod";

export const CodigoFuncion = z.enum(["GV", "ID", "PR", "DE", "RS", "RC"]);
export type CodigoFuncion = z.infer<typeof CodigoFuncion>;

export const FUNCIONES: { codigo: CodigoFuncion; nombre: string; descripcion: string }[] = [
  {
    codigo: "GV",
    nombre: "Gobernar",
    descripcion: "Definir y supervisar la estrategia, las expectativas y la política de seguridad.",
  },
  {
    codigo: "ID",
    nombre: "Identificar",
    descripcion: "Entender qué activos, datos y riesgos tenemos hoy.",
  },
  {
    codigo: "PR",
    nombre: "Proteger",
    descripcion: "Usar salvaguardas para gestionar esos riesgos.",
  },
  {
    codigo: "DE",
    nombre: "Detectar",
    descripcion: "Encontrar y analizar posibles ataques y compromisos.",
  },
  {
    codigo: "RS",
    nombre: "Responder",
    descripcion: "Actuar ante un incidente detectado.",
  },
  {
    codigo: "RC",
    nombre: "Recuperar",
    descripcion: "Restaurar los activos y la operación afectados por un incidente.",
  },
];

/** Las 22 categorías del CSF 2.0. */
export const CATEGORIAS: Record<string, string> = {
  "GV.OC": "Contexto organizacional",
  "GV.RM": "Estrategia de gestión de riesgos",
  "GV.RR": "Roles, responsabilidades y autoridades",
  "GV.PO": "Política",
  "GV.OV": "Supervisión",
  "GV.SC": "Gestión de riesgos de la cadena de suministro",
  "ID.AM": "Gestión de activos",
  "ID.RA": "Evaluación de riesgos",
  "ID.IM": "Mejora",
  "PR.AA": "Gestión de identidades, autenticación y control de acceso",
  "PR.AT": "Concienciación y capacitación",
  "PR.DS": "Seguridad de los datos",
  "PR.PS": "Seguridad de plataformas",
  "PR.IR": "Resiliencia de la infraestructura tecnológica",
  "DE.CM": "Monitoreo continuo",
  "DE.AE": "Análisis de eventos adversos",
  "RS.MA": "Gestión de incidentes",
  "RS.AN": "Análisis de incidentes",
  "RS.CO": "Comunicación y reporte de la respuesta a incidentes",
  "RS.MI": "Mitigación de incidentes",
  "RC.RP": "Ejecución del plan de recuperación de incidentes",
  "RC.CO": "Comunicación de la recuperación de incidentes",
};

/** Niveles de implementación (Tiers) del CSF 2.0. */
export const NIVELES: Record<1 | 2 | 3 | 4, string> = {
  1: "Parcial",
  2: "Informado por el riesgo",
  3: "Repetible",
  4: "Adaptativo",
};

export const EstadoControl = z.enum(["implementado", "parcial", "objetivo"]);
export type EstadoControl = z.infer<typeof EstadoControl>;

const Subcategoria = z
  .string()
  .regex(/^(GV|ID|PR|DE|RS|RC)\.[A-Z]{2}-\d{2}$/, "Subcategoría con formato inválido")
  .refine((s) => s.slice(0, 5) in CATEGORIAS, "Categoría inexistente en el CSF 2.0");

export const ControlSchema = z
  .strictObject({
    id: z.string().regex(/^(GV|ID|PR|DE|RS|RC)-\d{2}$/),
    titulo: z.string().min(1).max(80),
    descripcion: z.string().min(1).max(280),
    estado: EstadoControl,
    subcategorias: z.array(Subcategoria).min(1),
    /** Rutas relativas a `otea-austral/`. */
    evidencia: z.array(z.string().min(1)),
    /** Para objetivos: en qué tercio del plan se aborda. */
    tercio: z.union([z.literal(2), z.literal(3)]).optional(),
  })
  .refine((c) => c.subcategorias.every((s) => s.startsWith(`${c.id.slice(0, 2)}.`)), {
    message: "Las subcategorías deben pertenecer a la función del control",
  })
  .refine((c) => c.estado === "objetivo" || c.evidencia.length > 0, {
    message: "Un control implementado o parcial necesita evidencia",
  });
export type Control = z.infer<typeof ControlSchema>;

export const PERFIL = {
  marco: "NIST Cybersecurity Framework (CSF) 2.0",
  alcance: "Sitio web, código y servicios de Otea Austral",
  revisado: "2026-10-10",
  proximaRevision: "2027-01-10",
  nivelActual: 1,
  nivelObjetivo: 2,
} as const;

const CI = "../.github/workflows/otea-austral.yml";
const PROGRAMA = "docs/seguridad/programa.md";
const INCIDENTES = "docs/seguridad/respuesta-incidentes.md";

export const CONTROLES: Control[] = [
  // ── Gobernar ────────────────────────────────────────────────────────────
  {
    id: "GV-01",
    titulo: "Misión, alcance y obligaciones documentados",
    descripcion:
      "La misión, el alcance y las restricciones del servicio están escritos y guían cada cambio. Las obligaciones legales están identificadas y pendientes de revisión profesional.",
    estado: "parcial",
    subcategorias: ["GV.OC-01", "GV.OC-03"],
    evidencia: ["CLAUDE.md", PROGRAMA],
  },
  {
    id: "GV-02",
    titulo: "Política de seguridad y apetito de riesgo",
    descripcion:
      "Una política breve fija los principios (minimizar datos, mínimo privilegio, defensa en profundidad, corrección pública) y cuánto riesgo aceptamos en cada caso.",
    estado: "implementado",
    subcategorias: ["GV.RM-02", "GV.PO-01"],
    evidencia: [PROGRAMA, "SECURITY.md"],
  },
  {
    id: "GV-03",
    titulo: "Responsables definidos",
    descripcion:
      "Una persona responde por la seguridad. Ningún cambio entra al código sin pasar los controles automáticos.",
    estado: "parcial",
    subcategorias: ["GV.RR-02"],
    evidencia: [PROGRAMA, CI],
  },
  {
    id: "GV-04",
    titulo: "Proveedores conocidos y priorizados",
    descripcion:
      "Cada servicio externo está listado con su criticidad. Solo planes gratuitos y con el acceso mínimo necesario.",
    estado: "implementado",
    subcategorias: ["GV.SC-04"],
    evidencia: [PROGRAMA],
  },
  {
    id: "GV-05",
    titulo: "Revisión trimestral del perfil",
    descripcion: "Este perfil se revisa cada tres meses y después de cada incidente.",
    estado: "objetivo",
    subcategorias: ["GV.OV-01", "GV.PO-02"],
    evidencia: [],
  },

  // ── Identificar ─────────────────────────────────────────────────────────
  {
    id: "ID-01",
    titulo: "Inventario de software (SBOM)",
    descripcion:
      "Cada verificación automática genera un inventario CycloneDX de las dependencias que se despliegan.",
    estado: "implementado",
    subcategorias: ["ID.AM-02"],
    evidencia: [CI],
  },
  {
    id: "ID-02",
    titulo: "Inventario de datos y conexiones",
    descripcion:
      "Sabemos qué datos tratamos (hoy, ningún dato personal) y el sitio solo se conecta con su propio origen.",
    estado: "implementado",
    subcategorias: ["ID.AM-03", "ID.AM-07"],
    evidencia: [PROGRAMA, "src/lib/security/csp.ts"],
  },
  {
    id: "ID-03",
    titulo: "Vulnerabilidades en dependencias",
    descripcion:
      "La verificación automática se detiene ante vulnerabilidades altas en lo que se despliega, y cada semana se proponen actualizaciones.",
    estado: "implementado",
    subcategorias: ["ID.RA-01"],
    evidencia: [CI, "../.github/dependabot.yml"],
  },
  {
    id: "ID-04",
    titulo: "Integridad del software que usamos",
    descripcion:
      "Instalación exacta desde el lockfile con hashes de integridad, verificación de las firmas del registro npm y acciones de CI fijadas por commit.",
    estado: "implementado",
    subcategorias: ["ID.RA-09"],
    evidencia: [CI, "package-lock.json"],
  },
  {
    id: "ID-05",
    titulo: "Registro de riesgos",
    descripcion:
      "Los riesgos principales están anotados con su probabilidad, impacto, tratamiento y estado.",
    estado: "implementado",
    subcategorias: ["ID.RA-03", "ID.RA-04", "ID.RA-06"],
    evidencia: [PROGRAMA],
  },
  {
    id: "ID-06",
    titulo: "Canal para reportar vulnerabilidades",
    descripcion:
      "Publicamos /.well-known/security.txt (RFC 9116) y una sección para reportar de forma privada.",
    estado: "parcial",
    subcategorias: ["ID.RA-08"],
    evidencia: ["src/app/.well-known/security.txt/route.ts", "SECURITY.md"],
  },
  {
    id: "ID-07",
    titulo: "Auditoría y ejercicios",
    descripcion:
      "Revisión completa según OWASP Top 10:2025 al terminar el panel interno, y un ejercicio anual del plan de incidentes.",
    estado: "objetivo",
    subcategorias: ["ID.IM-02"],
    evidencia: [],
    tercio: 3,
  },

  // ── Proteger ────────────────────────────────────────────────────────────
  {
    id: "PR-01",
    titulo: "Solo código autorizado en el navegador",
    descripcion:
      "Una política de seguridad de contenido (CSP) con un valor aleatorio por visita hace que el navegador rechace scripts que no emitimos.",
    estado: "implementado",
    subcategorias: ["PR.PS-05", "PR.PS-01"],
    evidencia: ["src/proxy.ts", "src/lib/security/csp.ts"],
  },
  {
    id: "PR-02",
    titulo: "Cifrado en tránsito",
    descripcion:
      "Solo HTTPS, con HSTS de dos años y actualización automática de recursos inseguros.",
    estado: "implementado",
    subcategorias: ["PR.DS-02"],
    evidencia: ["src/lib/security/headers.ts", "src/lib/security/csp.ts"],
  },
  {
    id: "PR-03",
    titulo: "Configuración segura como código",
    descripcion:
      "Cabeceras contra clickjacking, rastreo de tipos y filtración de referencias, versionadas y con pruebas.",
    estado: "implementado",
    subcategorias: ["PR.PS-01"],
    evidencia: ["src/lib/security/headers.ts", "src/lib/security/csp.test.ts"],
  },
  {
    id: "PR-04",
    titulo: "Integridad de las alertas",
    descripcion:
      "La confianza de cada alerta se calcula a partir de sus fuentes, la auditoría solo admite agregar filas y las correcciones son públicas.",
    estado: "implementado",
    subcategorias: ["PR.DS-01"],
    evidencia: ["src/lib/domain/rules.ts", "src/lib/domain/audit-log.ts"],
  },
  {
    id: "PR-05",
    titulo: "Desarrollo seguro",
    descripcion:
      "Toda entrada se valida con esquemas estrictos y cada cambio pasa lint, tipos, pruebas y build antes de integrarse (prácticas del NIST SP 800-218).",
    estado: "implementado",
    subcategorias: ["PR.PS-06"],
    evidencia: [CI, "src/lib/domain/schemas.ts"],
  },
  {
    id: "PR-06",
    titulo: "Software al día",
    descripcion: "Versiones exactas de cada dependencia y actualizaciones semanales asistidas.",
    estado: "implementado",
    subcategorias: ["PR.PS-02"],
    evidencia: ["package.json", ".npmrc", "../.github/dependabot.yml"],
  },
  {
    id: "PR-07",
    titulo: "Registros sin datos personales",
    descripcion:
      "Los eventos de seguridad se registran en JSON, sin correos, direcciones IP, tokens ni parámetros de URL.",
    estado: "implementado",
    subcategorias: ["PR.PS-04"],
    evidencia: ["src/lib/security/log.ts"],
  },
  {
    id: "PR-08",
    titulo: "Límite de solicitudes",
    descripcion:
      "Reportes de seguridad, acceso al panel y lista de espera limitan solicitudes por IP y en total, y la lista tiene un tope diario de correos en la base. Los límites por IP viven en cada instancia: son una primera barrera, no un tope global.",
    estado: "parcial",
    subcategorias: ["PR.IR-04"],
    evidencia: [
      "src/lib/security/rate-limit.ts",
      "src/app/admin/acciones.ts",
      "src/lib/waitlist/service.ts",
    ],
  },
  {
    id: "PR-09",
    titulo: "Verificación en dos pasos en todas las cuentas",
    descripcion:
      "GitHub, alojamiento, dominio y correo con verificación en dos pasos y códigos de respaldo guardados fuera de línea.",
    estado: "objetivo",
    subcategorias: ["PR.AA-03"],
    evidencia: [],
  },
  {
    id: "PR-10",
    titulo: "Acceso protegido al panel interno",
    descripcion:
      "Frase con PBKDF2 y código TOTP de un solo uso; sesión de 8 horas que se revoca de verdad al salir, cookie __Host- HttpOnly y SameSite=Strict, token anti-CSRF, límite de intentos y base de datos con permisos mínimos.",
    estado: "implementado",
    subcategorias: ["PR.AA-01", "PR.AA-03", "PR.AA-05"],
    evidencia: [
      "src/app/admin/acciones.ts",
      "src/lib/admin/acceso.ts",
      "src/lib/admin/almacen.ts",
      "src/lib/admin/clave.ts",
      "src/lib/admin/sesion.ts",
      "src/lib/admin/totp.ts",
      "db/migraciones/0002_sesiones_admin.sql",
    ],
  },
  {
    id: "PR-11",
    titulo: "Respaldos verificables",
    descripcion:
      "El código está versionado en git; la base de datos tendrá respaldos que se prueban antes de usarlos.",
    estado: "parcial",
    subcategorias: ["PR.DS-11"],
    evidencia: [INCIDENTES],
    tercio: 3,
  },

  // ── Detectar ────────────────────────────────────────────────────────────
  {
    id: "DE-01",
    titulo: "Avisos de código no autorizado",
    descripcion:
      "Si algo intenta ejecutarse en el sitio sin permiso, el navegador lo reporta; lo registramos sin datos personales y con límite de volumen.",
    estado: "implementado",
    subcategorias: ["DE.CM-09"],
    evidencia: ["src/app/api/csp-report/route.ts", "src/lib/security/csp-report.ts"],
  },
  {
    id: "DE-02",
    titulo: "Criterios para declarar un incidente",
    descripcion: "El plan define qué eventos se consideran incidente y con qué gravedad.",
    estado: "implementado",
    subcategorias: ["DE.AE-08"],
    evidencia: [INCIDENTES],
  },
  {
    id: "DE-04",
    titulo: "Alerta ante intentos de acceso al panel",
    descripcion:
      "Cada intento fallido o bloqueado queda en el registro como evento de seguridad. La alerta sobre esos eventos está descrita en la guía de despliegue; falta crearla en el proyecto real.",
    estado: "objetivo",
    subcategorias: ["DE.CM-01", "DE.AE-06"],
    evidencia: [],
  },
  {
    id: "DE-03",
    titulo: "Revisión semanal de eventos",
    descripcion:
      "Revisar cada semana los registros de seguridad y las alertas de la plataforma de alojamiento.",
    estado: "objetivo",
    subcategorias: ["DE.AE-02", "DE.CM-01"],
    evidencia: [],
  },

  // ── Responder ───────────────────────────────────────────────────────────
  {
    id: "RS-01",
    titulo: "Plan de respuesta a incidentes",
    descripcion:
      "Pasos para clasificar, contener, erradicar y documentar un incidente, con una bitácora que no se reescribe.",
    estado: "implementado",
    subcategorias: ["RS.MA-01", "RS.MA-02", "RS.MA-03", "RS.AN-06"],
    evidencia: [INCIDENTES],
  },
  {
    id: "RS-02",
    titulo: "Contención rápida",
    descripcion:
      "Documentados en la guía de despliegue: volver a la revisión anterior, cerrar la lista de espera, rotar secretos y cerrar las sesiones del panel. Falta ensayarlos en el entorno real.",
    estado: "parcial",
    subcategorias: ["RS.MI-01", "RS.MI-02"],
    evidencia: [INCIDENTES, "docs/despliegue.md"],
  },
  {
    id: "RS-03",
    titulo: "Comunicación de incidentes",
    descripcion:
      "Aviso a las personas afectadas y a la autoridad cuando corresponda, con asesoría legal.",
    estado: "parcial",
    subcategorias: ["RS.CO-02", "RS.CO-03"],
    evidencia: [INCIDENTES],
  },
  {
    id: "RS-04",
    titulo: "Análisis de causa raíz",
    descripcion: "Cada incidente cierra con un análisis sin culpas y acciones de mejora.",
    estado: "implementado",
    subcategorias: ["RS.AN-03"],
    evidencia: [INCIDENTES],
  },

  // ── Recuperar ───────────────────────────────────────────────────────────
  {
    id: "RC-01",
    titulo: "Volver a una versión sana",
    descripcion:
      "Se restaura desde un commit que pasó todas las verificaciones y se comprueba antes de reabrir el servicio.",
    estado: "parcial",
    subcategorias: ["RC.RP-01", "RC.RP-03", "RC.RP-05"],
    evidencia: [INCIDENTES],
  },
  {
    id: "RC-02",
    titulo: "Comunicación pública de la recuperación",
    descripcion: "Avisos de avance en esta página hasta dar por cerrado el incidente.",
    estado: "objetivo",
    subcategorias: ["RC.CO-03", "RC.CO-04"],
    evidencia: [],
  },
].map((c) => ControlSchema.parse(c));

export function controlesDe(funcion: CodigoFuncion): Control[] {
  return CONTROLES.filter((c) => c.id.startsWith(`${funcion}-`));
}

export function resumen(controles: readonly Control[]): Record<EstadoControl, number> {
  const r: Record<EstadoControl, number> = { implementado: 0, parcial: 0, objetivo: 0 };
  for (const c of controles) r[c.estado] += 1;
  return r;
}
