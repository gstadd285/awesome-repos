# Plan de los 20 controles de seguridad · Otea Austral

| | |
|---|---|
| Origen | Lista de 20 controles de seguridad para aplicaciones web que compartió la persona responsable (imagen de un video), de «Ocultar API keys» a «Escanear dependencias» |
| Fecha del plan | 2026-10-10 |
| Cómo se hizo | Cada control se cruzó con el **código real** del repositorio (no con la memoria de lo hecho antes): lectura de los archivos de seguridad, búsqueda de patrones peligrosos y las 296 pruebas de partida (todas pasan; auditoría de producción sin vulnerabilidades) |
| Alcance | Solo `otea-austral/` y su CI. Es una autoevaluación asistida por IA: **no es una certificación ni sustituye** a una prueba de seguridad independiente |

La lista viene del mundo de las apps con base de datos «en el navegador» (por ejemplo, Supabase). Otea
Austral tiene otra arquitectura: **el navegador nunca habla con la base de datos**, todo pasa por el
servidor. Por eso algunos puntos (3, 4, 7) se traducen a su equivalente real en vez de aplicarse al pie de
la letra, y se explica cómo.

## Leyenda

- ✅ **Cubierto**: ya existe y tiene pruebas. Se refuerza con una guarda automática si hace falta.
- 🟡 **Parcial**: existe, pero con un hueco concreto que se cierra en este plan.
- 🔴 **Brecha**: no existía; se implementa.
- ⚪ **No aplica tal cual**: el riesgo no existe en esta arquitectura; se documenta el equivalente.

## Resumen

| # | Control | Estado de partida | Qué se hace | Fase |
|---|---|---|---|---|
| 1 | Ocultar API keys | ✅ | Prueba de «canarios»: se construye con secretos falsos y se comprueba que no quedan en el resultado; `server-only` en la configuración | A |
| 2 | Eliminar secretos de Git | 🟡 | Escáner de secretos sobre el árbol y todo el historial, en CI; revisión del historial actual | A |
| 3 | Key pública para la base de datos | ⚪ | La frontera cliente/servidor se vigila con una prueba; el equivalente (usuario de mínimos privilegios) ya existe | A |
| 4 | Row-Level Security | 🔴 | Migración `0003`: RLS activada en todas las tablas con políticas por operación; prueba de que toda tabla nueva la lleve | B2 |
| 5 | Encriptar datos sensibles | 🟡 | Correos de la lista de espera cifrados (AES-256-GCM) con índice ciego; la aplicación escribe pero **no puede leerlos** | B3 |
| 6 | Forzar la autenticación | ✅ | Prueba que falla si una página o acción del panel no exige sesión | A |
| 7 | Restringir el acceso a registros | 🟡 | RLS (B2), la aplicación sin lectura de correos (B3) y prueba de que lo no publicado nunca sale al público | A, B2, B3 |
| 8 | Bloquear manipulación de campos | ✅ | Pruebas con campos de más en los formularios y escrituras prohibidas en la base | A |
| 9 | Proteger las cookies de sesión | ✅ | Prueba unitaria de los atributos de la cookie | A |
| 10 | Hashear contraseñas | ✅ | Sin cambios de código; decisión sobre PBKDF2 documentada | — |
| 11 | Rate limiting | 🟡 | Límite también en la confirmación de inscripción | B1 |
| 12 | Protección contra bots | 🟡 | Trampa de tiempo firmada (además del campo trampa); el desafío tipo CAPTCHA queda como decisión de la persona responsable | B1 |
| 13 | Parametrizar queries | ✅ | Prueba que falla si aparece SQL armado con datos de entrada | A |
| 14 | Validar inputs | ✅ | Tamaño máximo de los cuerpos de las Server Actions | A |
| 15 | Sanitizar contenido | ✅ | Regla de lint contra `dangerouslySetInnerHTML` e `innerHTML` fuera de lo permitido | A |
| 16 | Restringir archivos | ⚪ | Lista cerrada de lo que puede haber en `public/`, sin mapas de código, alarma si alguien agrega subidas | A |
| 17 | Devolver solo los datos necesarios | ✅ | Pruebas de contrato de lo que sale al público | A |
| 18 | Security headers | ✅ | Dos cabeceras más y prueba unitaria del conjunto completo | A |
| 19 | Forzar HTTPS | 🟡 | Redirección http → https dentro de la aplicación | B1 |
| 20 | Escanear dependencias | 🟡 | Escaneo de la imagen del contenedor y de la auditoría de desarrollo en CI | B4 |

## Orden de trabajo

| Fase | Contenido | Criterio de «hecho» |
|---|---|---|
| **A** · Guardas y escaneo | Controles 1, 2, 3, 6, 8, 9, 13, 14, 15, 16, 17, 18 | Pruebas nuevas en verde, CI con el escáner de secretos y la prueba de canarios |
| **B1** · Comportamiento | Controles 11, 12, 19 | Pruebas unitarias y de navegador; la CI del contenedor comprueba la redirección |
| **B2** · Base de datos | Controles 4 y 7 | Migración idempotente; las pruebas de integración existentes siguen en verde con RLS activa |
| **B3** · Cifrado | Control 5 | Migración, cifrado probado contra Postgres real, el usuario de la aplicación no puede leer los correos |
| **B4** · Cadena de suministro | Control 20 | La CI escanea la imagen y no admite hallazgos altos con corrección disponible |
| **C** · Cierre | Documentación, verificación completa, informe | Lint, tipos, pruebas, e2e, build y CI en verde; informe entregado |

Cada fase termina con sus pruebas y un commit en la rama del [PR #2](https://github.com/gstadd285/awesome-repos/pull/2).
Una fase no se da por cerrada si rompe pruebas anteriores.

## Detalle por control

### 1 · Ocultar API keys

- **Qué significa:** que ninguna clave o secreto llegue al navegador ni quede dentro de la imagen.
- **Hoy:** `src/lib/env.ts` lee los secretos solo en el servidor; la única variable pública es
  `NEXT_PUBLIC_SITE_URL`; en producción los secretos van en Secret Manager; `.dockerignore` excluye `.env*`.
- **Se hará:** `import "server-only"` en la configuración y en el cliente de la base (el build falla si un
  componente de navegador los importa); regla de lint que limita `process.env`; un script construye con
  secretos falsos reconocibles y falla si alguno aparece en `.next/` (y por tanto en la imagen).

### 2 · Eliminar secretos de Git

- **Qué significa:** que no haya claves en el repositorio ni en su historial.
- **Hoy:** `.gitignore` ignora `.env*` y `*.pem`; las reglas del proyecto prohíben secretos. No había ningún
  escáner automático ni una revisión del historial.
- **Se hará:** `scripts/escanear-secretos.mjs` (patrones de alta señal: claves de proveedores, llaves
  privadas, URLs de base con contraseña, asignaciones sospechosas) sobre el árbol y todo el historial de
  git, con pruebas, ejecutado en CI; revisión del historial actual; receta de «secreto filtrado».
- **Lo que solo puede hacer la persona responsable:** activar _Secret scanning_ y _Push protection_ en
  GitHub (Settings → Code security).

### 3 · Key pública para la base de datos

- **Qué significa:** en apps donde el navegador consulta la base, usar una clave pública de permisos
  limitados y nunca la de administrador.
- **Hoy:** el navegador no tiene ningún camino a la base. El servidor entra con `otea_web`, miembro de
  `otea_app` (permisos por columna, sin `DELETE` salvo en la lista de espera), nunca con el dueño.
- **Se hará:** una prueba que recorre los componentes de cliente (`"use client"`) y falla si importan la
  base, la configuración del servidor o los módulos del panel; `pg` confinado por lint a `src/lib/db/`.

### 4 · Row-Level Security

- **Qué significa:** que la propia base decida qué filas puede leer o escribir cada rol, aunque la
  aplicación tenga un error.
- **Hoy:** permisos por columna y disparadores, pero ninguna tabla tenía RLS.
- **Se hará:** migración `0003` con RLS en las ocho tablas y una política por operación permitida (sin
  política = denegado, también para un `GRANT` añadido por error); filas confirmadas de la lista de espera
  no borrables por la aplicación. Una prueba falla si una tabla nueva no activa RLS y otra si el usuario de
  la aplicación pudiera saltarse RLS.
- **Cuidado técnico:** `INSERT … ON CONFLICT` y `RETURNING` interactúan con las políticas; las pruebas de
  integración existentes con Postgres real son la red de seguridad.

### 5 · Encriptar datos sensibles

- **Qué significa:** que un volcado o una copia de la base no exponga datos personales.
- **Hoy:** TLS verificado hasta la base, la frase del panel y los tokens se guardan solo como hash. Los
  correos de la lista de espera estaban **en claro** en la base (el proveedor cifra el disco, pero cualquiera
  con acceso a la base o a una copia los vería).
- **Se hará:** correo cifrado con AES-256-GCM e **índice ciego** (HMAC-SHA256) para detectar repetidos sin
  descifrar; la clave vive en Secret Manager. El usuario de la aplicación solo puede escribir: **no tiene
  permiso para leer** los correos cifrados. El dueño los exporta con un script al lanzar. Migración `0004`
  (se niega a correr si hay filas sin cifrar, para no perder datos).

### 6 · Forzar la autenticación

- **Hoy:** toda página del panel llama a `exigirSesion()` y toda Server Action a `exigirAccionAdmin()`;
  sin credenciales configuradas el panel responde 404.
- **Se hará:** una prueba que lee el código y falla si aparece una página o acción del panel sin esas
  llamadas (la única excepción, el inicio de sesión, queda en una lista explícita).

### 7 · Restringir el acceso a registros

- **Hoy:** el listado público filtra por estado (`publicada`, `corregida`, `retractada`); los borradores solo
  los ve el panel. La aplicación podía leer todos los correos de la lista de espera.
- **Se hará:** RLS (4), lectura de correos eliminada (5) y una prueba de integración de que un borrador o una
  alerta en revisión nunca sale del listado público.

### 8 · Bloquear manipulación de campos

- **Qué significa:** que quien envía un formulario no pueda cambiar campos que no debe (el estado, la
  versión, quién revisó, la confianza).
- **Hoy:** los formularios leen campo por campo; los esquemas son estrictos; la base solo deja escribir las
  columnas con permiso y los disparadores protegen campos inmutables.
- **Se hará:** pruebas que envían campos de más y comprueban que se ignoran, y que la base rechaza escribir
  columnas no autorizadas.

### 9 · Proteger las cookies de sesión

- **Hoy:** `__Host-otea_admin`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, firmada con HMAC y
  registrada en la base (revocable); 8 horas; token anti-CSRF ligado a la sesión.
- **Se hará:** prueba unitaria de los atributos exactos de la cookie, para que un cambio accidental falle.

### 10 · Hashear contraseñas

- **Hoy:** la frase del panel se guarda como PBKDF2-SHA256 con 600 000 iteraciones (mínimo de OWASP) y sal
  única; la frase la genera el sistema con ≈ 124 bits de entropía; comparación en tiempo constante.
- **Decisión:** no se cambia a Argon2id. Node 22 no lo trae de serie, añadir un módulo nativo aumenta la
  cadena de suministro, y con una frase aleatoria de 124 bits la fortaleza la da la frase, no el algoritmo.
  Si algún día hay cuentas de personas con contraseñas elegidas por ellas, se reabre.

### 11 · Rate limiting

- **Hoy:** límites por IP y globales en la lista de espera, el acceso al panel y los reportes de CSP; tope
  diario de correos contado en la base.
- **Se hará:** límite por IP también en la confirmación de inscripción.
- **No se hará (con motivo):** un límite global por IP para todo el sitio. Cada solicitud ya llegó a la
  aplicación y gastó cómputo; frenar el abuso masivo es trabajo de la plataforma (`maxScale` de Cloud Run y
  la alerta de presupuesto; Cloud Armor es de pago).
- **Límite conocido:** los contadores en memoria valen por instancia (ver `SECURITY.md`).

### 12 · Protección contra bots

- **Hoy:** campo trampa, límites, tope diario y respuesta idéntica exista o no el correo.
- **Se hará:** trampa de tiempo firmada: el formulario lleva una marca de tiempo con HMAC; un envío
  demasiado rápido, sin marca o con marca falsa se descarta sin delatarlo.
- **Decisión de la persona responsable:** un desafío tipo CAPTCHA (por ejemplo, Cloudflare Turnstile) es
  gratuito pero mete a un tercero en la página y exige cambiar la CSP y la política de privacidad. No se
  añade sin su aprobación.

### 13 · Parametrizar queries

- **Hoy:** las 28 consultas usan `$1…`; las únicas interpolaciones son fragmentos SQL constantes.
- **Se hará:** una prueba que falla si una consulta interpola algo que no sea una constante `SQL_…`.

### 14 · Validar inputs

- **Hoy:** Zod en cada borde (lista de espera, panel, reportes de CSP, entorno, URLs).
- **Se hará:** límite de tamaño para los cuerpos de las Server Actions (todos los formularios son pequeños).

### 15 · Sanitizar contenido

- **Hoy:** React escapa todo el texto; el único `dangerouslySetInnerHTML` es el JSON-LD fijo con `<`
  escapado; el HTML del correo escapa el enlace; CSP con nonce.
- **Se hará:** regla de lint `react/no-danger` e `innerHTML` prohibidos, con una única excepción justificada.

### 16 · Restringir archivos

- **Hoy:** el sitio no tiene subida de archivos; `public/` solo tiene logos e íconos; la imagen no lleva
  código fuente ni `.env`.
- **Se hará:** una prueba con la lista cerrada de extensiones y carpetas de `public/`; otra que falla si
  aparece un campo `type="file"` o un manejo de archivos subidos (obliga a hacer antes una revisión de
  seguridad); comprobación de que el build no publica mapas de código.

### 17 · Devolver solo los datos necesarios

- **Hoy:** `/api/salud` devuelve `{"estado":"ok"}`; las Server Actions devuelven estados, nunca datos de
  otras personas; las páginas de error no muestran el mensaje.
- **Se hará:** pruebas de contrato: la vista pública de una alerta tiene exactamente los campos esperados.

### 18 · Security headers

- **Hoy:** CSP estricta con nonce y reportes, HSTS de 2 años, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options`, COOP y CORP, sin `X-Powered-By`.
- **Se hará:** `X-Permitted-Cross-Domain-Policies` y `Origin-Agent-Cluster`; prueba unitaria del conjunto.

### 19 · Forzar HTTPS

- **Hoy:** HSTS, `upgrade-insecure-requests`, base de datos con `verify-full`, URL del sitio obligatoria en
  https, cookie `Secure`.
- **Se hará:** si la solicitud llega por http (según `X-Forwarded-Proto`), la aplicación responde 308 al
  mismo camino en https del dominio configurado. La sonda de Cloud Run no se ve afectada.
- **Pendiente de dominio:** HSTS `preload` hasta comprar el dominio definitivo.

### 20 · Escanear dependencias

- **Hoy:** `npm audit` de producción bloqueante (0 vulnerabilidades), firmas del registro, SBOM,
  Dependabot (npm, acciones y Docker), versiones exactas.
- **Se hará:** escaneo de la imagen del contenedor en CI, y revisar la auditoría de desarrollo (hay cinco
  avisos altos de `eslint-config-next`) para corregirla o justificarla.
- **Lo que solo puede hacer la persona responsable:** activar _Dependabot alerts_ y _Dependabot security
  updates_ en GitHub.

## Decisiones y acciones que no son de código

| Qué | Quién | Por qué |
|---|---|---|
| Activar _Secret scanning_ y _Push protection_ en GitHub | Persona responsable | Segunda barrera contra secretos; gratis en repositorios públicos |
| Activar _Dependabot alerts_ y _security updates_ | Persona responsable | Avisos automáticos de dependencias |
| Decidir si se añade un desafío tipo CAPTCHA | Persona responsable | Introduce un tercero y cambia la política de privacidad |
| Comprar el dominio y activar HSTS `preload` | Persona responsable | `preload` es difícil de revertir |
| Prueba de seguridad independiente | Persona responsable | Esta revisión es asistida por IA |

## Resultado

Fase A (`c9b88e5`), B1 (`9352bf3`), B2 (`5d7c4c3`), B3 (`2c701ff`) y B4 (`522da0c`) están integradas en el
[PR #2](https://github.com/gstadd285/awesome-repos/pull/2). Pruebas: de 296 a **448** unitarias y de
integración (con Postgres real) y de 53 a **74** de navegador, todas en verde, con lint, tipos y build.

| # | Control | Resultado | Evidencia principal |
|---|---|---|---|
| 1 | Ocultar API keys | ✅ Reforzado | `server-only`, regla de lint sobre `process.env`, `npm run seguridad:canarios`, `e2e/admin-secretos.spec.ts` (ninguna respuesta contiene secretos) |
| 2 | Eliminar secretos de Git | ✅ Aplicado (historial limpio) · 🟡 activar _Secret scanning_ y _Push protection_ en GitHub | `scripts/escanear-secretos.mjs` en la CI (archivos e historial), receta de «secreto en git» |
| 3 | Key pública para la base de datos | ⚪ Equivalente cubierto y vigilado | `arquitectura.test.ts` (frontera cliente/servidor), regla de lint sobre `pg`, usuario `otea_web` de mínimos privilegios |
| 4 | Row-Level Security | ✅ Aplicado | `db/migraciones/0003_seguridad_por_fila.sql`, `src/lib/db/rls.test.ts` (verificado por mutación) |
| 5 | Encriptar datos sensibles | ✅ Aplicado | `db/migraciones/0004_correos_cifrados.sql`, `src/lib/waitlist/cifrado.ts`, `lista:exportar` y `lista:recifrar` |
| 6 | Forzar la autenticación | ✅ Reforzado | `arquitectura.test.ts` (acciones y páginas del panel) |
| 7 | Restringir el acceso a registros | ✅ Aplicado | RLS, la aplicación sin lectura de correos, prueba de que lo no publicado no sale al público |
| 8 | Bloquear manipulación de campos | ✅ Reforzado | `formulario.test.ts` y `repositorio.test.ts` (campos de más, escrituras prohibidas) |
| 9 | Proteger las cookies de sesión | ✅ Reforzado | `admin.test.ts` (atributos de la cookie, duración ≤ 12 h como la base) |
| 10 | Hashear contraseñas | ✅ Sin cambios de código (decisión documentada) | `admin.test.ts` (entropía de la frase, mínimo de iteraciones) |
| 11 | Rate limiting | 🟡 Aplicado en la confirmación; límites por instancia, sin límite global (decisión) | `service.ts`, `SECURITY.md` |
| 12 | Protección contra bots | 🟡 Marca de tiempo firmada aplicada; CAPTCHA pendiente de decisión | `src/lib/waitlist/tiempo.ts`, `e2e/lista-de-espera.spec.ts` |
| 13 | Parametrizar queries | ✅ Reforzado | `arquitectura.test.ts` (verificado con SQL malo a propósito) |
| 14 | Validar inputs | ✅ Reforzado | Tope de 100 KB en las Server Actions (`next.config.ts`) |
| 15 | Sanitizar contenido | ✅ Reforzado | Reglas de lint (`react/no-danger`, `innerHTML`, `eval`, `document.write`) y prueba del JSON-LD |
| 16 | Restringir archivos | ✅ Reforzado | `public/` y SVG de lista cerrada, sin subidas, sin mapas de código ni gestores de paquetes en la imagen |
| 17 | Devolver solo los datos necesarios | ✅ Reforzado | Prueba de contrato de la vista pública; pruebas de secretos en respuestas |
| 18 | Security headers | ✅ Reforzado | `headers.test.ts`, +2 cabeceras, panel sin caché (e2e) |
| 19 | Forzar HTTPS | ✅ Aplicado · 🟡 probar en una revisión sin tráfico al desplegar | `src/lib/security/https.ts`, `src/proxy.ts`, pasos de la CI del contenedor |
| 20 | Escanear dependencias | ✅ Aplicado | `scripts/auditar-dependencias.mjs`, Trivy en la CI, `.npmrc` con `ignore-scripts` |

### Lo que encontró el trabajo (además de lo planeado)

- La imagen del contenedor llevaba **npm, yarn y corepack con 13 hallazgos, uno crítico** (`tar`), en las
  dependencias que npm empaqueta. Ya no los lleva.
- Un `UPDATE` o `DELETE` bloqueado por RLS **no falla: afecta 0 filas**. Un `UPDATE … RETURNING` falla si la fila
  nueva no pasa la política de lectura. Las pruebas con la base real lo cubren (ver `CLAUDE.md`).
- El servidor de Next.js **añade** `X-Forwarded-Proto` según la conexión cuando falta: una petición http directa al
  contenedor también se redirige. Por eso existe el interruptor `HTTPS_FORZADO=0` y la prueba con una revisión
  sin tráfico.
- Postgres limita los cuantificadores de las expresiones regulares a 255: la restricción del texto cifrado
  comprueba el largo aparte.

### Lo que sigue pendiente (no es código)

Ver la tabla de «Decisiones y acciones que no son de código» más arriba y `SECURITY.md`.
