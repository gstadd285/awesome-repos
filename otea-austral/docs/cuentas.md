# Cuentas de personas usuarias

Diseño, modelo de amenazas y operación de las cuentas (crear cuenta, entrar, contraseñas, verificación en dos pasos,
sesiones, descarga y eliminación de datos). Para la persona responsable: la sección [«Abrir las cuentas»](#abrir-las-cuentas)
y las [decisiones pendientes](#decisiones-y-límites) son las que piden una acción suya.

## 1. Estado

- **Implementado y probado, pero cerrado por omisión.** Con `CUENTAS_MODO=cerradas` (el valor por omisión) las páginas
  existen, explican que «las cuentas abren junto con el lanzamiento» y **no guardan nada**; la cabecera y el pie no
  ofrecen entrar. Hasta que la persona responsable las abra (ver abajo) no hay cuentas, secretos nuevos ni correos.
- Los textos legales que las acompañan (privacidad y condiciones de uso) son **provisionales**, pendientes de revisión
  legal. La versión que acepta la persona se guarda con su cuenta (`VERSION_TEXTOS`).
- No se probó con el Resend real (solo contra un servidor que imita su API) ni con una persona experta externa. Hubo una
  revisión adversarial independiente del código (ver la adenda «cuentas de personas usuarias» de `docs/seguridad/auditoria-owasp-2025.md`: qué encontró, qué se corrigió y qué se aceptó).

Alcance de esta primera versión: crear cuenta con correo verificado, entrar y salir, contraseña (cambiar y recuperar),
perfil (nombre, temas, preferencia del resumen), verificación en dos pasos opcional con códigos de recuperación, lista de
sesiones con cierre a distancia, actividad reciente, descarga de los datos y eliminación de la cuenta.
**Fuera de alcance:** cambiar el correo, entrar con Google u otro proveedor, recuperar una cuenta sin acceso al correo,
cuentas de equipo, y avisos personalizados (las alertas por tema llegan cuando se abra el servicio).

## 2. Páginas

| Ruta | Qué hace | Sesión |
|---|---|---|
| `/cuenta/crear` | Paso 1: correo y dos casillas (condiciones y privacidad). Envía el enlace de confirmación | No |
| `/cuenta/activar?token=` | Paso 2: con el enlace del correo se elige la contraseña, se crea la cuenta y se entra | No (token) |
| `/cuenta/entrar` | Correo y contraseña | No |
| `/cuenta/verificar` | Segundo paso al entrar (código de la app o de recuperación) | Sesión «a medias» |
| `/cuenta/olvide`, `/cuenta/restablecer?token=` | Pedir el enlace y elegir una contraseña nueva | No (token) |
| `/cuenta` | Perfil: nombre, temas, resumen previo a la apertura | Sí |
| `/cuenta/seguridad` | Contraseña, verificación en dos pasos, sesiones, actividad | Sí |
| `/cuenta/datos` | Qué se guarda, descarga y eliminación | Sí |
| `/cuenta/exportar` | `GET`: descarga JSON (`attachment`, `no-store`; rechaza `Sec-Fetch-Site: cross-site`) | Sí |
| `/cuenta/eliminada` | Despedida | No |

Todas llevan `noindex` (etiqueta y `X-Robots-Tag`), `Cache-Control: no-store` y figuran en `Disallow` de `robots.txt`.
Las dos que se abren con un token en la dirección (`activar`, `restablecer`) además responden `Referrer-Policy: strict-origin`: entregan el origen del sitio y nunca la dirección con el token. (No es `no-referrer`: con esa política el navegador manda `Origin: null` al enviar un formulario sin JavaScript y Next.js lo rechaza.)
El inventario de Server Actions (`src/app/acciones/cuenta.ts`) y de rutas HTTP (`/cuenta/exportar`) está fijado en
`src/lib/security/arquitectura.test.ts`, que además exige que **toda acción que cambia algo pase por `exigirAccionCuenta`**
(sesión + token anti-CSRF) y que toda página privada llame a `exigirSesionCuenta`.

## 3. Recorridos

**Crear la cuenta (dos pasos).** Dejar el correo no crea nada: se guarda solo el correo cifrado con un enlace de un solo uso
(hash del token, vence a las 72 horas) y se envía el correo. Abrir el enlace solo muestra el formulario (los antivirus de
correo que visitan enlaces no activan nada); al **enviar** la contraseña (POST) se crea la cuenta, se aceptan los textos y
se abre la sesión. Así nadie puede abrir una cuenta con el correo de otra persona y quedarse con la contraseña. Si ya hay una
cuenta con ese correo, la respuesta en pantalla es la misma y a la persona dueña se le avisa por correo (como mucho una vez por
hora) sin ningún enlace de alta.

**Entrar.** Correo y contraseña; si la cuenta tiene la verificación en dos pasos, la contraseña correcta abre una sesión
«pendiente» (10 minutos, no sirve para nada más) y falta el código. Entrar de nuevo cierra la sesión que hubiera en ese
navegador. Un código de recuperación gastado deja una línea en la actividad de la cuenta y manda a «Seguridad».

**Contraseña olvidada.** Se responde lo mismo exista o no la cuenta. El enlace vale 1 hora y una vez; al cambiarla se cierran
todas las sesiones y se avisa por correo. **Cambiarla** desde «Seguridad» pide la actual (y el código, si hay dos pasos), cierra
las demás sesiones y deja la actual.

**Verificación en dos pasos (TOTP, RFC 6238).** Pide la contraseña, genera un secreto de 160 bits (se guarda cifrado como
«pendiente») y lo muestra como código QR **y** escrito; se activa al confirmar con el primer código de la app, y entonces entrega
10 códigos de recuperación (una sola vez, solo se guarda su hash). Un código de la app no se puede reutilizar
(`totp_ultimo_paso`). Regenerar los códigos y desactivar piden contraseña y un código. El código QR lo dibuja el propio sitio
(`src/lib/cuentas/qr.ts`, sin dependencias ni servicios externos: **el secreto nunca sale a un generador de terceros**).

**Sesiones.** Lista con navegador y sistema aproximados y fechas (sin IP ni agente completo), «Cerrar» en cada una y «Cerrar todas
las demás». **Descargar mis datos** entrega todo lo que se guarda (sin la contraseña, el secreto de dos pasos ni los códigos).
**Eliminar la cuenta** pide contraseña (y código), una casilla de confirmación y borra la cuenta y todo lo que depende de ella
(cascada de la base); se envía un correo de confirmación.

## 4. Qué se guarda (migración `0006_cuentas.sql`)

| Tabla | Contenido | Notas |
|---|---|---|
| `cuentas` | correo **cifrado** + índice ciego, nombre, hash de la contraseña, secreto TOTP **cifrado** (activo y pendiente), temas, preferencia, versión y fecha de lo que aceptó, contadores de fallos | Sin IP ni agente de usuario. El correo y la fecha de creación no tienen permiso de escritura |
| `cuenta_tokens` | hash del token, propósito (`alta`·`restablecer`), correo cifrado (solo `alta`) | Un enlace pendiente por correo y por cuenta; los de alta sin confirmar se borran a los 7 días |
| `cuenta_sesiones` | hash del token de la cookie, fase (`pendiente`·`activa`), fechas, etiqueta del dispositivo | La base no admite más de 31 días |
| `cuenta_codigos` | hash de cada código de recuperación y si se usó | |
| `cuenta_eventos` | tipo y fecha (alta, acceso, cambios de contraseña, dos pasos, códigos…) | Solo agregar (disparador); se conserva 90 días |
| `cuentas_envios_diarios` | cuántos correos de cuentas se enviaron cada día (hora de Chile) | Solo crece (disparador `OT010`); sin borrado |

El usuario de la aplicación (`otea_app`) tiene permisos **por columna** y seguridad por fila con una política por operación
(`src/lib/db/rls.test.ts` falla si falta alguna). Las consultas son siempre parametrizadas.

## 5. Criptografía y secretos

- **`CUENTAS_SECRETO`** (256 bits, `npm run cuentas:secreto`, en Secret Manager; distinto de `WAITLIST_SECRETO` y del secreto de la
  sesión del panel: `env.ts` lo exige). De él salen, con HKDF-SHA256 y un propósito distinto cada vez, cinco claves
  independientes: `correo-cifrado`, `correo-indice`, `totp`, `csrf` y `tiempo` (la marca de tiempo del formulario).
- **Correo**: AES-256-GCM (IV aleatorio de 96 bits; dato asociado = índice del correo) y búsqueda por **índice ciego** (HMAC-SHA256
  del correo normalizado). A diferencia de la lista de espera, aquí la aplicación **sí** puede descifrarlo: envía avisos de
  seguridad y lo muestra en el perfil.
- **Secreto TOTP**: AES-256-GCM con el id de la cuenta como dato asociado (un texto copiado a otra fila no se abre).
- **Contraseñas**: scrypt (N = 2^15, r = 8, p = 3; sal de 16 bytes; NFKC). Node no trae Argon2id; scrypt es la segunda opción de OWASP.
  Cada hash lleva sus parámetros y se renueva solo al entrar si se suben. Un semáforo deja hacer 2 a la vez (cola de 24): si no
  cabe, responde «inténtalo en un momento» en vez de acumular memoria.
- **Tokens** (enlaces de correo y cookie): 32 bytes al azar (`randomBytes`) en base64url; en la base solo su SHA-256.
- **Token anti-CSRF**: HMAC del hash de la sesión; se compara en tiempo constante.

## 6. Contraseñas

Sigue el NIST SP 800-63B: **sin reglas de composición ni caducidad**, mínimo 12 caracteres y máximo 128, y se rechaza lo que
cualquiera probaría primero: contraseñas comunes (lista local de unas 10 400, con las variantes típicas: sin tildes, números
o símbolos al borde, sustituciones como `@`→`a`), repeticiones («aaaaaaaaaaaa»), secuencias («123456789012», «qwertyuiop»), y
las que contienen el correo, el nombre o el del sitio. La lista sale de las 10 000 más usadas de **zxcvbn 4.4.2** (Dropbox, MIT;
aviso en `AVISOS-DE-TERCEROS.md`), más las de 12 o más caracteres de sus 30 000, y una lista propia de palabras de Chile y
Latinoamérica. Se genera con `scripts/generar-claves-comunes.mjs` (reproducible: el `.tgz` se verifica con la integridad que
publica npm). **Es una lista local: no equivale a consultar una base de contraseñas filtradas** (como Pwned Passwords, que habría
que enviar a un tercero o descargar entera; queda como mejora posible).

## 7. Sesión y cookie

`__Host-otea_sesion`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y sin `Domain`; contiene solo un token al azar (el servidor
busca su hash en la base, así que **salir revoca de verdad**). Dura 30 días como máximo y se cierra a los 7 días sin uso; hay
como mucho 10 abiertas por cuenta (se cierran las más antiguas). `Lax` y no `Strict`: quien llega desde un enlace de un correo
entra con su sesión puesta; nada que cambie datos se hace con `GET`, toda acción pasa por la comprobación de `Origin` de Next.js y
por el token anti-CSRF del formulario.

## 8. Defensas contra el abuso

- **Sin enumeración de cuentas**: crear, entrar y olvidar responden igual exista o no el correo; las respuestas que pasan por la
  base tardan al menos 1,2 s y una contraseña «señuelo» gasta el mismo trabajo cuando no hay cuenta.
- **Intentos de entrar.** Cada intento se cuenta, acierte o no, y los topes son los mismos para un correo con cuenta y uno sin ella.
  En memoria (cada instancia por separado; la IP es una huella SHA-256 que no se guarda): por IP 10 en 15 min y 600 en total; **por
  (correo, IP) 8 en 15 min**, que frena a quien insiste con un correo y no a la dueña de la cuenta que entra desde otro lugar; y
  por correo desde todas las IP, 100 en 15 min. **Por cuenta, en la base** (común a todas las instancias): **100 «puntos» en 15 min**,
  que es el máximo que admite NIST SP 800-63B. Una contraseña equivocada gasta 1 punto y un código equivocado del segundo paso, 13
  (caben 8 por ventana). Pasado el tope no se prueba nada más hasta que termina la ventana, **aunque la contraseña sea la correcta**;
  pero **restablecer la contraseña con el enlace del correo lo borra**, así que quien quede bloqueada tiene salida. Con dos pasos,
  volver a entrar con la contraseña no reinicia el contador: se borra al pasar el segundo paso.
- **Por qué el tope por cuenta es alto.** Uno bajo (como 8) le regala a cualquiera que sepa un correo el poder de dejar a esa persona
  sin entrar, una y otra vez, desde cualquier lugar. El freno fino va por (correo, IP) y recae en quien prueba; el de la cuenta solo
  acota lo que logra repartirse entre muchas IP.
- **Correos**: campo trampa, marca de tiempo firmada (no antes de 3 s ni después de su vencimiento), 5 pedidos de alta cada 10 min
  y 5 de restablecimiento por hora por IP, tope global, **tope diario en la base** (`CUENTAS_ENVIOS_DIARIOS`, 20 por omisión) y
  un solo enlace pendiente por correo. De ese tope diario, **las altas (y el aviso a quien ya tiene la cuenta) pueden usar el 60 %**;
  el resto queda para restablecer contraseñas y avisos de seguridad: llenar el cupo desde fuera no deja a nadie sin su correo de
  recuperación.
- **Acciones delicadas** (cambiar la contraseña, dos pasos, códigos, eliminar) piden la contraseña de nuevo y el código si hay dos
  pasos, aunque la sesión sea válida.
- **Lo que no se registra**: ningún token, contraseña, código ni correo llega a un registro (`logSecurityEvent` solo recibe
  etiquetas; `log.test.ts` y `arquitectura.test.ts` lo vigilan).

## 9. Modelo de amenazas

| Amenaza | Defensa | Riesgo que queda |
|---|---|---|
| Abrir una cuenta con el correo de otra persona | La cuenta no existe hasta confirmar el correo; la contraseña se elige con el enlace | — |
| Averiguar quién tiene cuenta | Respuestas iguales, tiempo mínimo, señuelo, índice ciego | Canales laterales muy finos (microsegundos) no se midieron |
| Fuerza bruta y relleno de credenciales | Límites por IP, por (correo, IP), por correo y por cuenta; scrypt; lista de contraseñas comunes; sin reglas absurdas | Pruebas repartidas entre muchas IP: hasta 100 puntos por cuenta cada 15 min (unas 9 600 al día) contra contraseñas de 12 o más caracteres que no están en la lista de comunes |
| **Bloqueo dirigido**: dejar sin entrar a alguien cuyo correo se conoce | El freno fino es por (correo, IP): quien insiste se bloquea a sí mismo. El tope por cuenta (100 puntos) exige repartirse entre al menos 13 IP, y «Olvidé mi contraseña» lo borra | Quien disponga de muchas IP puede dejar a una persona sin entrar hasta 15 minutos por vez (y repetirlo). Se acepta: no hay forma de evitarlo del todo sin dejar pasar la fuerza bruta |
| Agotar los topes globales para que nadie más entre | Son topes de costo (600 intentos por 15 min, 300 altas por 10 min, 200 «olvidé» por hora), no un control de identidad | Con unas 60 IP se puede impedir que otras personas entren durante una ventana. Se acepta; cada instancia cuenta por separado |
| Robo de la base de datos o de una copia | Correo y secreto TOTP cifrados; contraseñas con scrypt; tokens y códigos solo en hash | Quien robe la base **y** `CUENTAS_SECRETO` lee correos y secretos TOTP |
| Robo de la sesión por script (XSS) | CSP estricta con nonce; cookie `HttpOnly`; React escapa; sin `dangerouslySetInnerHTML` en las cuentas | Un fallo de la CSP o de una dependencia |
| CSRF | `SameSite=Lax`, comprobación de `Origin` de Next.js, token anti-CSRF por sesión, sin `GET` que cambie datos | — |
| Fijación de la sesión | El token se emite al autenticarse; entrar de nuevo cierra la anterior | — |
| Antivirus de correo que abre los enlaces | Abrir no gasta nada: solo el POST crea o cambia | — |
| Enlace de correo expuesto | Un solo uso, 72 h / 1 h, solo su hash en la base, `Referrer-Policy: strict-origin` | **La dirección con el token queda en los registros de solicitudes de Cloud Run** (los ve solo el equipo propietario); por eso vence pronto y se gasta |
| Reutilizar un código TOTP o de recuperación | Último paso aceptado (`totp_ultimo_paso`); los códigos de recuperación se gastan de forma atómica | — |
| Perder el teléfono | 10 códigos de recuperación; se pueden regenerar | **Sin app ni códigos no hay recuperación asistida** (v1 no cambia el correo ni tiene soporte humano) |
| Usar el formulario para enviar correo basura a terceros o agotar la cuota de Resend | Trampa, tiempo, límites, tope diario en la base, un enlace por correo cada 10 minutos, y el 40 % del cupo reservado a restablecer contraseñas y avisos | La cuota gratuita (100 al día) se comparte con la lista de espera; con 12 altas al día un atacante puede impedir que se creen cuentas nuevas (el restablecimiento y los avisos siguen) |
| Distinguir si hay cuenta por el tiempo de respuesta | Tiempo mínimo de 1,2 s en crear y «olvidé», señuelo de scrypt al entrar | Si el envío real del correo con Resend tardara más de 1,2 s, esa respuesta más lenta delataría que se envió un correo. No se midió con Resend real |
| Terminar de configurar los dos pasos con una sesión robada | Empezar pide la contraseña; el código se confirma con un secreto que solo vio quien la puso | Quien robe la cookie mientras una configuración está a medias podría terminarla (la confirmación no repite la contraseña). Muy improbable; se acepta |
| Descargar los datos desde otro sitio | `GET` con `attachment` y `no-store`, rechaza `Sec-Fetch-Site: cross-site`, cookie `SameSite=Lax` | Depende de que el navegador envíe `Sec-Fetch-Site` (todos los actuales lo hacen) |
| Agotar memoria o CPU con contraseñas | Largo máximo, semáforo de scrypt con cola acotada | — |
| Inyección SQL / acceso indebido en la base | Consultas parametrizadas, permisos por columna, RLS por operación, eventos de solo agregar | — |
| Restaurar una copia vieja de la base | — | Pueden reaparecer sesiones ya revocadas: tras restaurar, cerrar todas (ver §11) |

## 10. Privacidad

Sin cookies de seguimiento ni analítica; la única cookie es la de sesión, necesaria para mantenerla. Se guarda lo mínimo (§4),
nunca la IP. La persona puede ver (`/cuenta/datos`), descargar y eliminar todo sin pedirlo. Al eliminar, la base borra la cuenta y
lo que depende de ella; las copias de seguridad del proveedor pueden conservarlo un tiempo limitado (el texto de la privacidad lo dice).
Las altas sin confirmar se borran a los 7 días, las sesiones se limpian solas y la actividad a los 90 días. **No hay borrado
automático de cuentas inactivas** (decisión pendiente, ver §12).

## 11. Pruebas y operación

**Pruebas.** `src/lib/cuentas/*.test.ts` (servicio con un almacén en memoria, contrato del almacén ejecutado contra las dos
implementaciones —memoria y Postgres real con el rol de la aplicación—, criptografía, contraseñas, tokens, QR, correos);
`src/app/acciones/cuenta.test.ts` (cookies, redirecciones, CSRF y qué vuelve al navegador); `src/lib/security/arquitectura.test.ts`
(reglas de arquitectura); `e2e/cuentas.spec.ts` (Postgres real y un servidor que imita a Resend: crear cuenta de punta a punta, contraseñas
débiles, entrar y salir, olvido y restablecimiento, cambio de contraseña, dos pasos con código y recuperación, sesiones, descarga,
eliminación, bloqueo por intentos —incluido que quien insiste se bloquea a sí mismo y la dueña entra desde otro lugar—, formularios sin JavaScript, cabeceras, teléfono). **Código QR:** el generador propio (modo byte, nivel M, versiones 1 a 20) se verificó con herramientas independientes
(no son dependencias del proyecto): el decodificador **jsQR** leyó bien las 705 entradas probadas (de 1 a 666 bytes; la de 700 no
cabe y se rechaza), y las matrices coinciden módulo a módulo, con alguna máscara, con las de la biblioteca `qrcode` (en modo byte)
en 223 de 223 casos y con las de `qrcode-generator` en 222 de 223 (en el restante, de 144 bytes, ambas se leen igual). `qr.test.ts`
fija una matriz y un hash conocidos, y el e2e comprueba que el código se pinta en negro sobre blanco.

**Accesibilidad.** axe-core (WCAG 2.2 AA y buenas prácticas) sobre 23 estados de las páginas de la cuenta —formularios vacíos y con
errores, pasos de correo, código QR, códigos de recuperación, sesiones, datos, enlaces no válidos—, en escritorio y teléfono: **sin
hallazgos nuevos**; el único es la marca de agua decorativa del pie (`aria-hidden`), exenta por ser pura decoración y ya documentada
en `docs/rediseno-claridad-y-movimiento.md`. Cada campo tiene su etiqueta y sus errores se enlazan con `aria-describedby`; el
resultado de cada acción se anuncia en una región `aria-live`; todo funciona con el teclado y sin JavaScript (el segundo paso acepta
los dos tipos de código en un solo campo). Falta probar con un lector de pantalla real.

**Abrir las cuentas.**

1. `npm run cuentas:secreto` y guardar el valor como secreto `cuentas-secreto` en Secret Manager. **Es un secreto más:** Secret Manager
   incluye 6 versiones activas gratis al mes; a partir de la séptima cuesta unos US$0,06 por versión al mes (consultar antes).
2. `npm run db:migrar` con el rol dueño (aplica `0006_cuentas.sql`).
3. En Resend, el dominio ya verificado para la lista de espera sirve. La cuota gratuita (100 correos al día) se **reparte**:
   `WAITLIST_ENVIOS_DIARIOS` + `CUENTAS_ENVIOS_DIARIOS` ≤ 100 (por omisión, 80 + 20).
4. En la revisión de Cloud Run (`despliegue/cloud-run.yaml`, bloque comentado): `CUENTAS_MODO=abiertas`, `CUENTAS_SECRETO` desde Secret Manager.
   Si falta algo, la configuración es inválida y la revisión no recibe tráfico (`/api/salud`).
5. Antes, la revisión legal de la privacidad y las condiciones de uso; después, probar con un correo real: crear cuenta, dos pasos,
   «olvidé mi contraseña», descargar y eliminar.

**Vigilar.** Líneas JSON `tipo: "cuenta"` y `"acceso_cuenta"` (con `resultado: "limite"` ante intentos repetidos), `limite_excedido`
(`cuentas_envios_diarios`, `cuentas_marca_de_tiempo`) y `fallo_servicio` (`cuentas_*`, `correo`).

**Rotar `CUENTAS_SECRETO`: hoy no se puede.** Cambiarlo deja ilegibles los correos y los secretos de dos pasos y rompe la búsqueda
por índice. Hace falta un script de recifrado como `lista:recifrar` (no existe todavía). Si el secreto se filtrara: tratarlo como un
incidente (`docs/seguridad/respuesta-incidentes.md`): cerrar las cuentas (`CUENTAS_MODO=cerradas`), avisar y recifrar.

**Después de restaurar la base desde una copia**, cerrar todas las sesiones (con el rol dueño):
`update cuenta_sesiones set revocada = now() where revocada is null;`

## 12. Decisiones y límites

- **Correo de las cuentas**: Resend gratuito, compartido con la lista de espera (arriba).
- **Cambio de correo**: no incluido. Hay que decidir si se ofrece (con confirmación en el correo viejo y en el nuevo) antes de que haya muchas cuentas.
- **Cuentas inactivas**: no se borran solas. Con la ley de protección de datos vigente a partir de fines de 2026 conviene decidir un plazo.
- **Contraseñas filtradas**: la lista es local. Consultar Pwned Passwords (k-anonimato) exigiría una llamada saliente: pedir autorización.
- **Bloqueo dirigido** (§9), **sin recuperación asistida** y el resto de los riesgos que quedan en la tabla de §9 son riesgos
  aceptados de esta versión.
- Los textos legales son provisionales; **no abrir las cuentas sin revisión legal** (regla 7 de `CLAUDE.md`).
