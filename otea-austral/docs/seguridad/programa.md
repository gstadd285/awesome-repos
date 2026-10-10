# Programa de seguridad · Otea Austral

Basado en el **NIST Cybersecurity Framework (CSF) 2.0**. Cubre las funciones Gobernar e
Identificar; Responder y Recuperar están en [`respuesta-incidentes.md`](respuesta-incidentes.md).
El perfil completo, con el estado de cada control, vive en `src/lib/security/nist-csf.ts` y se
publica en `/seguridad`.

> Autoevaluación. El NIST no certifica organizaciones: esto no es una certificación.
> Texto provisional, **pendiente de revisión legal y profesional**.

- **Nivel de implementación (Tier):** actual estimado 1 (Parcial); **objetivo** 2 (Informado por
  el riesgo) antes del lanzamiento público.
- **Última revisión:** 2026-10-09 · **Próxima:** 2027-01-09.

## 1. Alcance y contexto (GV.OC)

- **Alcance:** el sitio web, su código (GitHub), la integración continua y los servicios externos
  de la sección 5.
- **Misión y restricciones:** ver [`CLAUDE.md`](../../CLAUDE.md). En seguridad pesan sobre todo:
  presupuesto de unos 40 dólares (solo planes gratuitos), no presentar datos de ejemplo como reales
  y no ser asesoría financiera.
- **Obligaciones legales a confirmar con asesoría (GV.OC-03).** Lista de trabajo, no es una opinión
  legal:
  - Protección de datos personales: Ley 19.628 y su reforma, Ley 21.719 (según nuestra lectura,
    vigente desde diciembre de 2026), que incluye deberes de seguridad y de notificar
    vulneraciones.
  - Ley 21.663 Marco de Ciberseguridad: confirmar si Otea queda fuera de su alcance (servicios
    esenciales y operadores de importancia vital).
  - Ley 21.459 de delitos informáticos: revisar antes de publicar cualquier política de "puerto
    seguro" para quienes reporten vulnerabilidades.
  - Ley 21.521 (Fintec): confirmar que un servicio informativo como Otea no se considere asesoría
    de inversión.

## 2. Política de seguridad (GV.PO-01)

Principios:

1. **Minimizar datos.** No recoger lo que no se necesita; nada personal en registros.
2. **Mínimo privilegio.** Cada cuenta, token y usuario de base de datos con el acceso justo.
3. **Defensa en profundidad.** Validar al entrar y al mostrar; varias barreras independientes.
4. **Seguro por defecto.** Lo nuevo nace cerrado (sin acceso, sin peticiones salientes).
5. **Transparencia y corrección pública.** Como con las alertas: los errores se reconocen y se
   corrigen a la vista.

Reglas:

- Ningún secreto en el repositorio; solo variables de entorno.
- Toda entrada externa se valida con Zod en el borde.
- Dependencias con versión exacta; ninguna nueva sin revisar su necesidad y mantenimiento.
- Ningún cambio entra a `main` sin la CI en verde.
- Verificación en dos pasos en GitHub, alojamiento, registrador del dominio y correo, con códigos de
  respaldo guardados fuera de línea (**objetivo**, acción de la persona responsable).
- Esta política se revisa cada tres meses y después de cada incidente (GV.PO-02).

## 3. Apetito de riesgo (GV.RM-02)

| Situación | Tolerancia |
|---|---|
| Exponer datos personales | Muy baja |
| Ejecutar código no autorizado en el sitio | Muy baja |
| Publicar como confirmada una alerta sin respaldo | Muy baja |
| Alterar contenido sin dejar rastro | Muy baja |
| Vulnerabilidad conocida sin corregir en dependencias desplegadas | Baja (se corrige o se documenta) |
| Indisponibilidad breve (horas) del sitio informativo | Media |

## 4. Roles y responsabilidades (GV.RR-02)

| Rol | Quién | Responsabilidad |
|---|---|---|
| Responsable de seguridad | Persona fundadora | Decide y aprueba cambios, gestiona cuentas y secretos, lidera la respuesta a incidentes. |
| Asistente de desarrollo | Claude Code | Implementa controles en ramas; no tiene secretos de producción ni fusiona por su cuenta. |

Con una sola persona no hay separación de funciones real. Controles compensatorios: CI obligatoria,
revisión de cada pull request, auditoría inmutable y este programa versionado.

## 5. Proveedores (GV.SC-04)

| Proveedor | Uso | Criticidad | Qué datos ve | Estado |
|---|---|---|---|---|
| GitHub | Código, CI, reporte privado de vulnerabilidades | Alta | Código (público) | En uso |
| Registro npm | Dependencias | Alta | Ninguno | En uso |
| Google Fonts | Descarga de tipografías **durante el build**; los visitantes no se conectan a Google | Baja | Ninguno | En uso |
| Google Cloud (Cloud Run, Artifact Registry, Secret Manager, Cloud Logging) | Servir el sitio, imagen y secretos | Alta | IP y navegador de los visitantes en los registros de solicitudes (retención de 30 días) | Elegido; por crear |
| Registrador del dominio | oteaustral.com | Alta | Datos de la persona titular | Por comprar |
| Resend | Correo de doble opt-in | Media | Correos de la lista de espera | Elegido; por crear |
| Neon | Base de datos: alertas, fuentes, lista de espera, sesiones del panel | Alta | Correos de la lista de espera | Elegido; por crear |

Para aceptar un proveedor: plan gratuito suficiente, verificación en dos pasos, cifrado en tránsito
y en reposo, condiciones de tratamiento de datos legibles y posibilidad de exportar los datos.

## 6. Datos y conexiones (ID.AM-03, ID.AM-07)

| Dato | Origen | Dónde queda | Notas |
|---|---|---|---|
| Visitas al sitio | Navegadores | Registros de solicitudes de Cloud Run | IP y agente de usuario, 30 días, solo seguridad y diagnóstico. Sin cookies de seguimiento ni analítica. |
| Reportes de violación de la CSP | Navegadores | Registros de la plataforma | Sin IP, agente de usuario ni parámetros de URL en lo que registra la aplicación. |
| Correo de la lista de espera | Persona interesada | Base de datos | Con consentimiento y doble opt-in; las inscripciones sin confirmar se borran a los 30 días; se borra al darse de baja. |
| Enlace de confirmación | Aplicación | Correo de la persona; URL en los registros | Token de un solo uso (72 h); en la base solo su hash. |
| Alias internos en la auditoría | Equipo | Base de datos | Inmutable; sin datos personales. |
| Sesiones del panel | Equipo | Base de datos | Identificador aleatorio y fechas; sin datos personales. |

Conexiones permitidas: el navegador solo habla con el propio sitio (`connect-src 'self'`). El servidor
solo hace una petición saliente automática: `https://api.resend.com/emails`. Durante el build se
contacta npm y Google Fonts; la CI corre en GitHub.

## 7. Registro de riesgos (ID.RA-03, ID.RA-04, ID.RA-06)

| ID | Riesgo | Prob. | Impacto | Tratamiento | Estado |
|---|---|---|---|---|---|
| R1 | Dependencia comprometida (cadena de suministro) | Media | Alto | Versiones exactas, lockfile con hashes, firmas npm, SBOM, Dependabot | Mitigado en parte |
| R2 | Inyección de scripts (XSS) | Baja | Alto | CSP con nonce, escapado de React, reportes de violación | Mitigado |
| R3 | Publicar como confirmada información sin respaldo | Media | Alto | Confianza calculada, reglas de publicación (lógica y base de datos), auditoría y correcciones públicas | Mitigado |
| R4 | Acceso no autorizado al panel interno | Media | Alto | Frase + TOTP de un solo uso, sesión revocable, límite de intentos, CSRF, permisos mínimos; revisión OWASP | Mitigado; falta la alerta de accesos fallidos y una prueba independiente |
| R5 | Fuga de correos de la lista de espera | Baja | Alto | Minimización, permisos mínimos de la base, TLS verificado, registros sin datos personales, tope diario de correos | Mitigado en parte; pendiente revisión legal y abrir con proveedores reales |
| R6 | Toma de cuentas de proveedores | Media | Alto | Verificación en dos pasos y códigos de respaldo | **Pendiente: acción de la persona responsable** |
| R7 | Secreto expuesto (token de despliegue o de base de datos) | Baja | Alto | Solo variables de entorno, rotación, procedimiento de contención | Mitigado en parte |
| R8 | Indisponibilidad (ataque de volumen o caída del proveedor) | Media | Medio | CDN del alojamiento, límites de solicitudes, vuelta a versión sana | Mitigado en parte |
| R9 | Pérdida o secuestro del dominio | Baja | Alto | Renovación automática, bloqueo de transferencia, dos pasos en el registrador | Pendiente (dominio por comprar) |

## 8. Revisión y mejora (GV.OV-01, ID.IM)

- Cada tres meses y después de cada incidente: actualizar `src/lib/security/nist-csf.ts`, este
  documento y `SECURITY.md`.
- Renovar `Expires` de `/.well-known/security.txt` antes del 2027-04-01 (una prueba falla si vence).
- Auditoría OWASP Top 10:2025 hecha al cerrar el tercio 3 (`auditoria-owasp-2025.md`); repetirla ante
  cambios grandes de autenticación, datos o alojamiento. **Objetivo:** una prueba de seguridad
  independiente y un ejercicio de mesa anual del plan de incidentes.
