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
| Inyección / XSS | React escapa todo el texto. `dangerouslySetInnerHTML` solo en dos sitios, ambos contenido fijo de la compilación y con nonce: los datos estructurados JSON-LD de la portada (con `<` escapado) y el script de movimiento (`src/lib/movimiento/motor.ts`, sin datos de la solicitud) | componentes, `src/app/page.tsx`, `src/components/motion/ScriptMovimiento.tsx` |
| Enlaces | Solo `https` (se rechazan `http:`, `javascript:`, `data:`, `file:`, credenciales embebidas); doble validación: Zod al entrar y `safeHref` al renderizar | `src/lib/domain/url.ts` |
| Enlaces | `target="_blank"` siempre con `rel="noopener noreferrer"` | `AlertCard` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | CSP, `headers.ts` |
| Transporte | HSTS de 2 años con subdominios; `upgrade-insecure-requests`; la aplicación redirige (308) a https lo que el proxy marque como http, hacia el dominio configurado y sin redirecciones abiertas (`HTTPS_FORZADO=0` es el interruptor de emergencia) | `headers.ts`, CSP, `src/proxy.ts`, `src/lib/security/https.ts` |
| Cabeceras | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP, `X-Permitted-Cross-Domain-Policies` y `Origin-Agent-Cluster`; sin `X-Powered-By`; las páginas del panel no se guardan en caché. Los cuerpos de las Server Actions se limitan a 100 KB | `headers.ts`, `next.config.ts`, `headers.test.ts` |
| Integridad de datos | Esquemas Zod estrictos: campos desconocidos rechazados; la confianza no se puede escribir a mano | `src/lib/domain/schemas.ts` |
| Auditoría | Registro de solo agregar, filas congeladas, ids únicos; el actor es un alias interno (no admite correos) | `src/lib/domain/audit-log.ts` |
| Salidas | El navegador no hace peticiones a terceros: `connect-src 'self'` y ningún `fetch` a otro origen. El servidor hace dos, ambas a direcciones fijas: Resend (correo) y, solo si se activa la IA del asistente, Anthropic | CSP, `src/lib/waitlist/correo.ts`, `src/lib/asistente/proveedor-anthropic.ts` |
| Lista de espera | **Inscripción verificada en dos pasos** (dejar el correo y confirmarlo con el enlace) y **condiciones de uso y consentimiento aceptados por separado**: cada casilla se exige en el servidor y la versión de los textos aceptados se guarda con el registro (`VERSION_CONSENTIMIENTO`) | `src/lib/waitlist/schema.ts`, `service.ts`, `src/components/home/WaitlistForm.tsx` |
| Lista de espera | Server Action con protección CSRF de Next.js (`Origin` vs `Host`), validación Zod en el servidor, campo trampa, límite de 5 intentos por IP cada 10 min (IP cifrada con SHA-256, solo en memoria) y tope global; respuestas que no revelan si un correo ya estaba; doble opt-in con token aleatorio de 256 bits del que solo se guarda el hash; datos mínimos (correo, fecha, versión del consentimiento) | `src/lib/waitlist/`, `src/app/acciones/` |
| Lista de espera | Tope diario de correos de confirmación contado en la base (80 por defecto): protege la cuota del proveedor y el buzón de terceros; vale entre instancias y reinicios | `src/lib/waitlist/service.ts`, `store-postgres.ts` |
| Lista de espera | **Trampa de tiempo firmada** (HMAC): el formulario lleva la hora del servidor y se descartan los envíos sin marca, con marca falsa, en menos de 3 s o con la pestaña abierta más de un día; 20 intentos de confirmación por IP cada 10 minutos. Frena a los bots simples; **no es un CAPTCHA** (ver «Decisiones») | `src/lib/waitlist/tiempo.ts`, `service.ts` |
| Datos personales | **Los correos se guardan cifrados** (AES-256-GCM, IV aleatorio; el índice de la fila va como dato autenticado, así un texto copiado a otra fila no se descifra) con un **índice ciego** HMAC-SHA256 para detectar repetidos. El usuario de la base puede escribir el correo cifrado pero **no tiene permiso para leerlo**: si la aplicación se compromete, no puede volcar la lista. Solo el dueño, con `WAITLIST_SECRETO`, los descifra (`npm run lista:exportar`) o rota el secreto (`npm run lista:recifrar`) | `src/lib/waitlist/cifrado.ts`, `scripts/lib/lista-cifrado.mjs`, `db/migraciones/0004_correos_cifrados.sql` |
| Asistente de preguntas | `POST /api/asistente` pasa por las mismas puertas que los demás puntos que reciben datos: tipo de contenido JSON, **mismo origen** (`Sec-Fetch-Site` y `Origin`), 12 preguntas por minuto y 150 por día por persona (huella SHA-256 de la IP, solo en memoria), cuerpo de hasta 8 KB, esquema estricto y pregunta de hasta 500 caracteres. Sin cookies ni sesión; las respuestas no se guardan en cachés | `src/lib/asistente/manejador.ts`, `src/app/api/asistente/route.ts` |
| Asistente de preguntas | **Políticas antes del modelo:** una pregunta con datos personales (correo, teléfono, RUT, tarjeta), un intento de cambiarle las instrucciones, un pedido de consejo de inversión o un pronóstico recibe una respuesta fija y **nunca llega al modelo**. Lo que no coincide con la base de conocimiento tampoco: se dice «no encontré eso». Los atajos de la interfaz y las preguntas idénticas a las de la base se responden con la base, sin gastar IA | `src/lib/asistente/politicas.ts`, `recuperar.ts`, `servicio.ts` |
| Asistente de preguntas | **El modelo no tiene herramientas ni secretos:** ve solo texto público (las preguntas frecuentes recuperadas, delimitadas) y debe responder solo con él. Su salida se revisa **frase por frase antes de mostrarse**: se bloquean lenguaje de recomendación, enlaces, HTML, cifras que no estén en el contexto y señales de que repite sus instrucciones; si una frase falla se corta y la persona recibe la respuesta de la base | `src/lib/asistente/prompt.ts`, `salida.ts` |
| Asistente de preguntas | **Gasto acotado:** antes de cada llamada se reserva el peor caso en un tope diario contado en Postgres (atómico entre instancias; si la base falla, no se llama al modelo), se ajusta al uso real al terminar y hay un cupo de IA por persona. La IA está **apagada por omisión**: exige modelo, precios, tope y clave (en Secret Manager), o la configuración se rechaza al arrancar; al cerrar la conexión se cancela la llamada al proveedor | `src/lib/asistente/presupuesto*.ts`, `src/lib/env.ts`, `db/migraciones/0005_asistente_uso.sql` |
| Asistente de preguntas | El cliente del SDK recibe todo explícito (no lee variables del entorno), sin registros propios (no quedan preguntas ni respuestas en los logs) y con un reintento como máximo; `ASISTENTE_URL_API_PRUEBA` solo se acepta con `OTEA_E2E=1` (si no, la clave podría viajar a un servidor ajeno); la clave es un canario más del build | `src/lib/asistente/proveedor-anthropic.ts`, `scripts/lib/canarios.mjs` |
| Configuración | `WAITLIST_MODE=cerrada` por defecto; el esquema de entorno rechaza la lista en memoria, una base sin `verify-full` y una URL del sitio que no sea https en producción (se exige al ejecutar, no al construir) | `src/lib/env.ts` |
| Panel `/admin` | Sin credenciales configuradas responde 404. Acceso con frase aleatoria (hash PBKDF2-SHA256 de 600 000 iteraciones) **y** código TOTP de un solo uso (gastado en la base, atómico entre instancias); sin pistas sobre qué falló; 5 intentos por IP y 100 en total cada 15 min por instancia | `src/app/admin/acciones.ts`, `src/lib/admin/` |
| Sesión del panel | Cookie `__Host-` (`Secure`, `HttpOnly`, `SameSite=Strict`) firmada con HMAC-SHA256 y **registrada en la base**: «Salir» la revoca de verdad y falla cerrado si la base no responde; 8 horas; token anti-CSRF ligado a la sesión en cada acción, además de la comprobación de `Origin` de Next.js | `src/lib/admin/sesion.ts`, `acceso.ts`, `almacen.ts` |
| Cuentas de personas usuarias | **Cerradas por omisión** (`CUENTAS_MODO`): las páginas existen y no guardan nada. La cuenta **no existe hasta confirmar el correo** (enlace de un solo uso, 72 h, solo su hash en la base; la contraseña se elige con el enlace) y abrir el enlace no cambia nada: solo el POST. Crear, entrar y «olvidé mi contraseña» **responden igual exista o no el correo**, con tiempo mínimo y una contraseña «señuelo»; las altas repetidas avisan a la persona dueña por correo, como mucho una vez por hora | `src/lib/cuentas/servicio.ts`, `docs/cuentas.md` |
| Cuentas de personas usuarias | **Contraseñas** con scrypt (N = 2^15, r = 8, p = 3, sal propia, semáforo contra el agotamiento de memoria) y política del NIST SP 800-63B: mínimo 12 y máximo 128 caracteres, sin reglas de composición ni caducidad, y se rechazan las comunes (lista local de ~10 400 con sus variantes), repetitivas, secuencias y las que contienen el correo, el nombre o el del sitio. Entrar cuenta los fallos **por IP, por (correo, IP), por correo y por cuenta en la base**: a los 8 de un mismo lugar con un mismo correo en 15 minutos ese lugar no prueba nada más; y a los 100 «puntos» de la cuenta en 15 minutos (el máximo de NIST; el código equivocado de los dos pasos vale 13) tampoco nadie, aunque la contraseña sea la correcta, hasta que restablezca su contraseña por correo o termine la ventana | `clave.ts`, `politica-clave.ts`, `claves-comunes.ts` |
| Cuentas de personas usuarias | **Sesión**: cookie `__Host-otea_sesion` (`Secure`, `HttpOnly`, `SameSite=Lax`) con solo un token al azar; en la base, su hash: «Salir» la revoca de verdad y falla cerrado si la base no responde. 30 días como máximo, 7 sin uso, 10 abiertas a la vez. Toda acción que cambia algo exige la sesión y un **token anti-CSRF** ligado a ella (además de `Origin` de Next.js); las delicadas piden la contraseña de nuevo. Una lista cerrada, vigilada por `arquitectura.test.ts`, fija cuáles acciones y páginas se ven sin sesión | `acceso.ts`, `src/app/acciones/cuenta.ts`, `arquitectura.test.ts` |
| Cuentas de personas usuarias | **Verificación en dos pasos opcional** (TOTP RFC 6238; código QR que dibuja el propio sitio, sin enviar el secreto a ningún servicio), 10 códigos de recuperación (solo su hash; se gastan de forma atómica) y un código de la app que no se puede reutilizar. Los avisos de seguridad (contraseña cambiada, dos pasos activados o desactivados, cuenta eliminada) llegan por correo | `totp-cuenta.ts`, `qr.ts`, `tokens.ts` |
| Cuentas de personas usuarias | **Datos**: correo y secreto de dos pasos **cifrados** (AES-256-GCM con claves derivadas de `CUENTAS_SECRETO` por propósito; el dato asociado liga cada texto a su fila) y búsqueda por índice ciego; sin IP ni agente de usuario; permisos por columna y RLS por operación; la actividad es de solo agregar y se conserva 90 días. La persona puede **descargar** todo (sin secretos) y **eliminar** la cuenta, que se borra en cascada | `cifrado.ts`, `db/migraciones/0006_cuentas.sql` |
| Base de datos | Usuario de la aplicación con permisos mínimos por columna; sin `DELETE` salvo en la lista de espera; la auditoría, las correcciones, las sesiones y los códigos gastados son de solo agregar (permisos **y** disparadores); consultas siempre parametrizadas; ciclo de vida de las alertas validado también en la base | `db/migraciones/`, `scripts/crear-rol-app.mjs`, `src/lib/db/` |
| Base de datos | **Seguridad por fila (RLS)** en las diez tablas (nueve en la migración `0003` y `asistente_uso` en la `0005`): sin política no hay acceso, aunque un `GRANT` agregado por error lo diera. Las inscripciones confirmadas quedan fuera del alcance de la aplicación (no puede cambiarlas ni borrarlas). Una prueba falla si una tabla nueva no activa RLS o si un permiso no tiene política; `db:rol-app` rechaza un usuario con superusuario, `BYPASSRLS` u otros atributos de más | `db/migraciones/0003_seguridad_por_fila.sql`, `src/lib/db/rls.test.ts` |
| Correo | Petición saliente a una dirección fija (`api.resend.com`), con tiempo límite y sin seguir redirecciones; los fallos se registran sin correo ni token. Lo comparten la lista de espera y las cuentas; la plantilla escapa todo y solo admite enlaces https | `src/lib/correo/resend.ts`, `plantilla.ts` |
| Ingesta de metadatos | **Apagada por omisión** (`TAREAS_MODO=inactivo`: `/api/tareas/ingesta` responde 404 a los siete métodos). Solo en el servicio privado `otea-tareas` (IAM + OIDC de Cloud Scheduler y encabezado `X-Otea-Tarea` comparado en tiempo constante, `POST` sin cuerpo). Lee solo las URL exactas de los feeds verificados del registro: https, 443, sin IP ni credenciales, cada redirección (máx. 3) en el dominio de la fuente, 10 s, 1 MB leído en flujo, tipo de contenido, ≥ 2 s por host, `Retry-After`, `robots.txt` y User-Agent con contacto. XML sin DTD ni entidades (XXE, bomba de entidades) y con límites de profundidad y elementos; JSON con profundidad medida antes de analizar. Guarda **solo metadatos**, en tablas de solo agregar con RLS | `src/lib/ingesta/descarga.ts`, `feeds.ts`, `robots.ts`, `src/lib/tareas/exigir.ts`, `db/migraciones/0007_ingesta.sql` |
| Errores | Páginas de error propias que nunca muestran el mensaje del error; la sonda `/api/salud` falla si la configuración es inválida y Cloud Run no envía tráfico a esa revisión | `src/app/error.tsx`, `global-error.tsx`, `src/app/api/salud/route.ts` |
| Contenedor | Imagen multi-etapa sin privilegios (UID 10001), base fijada por digest, sin `.env`, código fuente, `sharp`, mapas de código ni gestores de paquetes (se quitan npm, corepack y yarn de la base: con ellos, el escaneo marcaba 13 hallazgos, uno crítico, en las dependencias que npm empaqueta); sin optimizador de imágenes público; la CI la construye, la prueba y la escanea con Trivy | `Dockerfile`, `.dockerignore`, `next.config.ts` |
| Pruebas | Más de 70 pruebas de navegador en CI, también del panel con una base de datos real: sin errores de consola ni violaciones de CSP, cabeceras, teclado, movimiento reducido, lista de espera (incluida la marca de tiempo), enlaces seguros, sesión revocada al salir, código TOTP no reutilizable y **ninguna respuesta con secretos** | `e2e/` |
| Reglas que se comprueban solas | Pruebas que leen el código: toda acción y página del panel exige sesión, el SQL solo interpola constantes `SQL_…`, ningún componente de navegador importa la base ni la configuración, no hay subida de archivos, `public/` y los SVG son de lista cerrada, y el inventario de Server Actions y endpoints no cambia sin revisión. Reglas de lint: `process.env` solo en `env.ts`, `pg` solo en `src/lib/db`, sin `dangerouslySetInnerHTML` (salvo el JSON-LD fijo y el script de movimiento), `innerHTML`, `eval` ni `document.write` | `src/lib/security/arquitectura.test.ts`, `eslint.config.mjs` |
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
- [x] Cookies: solo dos, ambas técnicas y `__Host-`, `HttpOnly`, `Secure`: la del panel (`SameSite=Strict`) y, si se abren las
      cuentas, la de la sesión de la persona usuaria (`SameSite=Lax`).
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
- [x] SSRF: el sitio público solo sale a direcciones fijas (`https://api.resend.com/emails` y, con la IA del asistente,
      `https://api.anthropic.com`). La ingesta (solo en `otea-tareas`, apagada por omisión) sale únicamente a los feeds
      verificados del registro de fuentes, con tiempo límite, tamaño máximo y cada redirección validada en el dominio de la
      fuente; nunca a URLs que lleguen de usuarios.

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
      correo, con códigos de respaldo fuera de línea (guía paso a paso: `docs/guia-dos-pasos.md`).
- [ ] **Antes de abrir las cuentas de personas usuarias** (`docs/cuentas.md`, `docs/despliegue.md` §12): crear el secreto
      `CUENTAS_SECRETO` (`npm run cuentas:secreto`; Secret Manager cobra unos US$0,06 por versión al mes pasadas las 6
      gratis), repartir los 100 correos diarios de Resend con la lista de espera, revisar los textos legales y probar el
      recorrido con un correo real. **No rotar `CUENTAS_SECRETO`** (falta el script de recifrado).
- [ ] **Antes de activar la IA del asistente** (`docs/asistente-ia.md`): decidir modelo, tope diario y clave; fijar
      el límite de gasto en la consola de Anthropic; confirmar las condiciones de Anthropic y la revisión legal de
      la política de privacidad y de las condiciones de uso. Sin eso, el asistente responde con la base, gratis.
- [ ] Crear en Cloud Monitoring la alerta de intentos de acceso al panel y fijar la retención de
      registros en 30 días (`docs/despliegue.md`).
- [ ] Una prueba de seguridad independiente antes de manejar datos reales de personas.
- [ ] Renovar `Expires` de `security.txt` antes del 2027-04-01.

### Decisiones y riesgos conocidos

- **Cuentas de personas usuarias: cerradas y con límites conocidos** (`docs/cuentas.md` §9 y §12). Se aceptan: el **bloqueo
  dirigido** (quien conozca un correo y disponga de al menos 13 IP puede dejar esa cuenta sin entrar durante 15 minutos por
  vez; un solo lugar solo se bloquea a sí mismo, y «Olvidé mi contraseña» lo borra; es mejor que dejar pasar la fuerza bruta),
  el **agotamiento de los topes globales** con muchas IP, la **ausencia de recuperación asistida** (sin la app ni los códigos de recuperación no hay vuelta
  atrás: no hay cambio de correo ni soporte humano en esta versión), que **la dirección con el token de un enlace de correo
  queda en los registros de solicitudes de Cloud Run** (por eso vencen pronto y se gastan; los ve solo el equipo propietario) y
  que la lista de contraseñas comunes es local (no consulta bases de contraseñas filtradas: eso sería otra llamada saliente).

- **Asistente con IA: opcional y apagado.** Es el único servicio de pago posible (CLAUDE.md, regla 1). Por omisión
  responde con las preguntas frecuentes, sin llamar a nadie. Riesgos y cómo se acotan: _inyección de instrucciones_
  (políticas léxicas antes del modelo, modelo sin herramientas ni secretos, salida revisada), _filtración de datos
  personales a un proveedor_ (las preguntas con datos personales no se envían; la política lo dice), _gasto
  descontrolado_ (tope diario en la base, cupo por persona y límites por IP, más el límite de la consola de
  Anthropic, que es la barrera final y la fija la persona responsable) y _respuestas equivocadas_ (se ve la
  etiqueta «Respuesta con IA», se ofrece la fuente y la salida no puede recomendar ni citar cifras ajenas). **Límite
  conocido:** la integración con la API real de Anthropic se probó solo contra un servidor falso; la prueba con la
  API real existe (`npm run asistente:probar`) pero la corre la persona responsable, porque gasta dinero.

- **El repositorio es público** (`gstadd285/awesome-repos`, un fork de una lista pública): cualquiera puede leer el
  código, las migraciones y estos documentos. Por eso no hay secretos en él (el escáner revisa también el
  historial) y la seguridad no se apoya en ocultar el código. _Secret scanning_ y _Push protection_ son gratis en
  repositorios públicos pero hay que activarlos (hoy la API responde que no están habilitados); si el
  repositorio pasara a privado, requerirían GitHub Secret Protection (de pago, a decidir): el escáner de la CI es
  la alternativa gratuita.
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
