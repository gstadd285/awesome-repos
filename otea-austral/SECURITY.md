# Seguridad · Otea Austral

Estado de los controles de seguridad y lo que queda pendiente. El programa sigue el **NIST
Cybersecurity Framework (CSF) 2.0**. Al cerrar el tercio 3 se hizo una revisión **OWASP Top 10:2025**
con sus correcciones: [`docs/seguridad/auditoria-owasp-2025.md`](docs/seguridad/auditoria-owasp-2025.md).
Es una revisión asistida por IA y **no sustituye** a una prueba de seguridad independiente.
Después se aplicó una lista de 20 controles de seguridad para aplicaciones web, cruzada con el código real:
[`docs/seguridad/plan-20-controles.md`](docs/seguridad/plan-20-controles.md) (qué había, qué se hizo y qué queda).

## Reportar una vulnerabilidad

Usa el canal publicado en [`/.well-known/security.txt`](https://oteaustral.com/.well-known/security.txt)
o en la página `/seguridad`. Mientras no exista una dirección dedicada, es el formulario privado de
GitHub (_Security → Report a vulnerability_), que la persona responsable debe tener **activado**. No
publiques detalles en issues abiertos.

## Marco NIST CSF 2.0

- **Perfil** (fuente única, con estado y evidencia de cada control): `src/lib/security/nist-csf.ts`,
  publicado en `/seguridad`. Una prueba verifica que toda evidencia citada exista.
- **Gobernar e Identificar** (política, apetito de riesgo, roles, proveedores, datos, riesgos):
  [`docs/seguridad/programa.md`](docs/seguridad/programa.md).
- **Responder y Recuperar** (criterios, gravedad, contención, comunicación, recuperación):
  [`docs/seguridad/respuesta-incidentes.md`](docs/seguridad/respuesta-incidentes.md).
- Nivel de implementación: 1 (Parcial) estimado hoy; **objetivo** 2 (Informado por el riesgo).
- Autoevaluación: el NIST no certifica organizaciones. Nunca presentarlo como certificación.

## Controles implementados

| Área | Control | Dónde |
|---|---|---|
| Inyección / XSS | CSP estricta con nonce por solicitud, `strict-dynamic`, sin `unsafe-inline` para scripts ni estilos en producción | `src/proxy.ts`, `src/lib/security/csp.ts` |
| Inyección / XSS | React escapa todo el texto. `dangerouslySetInnerHTML` solo para los datos estructurados JSON-LD de la portada: contenido fijo, con `<` escapado y nonce | componentes, `src/app/page.tsx` |
| Enlaces | Solo `https` (se rechazan `http:`, `javascript:`, `data:`, `file:`, credenciales embebidas); doble validación: Zod al entrar y `safeHref` al renderizar | `src/lib/domain/url.ts` |
| Enlaces | `target="_blank"` siempre con `rel="noopener noreferrer"` | `AlertCard` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | CSP, `headers.ts` |
| Transporte | HSTS de 2 años con subdominios; `upgrade-insecure-requests`; la aplicación redirige (308) a https lo que el proxy marque como http, hacia el dominio configurado y sin redirecciones abiertas (`HTTPS_FORZADO=0` es el interruptor de emergencia) | `headers.ts`, CSP, `src/proxy.ts`, `src/lib/security/https.ts` |
| Cabeceras | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP, `X-Permitted-Cross-Domain-Policies` y `Origin-Agent-Cluster`; sin `X-Powered-By`; las páginas del panel no se guardan en caché. Los cuerpos de las Server Actions se limitan a 100 KB | `headers.ts`, `next.config.ts`, `headers.test.ts` |
| Integridad de datos | Esquemas Zod estrictos: campos desconocidos rechazados; la confianza no se puede escribir a mano | `src/lib/domain/schemas.ts` |
| Auditoría | Registro de solo agregar, filas congeladas, ids únicos; el actor es un alias interno (no admite correos) | `src/lib/domain/audit-log.ts` |
| Salidas | Sin peticiones salientes: `connect-src 'self'` y ningún `fetch` a terceros | CSP |
| Lista de espera | Server Action con protección CSRF de Next.js (`Origin` vs `Host`), validación Zod en el servidor, campo trampa, límite de 5 intentos por IP cada 10 min (IP cifrada con SHA-256, solo en memoria) y tope global; respuestas que no revelan si un correo ya estaba; doble opt-in con token aleatorio de 256 bits del que solo se guarda el hash; datos mínimos (correo, fecha, versión del consentimiento) | `src/lib/waitlist/`, `src/app/acciones/` |
| Lista de espera | Tope diario de correos de confirmación contado en la base (80 por defecto): protege la cuota del proveedor y el buzón de terceros; vale entre instancias y reinicios | `src/lib/waitlist/service.ts`, `store-postgres.ts` |
| Lista de espera | **Trampa de tiempo firmada** (HMAC): el formulario lleva la hora del servidor y se descartan los envíos sin marca, con marca falsa, en menos de 3 s o con la pestaña abierta más de un día; 20 intentos de confirmación por IP cada 10 minutos. Frena a los bots simples; **no es un CAPTCHA** (ver «Decisiones») | `src/lib/waitlist/tiempo.ts`, `service.ts` |
| Datos personales | **Los correos se guardan cifrados** (AES-256-GCM, IV aleatorio; el índice de la fila va como dato autenticado, así un texto copiado a otra fila no se descifra) con un **índice ciego** HMAC-SHA256 para detectar repetidos. El usuario de la base puede escribir el correo cifrado pero **no tiene permiso para leerlo**: si la aplicación se compromete, no puede volcar la lista. Solo el dueño, con `WAITLIST_SECRETO`, los descifra (`npm run lista:exportar`) o rota el secreto (`npm run lista:recifrar`) | `src/lib/waitlist/cifrado.ts`, `scripts/lib/lista-cifrado.mjs`, `db/migraciones/0004_correos_cifrados.sql` |
| Configuración | `WAITLIST_MODE=cerrada` por defecto; el esquema de entorno rechaza la lista en memoria, una base sin `verify-full` y una URL del sitio que no sea https en producción (se exige al ejecutar, no al construir) | `src/lib/env.ts` |
| Panel `/admin` | Sin credenciales configuradas responde 404. Acceso con frase aleatoria (hash PBKDF2-SHA256 de 600 000 iteraciones) **y** código TOTP de un solo uso (gastado en la base, atómico entre instancias); sin pistas sobre qué falló; 5 intentos por IP y 100 en total cada 15 min por instancia | `src/app/admin/acciones.ts`, `src/lib/admin/` |
| Sesión del panel | Cookie `__Host-` (`Secure`, `HttpOnly`, `SameSite=Strict`) firmada con HMAC-SHA256 y **registrada en la base**: «Salir» la revoca de verdad y falla cerrado si la base no responde; 8 horas; token anti-CSRF ligado a la sesión en cada acción, además de la comprobación de `Origin` de Next.js | `src/lib/admin/sesion.ts`, `acceso.ts`, `almacen.ts` |
| Base de datos | Usuario de la aplicación con permisos mínimos por columna; sin `DELETE` salvo en la lista de espera; la auditoría, las correcciones, las sesiones y los códigos gastados son de solo agregar (permisos **y** disparadores); consultas siempre parametrizadas; ciclo de vida de las alertas validado también en la base | `db/migraciones/`, `scripts/crear-rol-app.mjs`, `src/lib/db/` |
| Base de datos | **Seguridad por fila (RLS)** en las nueve tablas: sin política no hay acceso, aunque un `GRANT` agregado por error lo diera. Las inscripciones confirmadas quedan fuera del alcance de la aplicación (no puede cambiarlas ni borrarlas). Una prueba falla si una tabla nueva no activa RLS o si un permiso no tiene política; `db:rol-app` rechaza un usuario con superusuario, `BYPASSRLS` u otros atributos de más | `db/migraciones/0003_seguridad_por_fila.sql`, `src/lib/db/rls.test.ts` |
| Correo | Única petición saliente (`api.resend.com`, fija), con tiempo límite y sin seguir redirecciones; los fallos se registran sin correo ni token | `src/lib/waitlist/correo.ts` |
| Errores | Páginas de error propias que nunca muestran el mensaje del error; la sonda `/api/salud` falla si la configuración es inválida y Cloud Run no envía tráfico a esa revisión | `src/app/error.tsx`, `global-error.tsx`, `src/app/api/salud/route.ts` |
| Contenedor | Imagen multi-etapa sin privilegios (UID 10001), base fijada por digest, sin `.env`, código fuente, `sharp`, mapas de código ni gestores de paquetes (se quitan npm, corepack y yarn de la base: con ellos, el escaneo marcaba 13 hallazgos, uno crítico, en las dependencias que npm empaqueta); sin optimizador de imágenes público; la CI la construye, la prueba y la escanea con Trivy | `Dockerfile`, `.dockerignore`, `next.config.ts` |
| Pruebas | Más de 70 pruebas de navegador en CI, también del panel con una base de datos real: sin errores de consola ni violaciones de CSP, cabeceras, teclado, movimiento reducido, lista de espera (incluida la marca de tiempo), enlaces seguros, sesión revocada al salir, código TOTP no reutilizable y **ninguna respuesta con secretos** | `e2e/` |
| Reglas que se comprueban solas | Pruebas que leen el código: toda acción y página del panel exige sesión, el SQL solo interpola constantes `SQL_…`, ningún componente de navegador importa la base ni la configuración, no hay subida de archivos, `public/` y los SVG son de lista cerrada, y el inventario de Server Actions y endpoints no cambia sin revisión. Reglas de lint: `process.env` solo en `env.ts`, `pg` solo en `src/lib/db`, sin `dangerouslySetInnerHTML` (salvo el JSON-LD fijo), `innerHTML`, `eval` ni `document.write` | `src/lib/security/arquitectura.test.ts`, `eslint.config.mjs` |
| Detección | Reportes de violación de la CSP (`report-uri` y `report-to`) a `/api/csp-report`: tipo de contenido, tamaño (16 KB) y volumen (60/min por instancia) limitados; se registra solo directiva, origen y ruta | `src/lib/security/csp-report.ts` |
| Registros | Eventos de seguridad en JSON con saneamiento: sin correos, IP, tokens, parámetros de URL ni saltos de línea | `src/lib/security/log.ts` |
| Divulgación | `/.well-known/security.txt` (RFC 9116) con `Expires`; una prueba falla si vence | `src/lib/security/security-txt.ts` |
| Cadena de suministro | Verificación de firmas del registro npm (`npm audit signatures`) y SBOM CycloneDX como artefacto de cada CI | `.github/workflows/otea-austral.yml` |
| Dependencias | Versiones exactas (`save-exact`), `npm ci` en CI, **sin scripts de instalación** (`ignore-scripts`), `npm audit` de producción bloqueante, auditoría de **todas** las dependencias que bloquea cualquier aviso alto o crítico no evaluado (los aceptados llevan motivo y fecha de revisión), Dependabot semanal | `package.json`, `.npmrc`, `scripts/auditar-dependencias.mjs`, `seguridad/avisos-npm-aceptados.json`, `.github/` |
| CI | Permisos mínimos (`contents: read`), acciones fijadas por SHA, sin credenciales persistidas | `.github/workflows/otea-austral.yml` |
| Secretos | Ninguno en el repositorio; `.env*` ignorado salvo `.env.example`. Un escáner busca claves en los archivos y en **todo el historial** (hoy limpio) y no imprime nunca el valor encontrado. Cada build se hace con secretos falsos («canarios») y falla si alguno queda en `.next/` (o hay mapas de código públicos); `server-only` en la configuración y en el cliente de la base | `.gitignore`, `scripts/escanear-secretos.mjs`, `scripts/comprobar-secretos-en-build.mjs` |

## Pendientes

### Tercio 2 (sitio público)

- [x] Lista de espera: validación en servidor, campo trampa, límite de solicitudes, CSRF de la
      Server Action, datos mínimos y doble opt-in.
- [x] Pruebas e2e con Playwright que fallan ante errores de consola, incluidas violaciones de CSP.
- [ ] Revisar con asesoría legal los textos provisionales (privacidad, términos, aviso legal,
      metodología). **Antes de abrir la lista de espera.**
- [x] Cookies: la única cookie es la del panel, `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`.
- [ ] El límite por IP depende de `X-Forwarded-For`: en Cloud Run se toma la entrada que agrega
      Google (`IP_PROXIES_CONFIABLES=1`; detrás de un balanceador, 2). **Confirmarlo tras desplegar.**

### Tercio 3 (persistencia y panel interno)

- [x] **Panel `/admin` protegido:** frase + TOTP, sesión revocable, límite de intentos, cookie
      firmada y CSRF en todas las acciones.
- [x] Base de datos con mínimos privilegios: la auditoría, las correcciones, las sesiones y los
      códigos gastados solo admiten `INSERT`/`SELECT`, y un disparador rechaza `UPDATE`/`DELETE`.
- [x] Consultas parametrizadas exclusivamente.
- [x] Cambios de fuentes en alertas publicadas pasan por el flujo de corrección.
- [x] Registros sin datos personales (`logSecurityEvent`). Falta fijar la retención de los registros
      de la plataforma en 30 días (`docs/despliegue.md`).
- [x] Revisión OWASP Top 10:2025: [`docs/seguridad/auditoria-owasp-2025.md`](docs/seguridad/auditoria-owasp-2025.md).
- [x] SSRF: la única petición saliente es `https://api.resend.com/emails` (fija). Si algún día se
      hace `fetch` de URLs de usuarios: lista de dominios del registro de fuentes, tiempo límite,
      tamaño máximo y sin redirecciones a otros dominios.

### Acciones de la persona responsable (no se resuelven con código)

- [ ] Activar **Private vulnerability reporting** en GitHub (Settings → Security), o definir
      `SECURITY_CONTACT` con un correo propio cuando exista el dominio.
- [ ] Activar en GitHub **Secret scanning** y **Push protection** (Settings → Code security): bloquean el push
      de un secreto antes de que llegue al repositorio. Es la segunda barrera junto al escáner de la CI.
- [ ] Activar **Dependabot alerts** y **Dependabot security updates** (mismo menú).
- [ ] Generar `WAITLIST_SECRETO` con `npm run lista:secreto`, guardarlo en Secret Manager **y una copia fuera de
      línea**: si se pierde, los correos cifrados ya guardados no se pueden recuperar (`docs/despliegue.md`).
- [ ] Tras el primer despliegue, comprobar que `http://dominio` redirige a https sin bucles (con una revisión
      sin tráfico; si hubiera bucle, `HTTPS_FORZADO=0`, ver `docs/despliegue.md`).
- [ ] Decidir si se añade un desafío tipo CAPTCHA a la lista de espera (ver «Decisiones»).
- [ ] Actualizar a mano, de vez en cuando, el digest de Trivy fijado en la CI (Dependabot no lo sigue).
- [ ] Verificación en dos pasos en GitHub, Google Cloud, Neon, Resend, registrador del dominio y
      correo, con códigos de respaldo fuera de línea.
- [ ] Crear en Cloud Monitoring la alerta de intentos de acceso al panel y fijar la retención de
      registros en 30 días (`docs/despliegue.md`).
- [ ] Una prueba de seguridad independiente antes de manejar datos reales de personas.
- [ ] Renovar `Expires` de `security.txt` antes del 2027-04-01.

### Decisiones y riesgos conocidos

- **CSP con nonce ⇒ renderizado dinámico.** Cada página se genera por solicitud
  (`cacheComponents: false`, `connection()` en el layout). Más costo de servidor que una página
  estática, pero dentro de los planes gratuitos para el tráfico esperado. Alternativa futura: SRI
  (experimental en Next.js) para volver a páginas estáticas.
- **HSTS sin `preload`** hasta comprar y fijar el dominio definitivo.
- **`npm audit` de desarrollo:** `eslint-config-next` arrastra `fast-glob → micromatch → braces`
  con un aviso alto (GHSA-vfj7-8cjw-p6xm, DoS por patrones anidados) sin corrección publicada (la última
  versión de `braces` es la afectada). Solo afecta al lint local y a la CI, no al código que se despliega. Está
  **aceptado con motivo y fecha de revisión (2027-01-10)** en `seguridad/avisos-npm-aceptados.json`: cualquier
  otro aviso alto o crítico de desarrollo bloquea la CI y, al vencer la fecha, esta también vuelve a bloquear
  hasta que alguien lo revise.
- **Contraseñas con PBKDF2, no con Argon2id:** la frase del panel la genera el sistema (≈ 124 bits), así que la
  fortaleza la da la frase y no el algoritmo; Node 22 no trae Argon2 de serie y un módulo nativo aumentaría la
  cadena de suministro. PBKDF2-SHA256 con 600 000 iteraciones es el mínimo de OWASP. Si algún día hay cuentas de
  personas con contraseñas que ellas elijan, se reabre.
- **Sin desafío tipo CAPTCHA en la lista de espera:** Cloudflare Turnstile es gratuito y eficaz, pero mete a un
  tercero en la página (el sitio hoy no contacta a nadie) y exige cambiar la CSP y la política de privacidad. Las
  defensas actuales (campo trampa, marca de tiempo firmada, límites y tope diario) frenan a los bots simples y
  acotan el daño de uno dedicado: lo peor es agotar el tope del día. Decisión de la persona responsable.
- **Sin límite global por IP para todo el sitio:** cada solicitud ya llegó a la aplicación y gastó cómputo; frenar
  el abuso masivo es trabajo de la plataforma (`maxScale` de Cloud Run y la alerta de presupuesto; Cloud Armor
  es de pago).
- **La imagen se escanea con Trivy:** bloquean las vulnerabilidades críticas con corrección y todo lo alto o
  crítico de las dependencias de la aplicación. Las altas de los paquetes de Alpine (hoy, OpenSSL, que Node no
  usa: lleva el suyo) se muestran sin bloquear y se resuelven al refrescar la imagen base (Dependabot).
- **`WAITLIST_SECRETO` es un punto único:** quien tenga la base **y** el secreto lee los correos. Por eso el
  usuario de la aplicación no puede leerlos (un compromiso de la aplicación no basta) y el dueño exporta desde su
  equipo. Rotarlo exige `npm run lista:recifrar` con la lista cerrada (ver `docs/despliegue.md`).
- **Trusted Types** no está activado: requiere comprobar compatibilidad con Next.js.
- **Alojamiento: Google Cloud Run**, con Neon y Resend (ver `docs/despliegue.md`). Requiere una cuenta
  de facturación aunque haya cuota gratuita: un presupuesto con alertas de 40 USD es obligatorio.
- **Límites por IP en memoria de cada instancia.** Son una primera barrera; con `maxScale` instancias
  el tope real es ese número de veces mayor. Lo que no puede depender de la memoria (códigos TOTP
  gastados, sesiones revocadas, tope diario de correos) vive en la base.
- **El build descarga las tipografías de Google Fonts** (`next/font/google`) y las deja autoalojadas;
  los visitantes nunca contactan a Google. Construir sin red exigiría `next/font/local`.
- **Un solo administrador.** La regla «aprobación posterior a la última edición» existe, pero no hay
  cuatro ojos (decisión pendiente en `docs/plan.md`).

## OWASP Top 10:2025

Resultado de la revisión del 2026-10-10 (detalle, hallazgos y límites en
[`docs/seguridad/auditoria-owasp-2025.md`](docs/seguridad/auditoria-owasp-2025.md)):

| Categoría | Estado |
|---|---|
| A01 Control de acceso roto | Sin hallazgos. Toda página y acción del panel verifica la sesión en el servidor; CSRF por token, `Origin` y `SameSite=Strict`. |
| A02 Configuración de seguridad incorrecta | Cabeceras y CSP probadas; la configuración insegura hace fallar la sonda de arranque. Falta revisar el entorno real. |
| A03 Fallas en la cadena de suministro de software | Versiones fijas, lockfile, `npm ci`, auditoría de producción limpia, acciones de CI e imagen base fijadas. Aviso alto solo en desarrollo (sección anterior). |
| A04 Fallas criptográficas | Sin hallazgos: PBKDF2 (600 000), HMAC-SHA256, tokens de 256 bits con hash, TLS con verificación. |
| A05 Inyección | Sin hallazgos: consultas parametrizadas, escapado de React, CSP estricta. |
| A06 Diseño inseguro | **Corregido** A06-001: tope diario de correos de la lista de espera. |
| A07 Fallas de autenticación | **Corregidos** A07-001 (sesión revocable) y A07-002 (código TOTP de un solo uso entre instancias). Aceptado A07-003 (cupo global de intentos). |
| A08 Fallas de integridad de software o datos | Sin hallazgos: campos leídos explícitamente, esquemas estrictos, sin deserialización nativa. |
| A09 Fallas de registro y alertas | Registros sin datos personales. Pendiente crear la alerta de accesos fallidos (A09-001); aceptado A09-002 (token de confirmación en la URL). |
| A10 Mal manejo de condiciones excepcionales | Páginas de error propias sin fuga de mensajes; transacciones que revierten; la base caída hace fallar cerrado el panel. |
