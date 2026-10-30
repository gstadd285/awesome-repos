# Otea Austral · Informe de avance

**Inteligencia de eventos para mercados.** Estado del sitio web al 10 de octubre de 2026.

Código en `otea-austral/` del repositorio `gstadd285/awesome-repos` · rama `claude/session-01rhwbcccr2ejysb-w0j9av` · [pull request #2](https://github.com/gstadd285/awesome-repos/pull/2) (27 commits y 220 archivos de cambios antes de este informe).

## 1. En una página

**Qué es.** Otea Austral avisa de eventos globales relevantes (por ejemplo, una tensión en Ormuz) y explica qué sectores y activos podrían verse afectados: **quién gana, quién pierde y bajo qué condición**, con un nivel de confianza y las fuentes. Es información y análisis, **no asesoría financiera**.

**Dónde estamos.** El sitio público y el panel interno de la redacción están **construidos y probados**, y el trabajo de esta sesión fue aplicar la **lista de 20 controles de seguridad** que me pasaste. Todo corre y se prueba en el entorno de desarrollo y en GitHub. **Todavía no está publicado en Internet**: faltan cuentas, dominio y decisiones que solo puedes tomar tú (sección 7).

| Dato | Valor |
|---|---|
| Páginas | 9 públicas (portada, alertas, metodología, fuentes, seguridad, privacidad, términos, aviso legal y confirmación de la lista) y 4 internas (acceso, listado, nueva alerta y detalle) |
| Pruebas automáticas | **450** de código y base de datos real + **74** de navegador, todas en verde (antes de esta sesión: 296 y 53) |
| Verificación continua | GitHub ejecuta tres comprobaciones en cada cambio (calidad y pruebas, navegador y contenedor) y **pasaron en verde en los seis commits de esta sesión** |
| Seguridad (marco NIST CSF 2.0) | 37 controles: 23 listos, 8 parciales y 6 objetivos de operación (revisiones periódicas, dos pasos, alerta de accesos…) que se activan al publicar |
| Tu lista de 20 controles | **Los 20 están cubiertos en el código**; 4 tienen una salvedad o una acción tuya pendiente (2, 11, 12 y 19) |
| Costo agregado hoy | **0 USD**: todo lo nuevo es gratuito y no se contrató ningún servicio |

## 2. Cómo se ve

El PDF de este informe incluye capturas de la portada, la historia en 3D, las alertas, el teléfono y el panel interno (versión de texto: este archivo).

## 3. Qué hace el sitio hoy

**Para el público**

- **Portada** con una historia en 3D ligada al scroll (cinta de láminas, plano técnico, tablero con alertas que caen y panel), selector de temas («Tus temas»), pre-apertura y ejemplos de alertas. Funciona también sin movimiento (respeta «reducir movimiento») y en el teléfono.
- **Lista de espera** con doble confirmación: la persona deja su correo, recibe un enlace y debe confirmar. Hoy está **cerrada** (no guarda correos) hasta que se publique el sitio.
- **Alertas publicadas**, con su confianza calculada desde las fuentes, correcciones con fecha y retractaciones visibles: nada se borra en silencio.
- **Metodología, Fuentes** (17 organismos oficiales), **Seguridad** (perfil NIST publicado), y textos de **privacidad, términos y aviso legal** (provisionales, a la espera de revisión legal).
- Todo contenido de muestra lleva la marca **«Datos de ejemplo»**; nunca se inventan cifras reales ni se copia el texto de una fuente.

**Para la redacción (panel interno, `/admin`)**

- Entrada con **dos factores**: una frase larga generada por el sistema y un código de 6 dígitos de la app del teléfono.
- Crear una alerta, adjuntar fuentes del registro, ver la **confianza calculada** y las razones que impiden publicarla, enviar a revisión, aprobar, publicar, corregir y retractar.
- Reglas que el sistema impone solo: una alerta de impacto alto necesita dos organismos distintos y una aprobación posterior a la última edición; una publicada no se edita en silencio (se convierte en una corrección pública); el lenguaje de recomendación («recomendamos comprar…») se bloquea.
- Una **auditoría** que solo admite agregar filas: queda quién hizo qué y cuándo.

## 4. Tu lista de 20 controles de seguridad

La lista viene del mundo de las apps donde el navegador habla directo con la base de datos (como Supabase). Otea Austral tiene otra arquitectura: **el navegador nunca toca la base**; todo pasa por el servidor. Por eso los controles 3, 4 y 7 se tradujeron a su equivalente real. Cada control se cruzó primero con el código (no con lo recordado) y se aplicó con una prueba que falla si alguien lo rompe.

| # | Control | Resultado | Qué se hizo |
|---|---|---|---|
| 1 | Ocultar API keys | ✅ Reforzado | Se construye el sitio con claves falsas y se comprueba que ninguna queda en el resultado ni en ninguna respuesta; las claves solo existen en el servidor |
| 2 | Eliminar secretos de Git | ✅ + tu acción | Un escáner revisa los archivos y **todo el historial** (hoy está limpio) en cada cambio. Tú debes activar _Secret scanning_ y _Push protection_ en GitHub |
| 3 | Key pública para la base | ⚪ Equivalente | El navegador no tiene camino a la base; el servidor usa un usuario de mínimos privilegios. Una prueba vigila que ningún componente del navegador importe la base |
| 4 | Row-Level Security | ✅ Nuevo | La propia base decide fila por fila qué puede hacer la aplicación, en las 9 tablas |
| 5 | Encriptar datos sensibles | ✅ Nuevo | Los correos se guardan **cifrados** y la aplicación puede escribirlos pero **no leerlos** |
| 6 | Forzar la autenticación | ✅ Reforzado | Una prueba falla si una página o acción del panel no exige sesión |
| 7 | Restringir acceso a registros | ✅ Nuevo | Seguridad por fila + lo no publicado nunca sale al público (probado) |
| 8 | Bloquear manipulación de campos | ✅ Reforzado | Pruebas con campos de más en los formularios y escrituras prohibidas en la base |
| 9 | Proteger cookies de sesión | ✅ Reforzado | Cookie `__Host-`, invisible al JavaScript, solo https, solo del mismo sitio, revocable al salir |
| 10 | Hashear contraseñas | ✅ Ya estaba | PBKDF2 con 600 000 vueltas y una frase de ≈124 bits. No se cambió a Argon2 (explicado en `SECURITY.md`) |
| 11 | Rate limiting | 🟡 Ampliado | Límite también en la confirmación. Los contadores son por instancia; frenar un ataque masivo es trabajo de la plataforma |
| 12 | Protección contra bots | 🟡 Ampliado | Marca de tiempo firmada en el formulario (se descartan los envíos sin marca, falsos, instantáneos o con la pestaña vencida). **No es un CAPTCHA**: decide tú (sección 7) |
| 13 | Parametrizar queries | ✅ Reforzado | Una prueba falla si aparece SQL armado con datos de entrada (se verificó con SQL malo a propósito) |
| 14 | Validar inputs | ✅ Reforzado | Todo se valida en el servidor; ahora los formularios tienen un tope de tamaño (100 KB) |
| 15 | Sanitizar contenido | ✅ Reforzado | Reglas que prohíben HTML armado con datos, `innerHTML`, `eval` y `document.write` |
| 16 | Restringir archivos | ✅ Reforzado | El sitio no recibe archivos; `public/` y los SVG son de lista cerrada; la imagen no lleva mapas de código ni código fuente |
| 17 | Devolver solo lo necesario | ✅ Reforzado | Prueba de contrato de lo que sale al público |
| 18 | Security headers | ✅ Reforzado | Ya tenía CSP estricta, HSTS y más; se sumaron 2 cabeceras y una prueba del conjunto |
| 19 | Forzar HTTPS | ✅ + tu prueba | El sitio redirige de http a https. Hay un interruptor de emergencia y un paso de prueba al desplegar |
| 20 | Escanear dependencias | ✅ Nuevo | Se auditan todas las dependencias, se escanea la imagen del contenedor y se impide que los paquetes ejecuten scripts al instalarse |

## 5. Lo que encontró el trabajo (además de lo planeado)

Al aplicar la lista aparecieron cinco hallazgos reales, todos **corregidos**. La severidad es una estimación asistida por IA, no una prueba de intrusión.

| Hallazgo | Severidad | Qué pasaba | Qué se hizo |
|---|---|---|---|
| Correos en claro | Media | Los correos de la lista de espera estaban sin cifrar en la base y la aplicación podía leerlos todos | Cifrado AES-256-GCM; la aplicación ya no puede leerlos; solo tú, con una clave aparte, los descifras |
| Sin seguridad por fila | Baja | La aplicación podía borrar o modificar cualquier inscripción, incluso las confirmadas | Ahora solo toca las pendientes; el resto de las tablas tiene sus propias reglas |
| npm dentro de la imagen | Baja | El contenedor llevaba npm y yarn con **13 hallazgos de seguridad, uno crítico**, aunque el sitio no los usa | Se quitaron de la imagen (0 hallazgos) y la CI lo comprueba |
| Paquetes con scripts de instalación | Baja | Un paquete comprometido podía ejecutar código solo con instalarse | Desactivado en todo el proyecto (probado: todo sigue funcionando) |
| Sin redirección a https | Informativa | Dependía solo de la plataforma | La aplicación la hace, sin redirecciones abiertas y con una prueba de que no hay bucles |

## 6. Cómo está construido y cómo se comprueba

- **Tecnología:** Next.js 16 y React 19 (sitio y panel en una sola aplicación), Postgres (Neon) para los datos, Resend para el correo de confirmación y Google Cloud Run para publicarlo en un contenedor sin privilegios. Todo con planes gratuitos dentro de tu presupuesto de unos 40 USD (Google Cloud exige una cuenta de facturación aunque haya cuota gratuita: la guía pide crear un presupuesto con alertas).
- **Calidad:** cada cambio pasa lint, tipos, 450 pruebas (con una base de datos Postgres real), 74 pruebas de navegador (incluido el panel), la construcción del contenedor y su escaneo de vulnerabilidades. Cuatro migraciones de base de datos versionadas.
- **Seguridad en capas:** política de contenido estricta, doble factor, sesiones revocables, permisos mínimos por columna **y** por fila, datos cifrados, límites de solicitudes, registros sin datos personales y reglas que se comprueban solas.
- **Documentación viva:** `CLAUDE.md` (reglas del proyecto y lo aprendido), `SECURITY.md`, `docs/plan.md`, `docs/despliegue.md` (guía paso a paso para publicar), `docs/seguridad/` (programa, respuesta a incidentes, auditoría OWASP y el plan de los 20 controles).

## 7. Lo que falta: acciones y decisiones tuyas

Nada de esto se puede resolver con código; son cuentas, dinero o criterio.

| Qué | Por qué | Dónde |
|---|---|---|
| Activar _Secret scanning_, _Push protection_ y _Dependabot alerts_ en GitHub | Segunda barrera contra claves filtradas y avisos de dependencias | GitHub → Settings → Code security |
| Activar _Private vulnerability reporting_ | Es el canal público para reportar vulnerabilidades | GitHub → Settings → Security |
| Crear las cuentas de Google Cloud, Neon y Resend y desplegar | El sitio aún no está en Internet | `docs/despliegue.md` |
| Activar verificación en dos pasos en todas tus cuentas | Es la medida más efectiva y solo la puedes hacer tú | Google, GitHub, Neon, Resend, registrador, correo |
| Generar `WAITLIST_SECRETO` y **guardar una copia fuera de línea** | Si se pierde, los correos cifrados no se pueden recuperar | `npm run lista:secreto` |
| Comprar el dominio y actualizar la URL del sitio | Hoy es `oteaustral.com`, aún no comprado | `NEXT_PUBLIC_SITE_URL` |
| Probar la redirección a https en una revisión sin tráfico | Si la plataforma no enviara la cabecera esperada habría un bucle | `docs/despliegue.md` §7 |
| Decidir si se añade un CAPTCHA a la lista de espera | Frena a un bot dedicado, pero mete a un tercero (Cloudflare) en la página y cambia la política de privacidad | Decisión tuya |
| Revisión legal de privacidad, términos, aviso legal y metodología | Los textos son provisionales | Un profesional |
| Crear la alerta de accesos fallidos al panel y fijar 30 días de registros | La receta está escrita | `docs/despliegue.md` §9 |
| Una prueba de seguridad independiente | Esta revisión es asistida por IA y no la sustituye | Antes de manejar datos reales |
| Cargar alertas reales con revisión editorial | Hoy todo el contenido es de ejemplo | Redacción |

## 8. Cómo seguir

- **Ver el trabajo:** [pull request #2](https://github.com/gstadd285/awesome-repos/pull/2), rama `claude/session-01rhwbcccr2ejysb-w0j9av`. Los seis commits de esta sesión (más el de este informe): `c9b88e5` (plan, escáner de secretos y reglas automáticas), `9352bf3` (https, bots y límites), `5d7c4c3` (seguridad por fila), `2c701ff` (correos cifrados), `522da0c` (dependencias e imagen) y `3fc8687` (documentación).
- **Leer el detalle:** `otea-austral/docs/seguridad/plan-20-controles.md` (cada control con su evidencia), `SECURITY.md` y `docs/despliegue.md`.
- **Comandos útiles** (en `otea-austral/`): `npm run dev`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run seguridad:secretos`, `npm run seguridad:canarios`, `npm run seguridad:dependencias`, `npm run lista:exportar` (descifra los correos confirmados, solo para ti).

## 9. Límites y avisos honestos

- **No está desplegado.** Los comandos de Google Cloud y la plantilla de Cloud Run no se han ejecutado contra un proyecto real (no hay credenciales en este entorno). La imagen sí se construye y se prueba en GitHub.
- **La revisión de seguridad es asistida por IA** sobre código también escrito con asistencia de IA. No sustituye a una prueba de intrusión ni es una certificación (el NIST no certifica).
- **Hay controles parciales por diseño:** los límites de solicitudes por IP viven en cada instancia; no hay límite global del sitio ni CAPTCHA (explicado en `SECURITY.md`).
- **Un aviso de desarrollo aceptado:** `braces` (vía las herramientas de lint) no tiene versión corregida publicada; no afecta al código desplegado y la CI vuelve a exigir su revisión el 2027-01-10.
- **El repositorio es público:** cualquiera puede leer el código y los documentos. No hay secretos en él (el historial se revisa en cada cambio) y la seguridad no depende de ocultar el código. Las protecciones de GitHub contra secretos son gratis en repositorios públicos, pero tú debes activarlas.
- **El contenido es de ejemplo** y los textos legales son provisionales; nada de esto debe publicarse como definitivo sin revisión.
- **El sitio no da asesoría financiera.** Los textos hablan de efectos posibles y condiciones («podría», «si…»), nunca de recomendaciones.
