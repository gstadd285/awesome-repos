# Auditoría OWASP Top 10:2025 · Otea Austral

| | |
|---|---|
| Fecha | 2026-10-10 |
| Alcance | Carpeta `otea-austral/` completa: panel `/admin`, repositorio SQL, lista de espera, correo, configuración, contenedor y CI |
| Marco | [OWASP Top 10:2025](https://owasp.org/Top10/2025/) |
| Método | Revisión estática del código siguiendo los datos desde la entrada hasta su destino, más las pruebas propias del proyecto (unitarias, de integración con Postgres y de navegador) y la imagen de contenedor ejecutada en local. **No incluye** pruebas de intrusión, escaneo de red ni revisión del entorno real de Google Cloud, Neon o Resend (aún no existe) |
| Contexto de ejecución | Servidor Node.js (rutas, Server Actions, `proxy.ts`), navegador (componentes de cliente), compilación/CI (GitHub Actions) e infraestructura (Dockerfile, plantilla de Cloud Run) |
| Quién la hizo | Revisión asistida por IA de un código escrito también con asistencia de IA. **No sustituye** a una prueba de seguridad independiente antes de manejar datos reales de personas |

## Resumen

El código ya partía de una base sólida: consultas siempre parametrizadas, esquemas Zod estrictos, CSP con
nonce, HTTPS forzado, secretos solo en variables de entorno, doble factor en el panel, permisos mínimos
en la base de datos y disparadores que impiden reescribir la auditoría. Se confirmaron **seis hallazgos**:
**tres corregidos en esta misma entrega** (dos de severidad media y uno bajo), **dos bajos aceptados con
motivo** y **uno informativo** que depende de la plataforma. Además hay cinco observaciones de
endurecimiento, todas atendidas o documentadas. No quedan hallazgos abiertos de severidad media o alta.

| Severidad | Cantidad | Estado |
|---|---|---|
| Alta / Crítica | 0 | — |
| Media | 2 | Corregidos (A07-001, A06-001) |
| Baja | 3 | 1 corregido (A07-002); 2 aceptados con motivo (A07-003, A09-002) |
| Informativa | 1 | A09-001: la alerta se crea en el proyecto real |

| Confianza | Cantidad |
|---|---|
| Alta (ruta y falta de mitigación trazadas en el código) | 5 |
| Media (depende de cómo se configure la plataforma) | 1 |

## Hallazgos

### A07 · Fallas de autenticación

#### OWASP-A07-001 · La sesión del panel no se podía revocar en el servidor

- **Severidad:** Media. Quien obtuviera una copia de la cookie (por ejemplo, desde un equipo comprometido)
  seguiría dentro hasta 8 horas aunque la persona hubiera pulsado «Salir»; el panel publica contenido sobre
  mercados.
- **Confianza:** Alta. Se leyó el recorrido completo: la cookie era un HMAC sin estado y `cerrarSesion`
  solo la borraba del navegador.
- **CWE:** [CWE-613 · Insufficient Session Expiration](https://cwe.mitre.org/data/definitions/613.html)
  (A07, guía «Faulty Session Management»).
- **Ubicación (antes):** `src/lib/admin/sesion.ts` `leerSesion` (solo firma y vencimiento) y
  `src/app/admin/acciones.ts` `cerrarSesion` (solo `cookies().set(…, maxAge: 0)`).
- **Mitigaciones que ya existían:** cookie `__Host-` con `HttpOnly`, `Secure` y `SameSite=Strict`; CSP sin
  `unsafe-inline` (reduce el robo por XSS); vencimiento de 8 horas. No bastaban contra una copia ya robada.
- **Corrección:** migración `0002_sesiones_admin.sql` con la tabla `admin_sesiones`. Al entrar se registra
  la sesión; en cada solicitud la firma se verifica primero y luego la base decide si sigue vigente; «Salir»
  la revoca. Si la base no responde, no hay sesión (falla cerrado). La aplicación solo puede insertar y
  revocar (no borrar ni alargar), y un disparador impide reabrir una sesión revocada.
- **Pruebas:** `src/lib/admin/almacen.test.ts` (integración con Postgres) y `e2e/admin.spec.ts` («cerrar
  sesión revoca la cookie, también una copia»; «una cookie bien firmada pero sin sesión en la base no entra»).
- **Para revocar todas las sesiones a la vez:** rotar `ADMIN_SESION_SECRETO` (ver `docs/despliegue.md`).

#### OWASP-A07-002 · El código TOTP gastado solo se recordaba en la memoria de cada instancia

- **Severidad:** Baja. Reutilizar un código exige haberlo observado y usarlo dentro de su ventana (hasta 90
  segundos), y además hace falta la frase de acceso; aun así, el control no valía entre instancias ni
  después de un reinicio.
- **Confianza:** Alta.
- **CWE:** [CWE-287 · Improper Authentication](https://cwe.mitre.org/data/definitions/287.html) (A07, guía
  «Missing or Poorly Designed MFA»: «TOTP code accepted multiple times»).
- **Ubicación (antes):** `src/app/admin/acciones.ts`, variable `ultimoPaso` en la memoria del proceso.
- **Corrección:** tabla `admin_codigos_usados` con `INSERT … ON CONFLICT DO NOTHING`, atómica entre
  instancias; el código queda gastado aunque la frase falle (RFC 6238, sección 5.2). Probado con ocho
  intentos simultáneos: solo uno entra.

#### OWASP-A07-003 · El cupo global de intentos permite bloquear temporalmente al administrador (aceptado)

- **Severidad:** Baja (disponibilidad del panel, no confidencialidad). **Confianza:** Alta.
- **CWE:** [CWE-307](https://cwe.mitre.org/data/definitions/307.html) (el compromiso de diseño que advierte
  la guía: un bloqueo duro permite denegar el acceso legítimo).
- **Detalle:** `src/app/admin/acciones.ts` admite 5 intentos por IP y 100 en total cada 15 minutos por
  instancia. Una persona que gaste los 100 deja sin acceso al panel hasta 15 minutos. No da acceso a nada.
- **Decisión:** se acepta. El cupo global es lo que acota el esfuerzo de adivinar un código TOTP desde
  muchas IP (tope real: 100 × `maxScale` intentos cada 15 minutos, frente a 10⁶ códigos y una frase de
  ≈124 bits que además hay que acertar). Un bloqueo por cuenta con retrasos progresivos exigiría más estado
  y no cambia el riesgo de forma material para un único administrador.

### A06 · Diseño inseguro

#### OWASP-A06-001 · La lista de espera podía agotar la cuota de correo y enviar correo a terceros

- **Severidad:** Media. Un formulario público que envía un correo puede usarse para agotar los 100 correos
  diarios del plan gratuito (dejando sin confirmación a las personas reales) y para enviar mensajes no
  pedidos a direcciones ajenas.
- **Confianza:** Alta. Los límites eran en memoria y por instancia: 5 por IP y 300 en total cada 10
  minutos por instancia, muy por encima de la cuota diaria, y se reiniciaban en cada arranque.
- **CWE:** [CWE-799 · Improper Control of Interaction Frequency](https://cwe.mitre.org/data/definitions/799.html).
- **Ubicación (antes):** `src/lib/waitlist/service.ts`, `limiterPorCliente` y `limiterGlobal`.
- **Mitigaciones que ya existían:** campo trampa, validación Zod, un correo ya inscrito no recibe otro
  enlace durante 10 minutos, confirmación por POST, respuesta idéntica exista o no el correo.
- **Corrección:** tope diario de enlaces enviados (80 por defecto, `WAITLIST_ENVIOS_DIARIOS`) contado en la
  base de datos (`enviosDesde`), de modo que vale entre instancias y reinicios. Al alcanzarlo no se guarda
  ni se envía nada, con una respuesta distinta y clara para la persona («vuelve mañana»). Los envíos
  fallidos no consumen cupo. Pruebas en `service.test.ts` y `store-postgres.test.ts`.
- **Riesgo residual:** un atacante aún puede consumir el cupo del día y frenar nuevas inscripciones hasta
  el día siguiente. Es un daño acotado y reversible, y evita el peor caso (cuota agotada, correo masivo a
  terceros). Añadir un desafío tipo CAPTCHA introduciría un tercero en la página; se difiere.

### A09 · Fallas de registro y alertas

#### OWASP-A09-001 · Faltan alertas sobre intentos de acceso al panel (pendiente de la plataforma)

- **Severidad:** Informativa. **Confianza:** Alta.
- **CWE:** [CWE-778 · Insufficient Logging](https://cwe.mitre.org/data/definitions/778.html).
- **Detalle:** cada intento correcto, rechazado, bloqueado o cierre queda como evento JSON sin datos
  personales (`logSecurityEvent`), pero nadie recibe un aviso si hay una racha de rechazos.
- **Acción:** la receta de la alerta (métrica basada en registros de Cloud Logging) está en
  `docs/despliegue.md`; debe crearse en el proyecto real. Queda como objetivo `DE-04` del perfil NIST.

#### OWASP-A09-002 · El token del enlace de confirmación puede quedar en los registros de solicitudes (aceptado)

- **Severidad:** Baja. **Confianza:** Media: depende de cómo registre la plataforma; Cloud Run guarda la
  URL de cada solicitud, parámetros incluidos.
- **CWE:** [CWE-532 · Insertion of Sensitive Information into Log File](https://cwe.mitre.org/data/definitions/532.html).
- **Detalle:** `/lista-de-espera/confirmar?token=…` lleva el token en la URL. Abrir el enlace no confirma
  nada (hace falta pulsar un botón, que envía un POST); el token es de un solo uso, vence a las 72 horas y
  en la base solo se guarda su hash. Con acceso a los registros solo se podría confirmar la inscripción de
  otra persona a una lista de espera.
- **Decisión:** se acepta; quien puede leer los registros ya es el equipo. La retención de registros se
  limita a 30 días (ver `docs/despliegue.md`) y la política de privacidad lo informa.

## Observaciones de endurecimiento (no son vulnerabilidades confirmadas)

- **A10 · Sin páginas de error propias.** Next.js ya oculta el mensaje de los errores de servidor en
  producción, por lo que no se confirmó ninguna fuga. Se añadieron `src/app/error.tsx` y
  `src/app/global-error.tsx` (en español, sin mostrar nunca `error.message`, solo la referencia `digest`)
  y una prueba que lo verifica. Referencia: CWE-209.
- **A02 · La URL del sitio caía en `http://localhost:3000` si faltaba en producción.** El sitio habría
  publicado sitemap, `security.txt` y metadatos con enlaces a localhost sin ningún error. Ahora
  `NEXT_PUBLIC_SITE_URL` (https) es obligatoria al ejecutar en producción y la sonda `/api/salud` falla si
  no está, de modo que Cloud Run no envía tráfico a esa revisión. No se exige durante `next build`.
- **A02 · Endpoint `/_next/image` sin uso.** El sitio no usa `next/image`; se desactivó el optimizador
  (`images.unoptimized`), con lo que desaparece ese endpoint público y la imagen pierde 46 MB de binarios.
- **A02 · Superficie del contenedor.** La imagen corre sin privilegios (UID 10001), con base fijada por
  digest, sin `.env` ni código fuente; la CI lo comprueba.
- **A03 · Dependencia de compilación de Google Fonts.** `next/font/google` descarga las tipografías al
  construir (quedan autoalojadas; el navegador nunca contacta a Google). Si se quisiera construir sin red,
  habría que pasar a `next/font/local` con archivos versionados.

## Seguimiento: plan de los 20 controles (2026-10-10)

Después de la revisión se aplicó una lista de 20 controles de seguridad para aplicaciones web, cruzada con el
código real ([`plan-20-controles.md`](plan-20-controles.md)). Al hacerlo aparecieron estos hallazgos adicionales,
todos corregidos en esa misma entrega. Misma advertencia que arriba: severidad y confianza son una estimación
asistida por IA, no una prueba de intrusión.

| ID | Categoría | Severidad | Confianza | Estado |
|---|---|---|---|---|
| OWASP-A04-001 | Fallas criptográficas | Media | Alta | Corregido |
| OWASP-A01-001 | Control de acceso (defensa en profundidad) | Baja | Alta | Corregido |
| OWASP-A03-001 | Cadena de suministro (imagen) | Baja | Alta | Corregido |
| OWASP-A03-002 | Cadena de suministro (instalación) | Baja | Alta | Corregido |
| OWASP-A02-002 | Configuración (HTTPS) | Informativa | Media | Corregido |
| OWASP-A07-004 | Fallas de autenticación (bots) | Informativa | Media | Mitigado, decisión pendiente |

#### OWASP-A04-001 · Los correos de la lista de espera estaban en claro en la base

- **Severidad:** Media. Una copia de la base, un acceso indebido a la consola del proveedor o un compromiso
  de la aplicación revelaban todos los correos. **Confianza:** Alta (`lista_espera.correo` en la migración 0001
  y permiso `SELECT` de tabla completa para la aplicación).
- **CWE:** [CWE-312 · Cleartext Storage of Sensitive Information](https://cwe.mitre.org/data/definitions/312.html).
- **Mitigaciones que ya existían:** el proveedor cifra el disco; datos mínimos (sin IP ni agente); el token solo
  se guarda como hash.
- **Corrección:** migración `0004`. El correo se cifra con AES-256-GCM antes de guardarse y la fila se
  identifica por un índice ciego HMAC-SHA256; el usuario de la base **puede escribir pero no leer** el correo
  cifrado (permisos por columna), así que ni un compromiso de la aplicación permite volcar la lista. Lo
  descifra solo el dueño, con `WAITLIST_SECRETO` (`npm run lista:exportar`). La migración se niega a correr si
  hay correos en claro (para no perder datos). Pruebas con Postgres real: nada queda en claro en ninguna
  columna, la aplicación no puede leer `correo_cifrado`, un texto cifrado copiado a otra fila no se descifra,
  la base rechaza cualquier valor que no tenga forma de correo cifrado.
- **Riesgo residual:** quien tenga la base **y** `WAITLIST_SECRETO` los lee; el secreto vive en Secret Manager,
  fuera de la base. Si se pierde, los correos guardados no se recuperan: copia fuera de línea obligatoria.

#### OWASP-A01-001 · La aplicación podía borrar y modificar cualquier inscripción, incluso las confirmadas

- **Severidad:** Baja (la aplicación solo borraba pendientes vencidas, pero un error o un compromiso podía
  borrar la lista completa). **Confianza:** Alta (`grant … delete` de tabla completa y ninguna tabla con RLS).
- **CWE:** [CWE-285 · Improper Authorization](https://cwe.mitre.org/data/definitions/285.html) (defensa en
  profundidad).
- **Corrección:** migración `0003`, seguridad por fila en las nueve tablas. La aplicación solo cambia y borra
  inscripciones **pendientes**; el registro de fuentes es de solo lectura; las alertas nunca se borran y nacen
  como borrador; la auditoría y las correcciones solo admiten altas; una sesión solo se revoca. Pruebas: toda
  tabla tiene RLS (una nueva sin ella rompe la prueba), todo permiso tiene su política, las políticas siguen
  negando **aunque se conceda un permiso de más** y el usuario de la aplicación no puede saltarse RLS.
  `db:rol-app` rechaza un usuario con superusuario o `BYPASSRLS`.

#### OWASP-A03-001 · La imagen llevaba npm, yarn y corepack, con 13 hallazgos (uno crítico)

- **Severidad:** Baja (la aplicación no ejecuta npm; explotarlo exigiría ya poder ejecutar comandos en el
  contenedor). **Confianza:** Alta (Trivy sobre la imagen: `tar` 7.5.11 crítico, `brace-expansion`, `sigstore`,
  `picomatch`, `pacote`, `ip-address`: todos dentro de `/usr/local/lib/node_modules/npm`).
- **CWE:** [CWE-1104 · Use of Unmaintained Third Party Components](https://cwe.mitre.org/data/definitions/1104.html).
- **Corrección:** la etapa final del Dockerfile elimina npm, npx, corepack y yarn de la base (las etapas de
  compilación los conservan): 0 hallazgos en paquetes de Node y menos superficie. La CI comprueba que no estén
  y escanea la imagen con Trivy en cada cambio. Quedan 4 hallazgos altos de OpenSSL en Alpine (Node usa el suyo
  propio), que se muestran sin bloquear y se resuelven al refrescar la imagen base.

#### OWASP-A03-002 · Los paquetes podían ejecutar scripts al instalarse

- **Severidad:** Baja. **Confianza:** Alta. Un paquete comprometido corre código en el equipo o en la CI con
  solo instalarse. Solo 3 paquetes del lockfile tienen scripts de instalación (`fsevents`, solo macOS, y
  `unrs-resolver`) y ninguno hace falta.
- **CWE:** [CWE-829 · Inclusion of Functionality from Untrusted Control Sphere](https://cwe.mitre.org/data/definitions/829.html).
- **Corrección:** `ignore-scripts=true` en `.npmrc` (los scripts `npm run …` siguen funcionando); lint, tipos,
  448 pruebas (hoy 450) y build verificados con una instalación limpia.

#### OWASP-A02-002 · Sin redirección de http a https dentro de la aplicación

- **Severidad:** Informativa. **Confianza:** Media (depende de la plataforma: Cloud Run ya sirve https; HSTS
  protege las visitas siguientes pero no la primera).
- **Corrección:** `src/proxy.ts` redirige (308) lo que `X-Forwarded-Proto` marque como http al dominio
  configurado, sin redirecciones abiertas (`//otro.example`), con la sonda de salud exenta y el interruptor
  `HTTPS_FORZADO=0` para un bucle de emergencia. Hallazgo útil: el servidor de Next.js **añade** esa cabecera
  según la conexión que recibe, así que una petición http directa al contenedor también se redirige (la CI lo
  tiene en cuenta). Si la plataforma no enviara la cabecera, habría un bucle: ver `docs/despliegue.md`.

#### OWASP-A07-004 · Protección contra bots limitada a un campo trampa

- **Severidad:** Informativa. **Confianza:** Media.
- **Mitigación:** marca de tiempo firmada (HMAC) en el formulario (se descartan los envíos sin marca, con
  marca falsa, en menos de 3 s o con la pestaña abierta más de un día) y 20 intentos de confirmación por IP cada
  10 minutos, además del campo trampa, los límites y el tope diario existentes.
- **Pendiente (decisión de la persona responsable):** un desafío tipo CAPTCHA (Cloudflare Turnstile) frenaría a
  un bot dedicado, pero introduce un tercero en la página; ver `SECURITY.md`, «Decisiones».

#### Endurecimiento sin hallazgo

- **Secretos:** escáner de claves sobre archivos e historial (limpio), build con secretos falsos y pruebas de
  navegador que verifican que ninguna respuesta contiene secretos, `server-only` y reglas de lint.
- **Reglas que se comprueban solas:** SQL parametrizado, frontera cliente/servidor, autenticación del panel,
  inventario de endpoints, sin subida de archivos, `public/` de lista cerrada y SVG sin scripts.
- **Cabeceras y tamaños:** `X-Permitted-Cross-Domain-Policies`, `Origin-Agent-Cluster`, panel sin caché y
  cuerpos de Server Actions de 100 KB como máximo.
- **Auditoría de dependencias:** también las de desarrollo, con una lista de avisos aceptados con motivo y fecha
  de revisión (hoy, solo `braces`).

## Cobertura por categoría

| Categoría | Cobertura | Resultado |
|---|---|---|
| A01 Control de acceso roto | Evaluada | Sin hallazgos. Toda página y acción del panel llama a `exigirSesion`/`exigirAccionAdmin` en el servidor; los identificadores se validan (`Id`) antes de consultar; no hay rutas con objetos de otras personas; el único destino saliente es `api.resend.com` (fijo, sin redirecciones); no hay redirecciones abiertas (solo rutas internas generadas). CSRF: token ligado a la sesión más la comprobación de `Origin` de Next.js y `SameSite=Strict` |
| A02 Configuración incorrecta | Evaluada (código y plantilla; no el entorno real) | Observaciones de endurecimiento arriba. Cookie `__Host-`, CSP, HSTS, `frame-ancestors`, `X-Robots-Tag` en el panel |
| A03 Cadena de suministro | Parcialmente evaluada | Versiones exactas, `package-lock.json`, `npm ci`, acciones de CI fijadas por SHA, imagen base por digest, `npm audit` de producción sin vulnerabilidades. En desarrollo hay un aviso alto sin corrección publicada (`braces` vía `eslint-config-next`, ver `SECURITY.md`). La verificación de firmas npm corre en la CI y no pudo ejecutarse en el entorno de esta revisión |
| A04 Fallas criptográficas | Evaluada | Un hallazgo en el seguimiento (A04-001: correos en claro, **corregido**). PBKDF2-SHA256 de 600 000 iteraciones con sal, HMAC-SHA256 con secreto de ≥256 bits y separación de propósito, `timingSafeEqual`, tokens de 256 bits con CSPRNG de los que solo se guarda el hash, TLS con verificación de certificado exigida hacia la base |
| A05 Inyección | Evaluada | Sin hallazgos. Consultas parametrizadas en toda la aplicación; los únicos SQL construidos con texto son un ayudante de pruebas (valores generados localmente) y el script de operador `crear-rol-app` (nombre validado con expresión regular y literal escapado). React escapa la salida; el JSON-LD fijo escapa `<`; el correo HTML escapa el enlace |
| A06 Diseño inseguro | Evaluada | Hallazgo A06-001. Un único administrador: la regla «aprobación posterior a la última edición» existe, pero no hay cuatro ojos (decisión 7 de `docs/plan.md`) |
| A07 Fallas de autenticación | Evaluada | Hallazgos A07-001, -002 y -003 |
| A08 Integridad de software o datos | Evaluada | Sin hallazgos. Los formularios leen campos explícitos (sin asignación masiva), esquemas estrictos, sin deserialización nativa, sin webhooks entrantes |
| A09 Registro y alertas | Evaluada | Hallazgos A09-001 y A09-002. Registros JSON sin correos, IP ni tokens (`sanitizeLogText`); entradas saneadas contra inyección de líneas |
| A10 Manejo de condiciones excepcionales | Evaluada | Observación de endurecimiento arriba. Las transacciones revierten ante cualquier rechazo; la base caída hace fallar cerrado el panel; el envío de correo con tiempo límite y sin seguir redirecciones |

## Plan

Todo lo anterior marcado como «corregido» ya está en el código y probado. Quedan, por orden de
importancia, acciones que **no se resuelven con código**:

1. Activar la verificación en dos pasos en GitHub, Google Cloud, Neon, Resend y el registrador (R6).
2. Crear la alerta de Cloud Monitoring de `docs/despliegue.md` (A09-001) y fijar la retención de
   registros en 30 días.
3. Una prueba de seguridad independiente y la revisión legal de los textos antes de abrir la lista de
   espera con personas reales.

## Limitaciones

- No se vio un entorno desplegado: faltan por confirmar la configuración real de Cloud Run (ingreso,
  cuenta de servicio, secretos), de Neon (región, respaldos, restauración) y de Resend (dominio, cuotas).
- No se ejecutó análisis dinámico de seguridad (fuzzing, escáner web); las pruebas de navegador cubren los
  flujos esperados y algunos intentos de abuso, no un adversario real.
- La resistencia a ataques de volumen depende de la plataforma; los límites de la aplicación son una
  primera barrera por instancia.
- Las alertas de OWASP no sustituyen la revisión humana de las reglas de negocio de las alertas
  financieras (qué se publica y con qué respaldo), que es responsabilidad editorial.
