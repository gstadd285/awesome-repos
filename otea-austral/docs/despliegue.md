# Despliegue · Otea Austral en Google Cloud Run

Guía para poner Otea Austral en producción con **Cloud Run** (la aplicación), **Neon** (Postgres) y
**Resend** (correo de confirmación). Una sola imagen de contenedor sirve a cualquier entorno: la
configuración llega como variables de entorno al ejecutar y los secretos, desde Secret Manager.

> **Qué está probado y qué no.** La imagen se construye y se prueba en la CI (job `contenedor`): corre
> sin privilegios y sin gestores de paquetes, mapas de código ni código fuente; responde la sonda, envía
> la CSP y las cabeceras de seguridad, redirige http a https, lee la URL del sitio al ejecutar, una
> configuración insegura hace fallar la sonda y la imagen se escanea con Trivy. Los comandos de `gcloud` y la
> plantilla `despliegue/cloud-run.yaml` **no se han ejecutado contra un proyecto real** (no hay
> credenciales de Google Cloud en el entorno de desarrollo): léelos antes de aplicarlos y corrige lo
> que difiera en tu consola.

## 0. Antes de empezar

- **Presupuesto (regla 1 de `CLAUDE.md`: unos 40 USD en total).** Cloud Run, Artifact Registry,
  Secret Manager, Cloud Build, Neon y Resend tienen planes o cuotas gratuitas, pero **Google Cloud
  exige una cuenta de facturación** y las cuotas cambian: confírmalas en las páginas de precios antes
  de empezar. Crea un presupuesto con alertas (Facturación → Presupuestos y alertas) de 40 USD, con
  avisos al 50 %, 90 % y 100 %. El servicio queda con `minScale: 0` y `maxScale: 3` para acotar el
  gasto. **No añadas** un balanceador de carga, Cloud SQL, Cloud Armor ni otro servicio de pago sin
  preguntar.
- **Verificación en dos pasos** en Google, GitHub, Neon, Resend y el registrador del dominio, con
  códigos de respaldo guardados fuera de línea. Es la medida más efectiva del perfil de seguridad y
  solo la puedes activar tú: paso a paso en [`guia-dos-pasos.md`](guia-dos-pasos.md).
- Herramientas locales: Node 22 (`.nvmrc`), `gcloud` autenticado y, si quieres construir en tu
  máquina, Docker.

## 1. Base de datos (Neon)

1. Crea un proyecto en Neon con una base (por ejemplo `otea`). Elige la región más cercana a la de
   Cloud Run.
2. Copia la cadena de conexión **directa** (sin `-pooler`) del **rol dueño** y úsala **solo desde tu
   computador** para migrar:

   ```bash
   export DATABASE_URL_ADMIN='postgresql://DUEÑO:CLAVE@HOST/otea?sslmode=verify-full'
   npm run db:migrar      # esquema, disparadores y registro de fuentes (idempotente)
   npm run db:rol-app     # crea otea_web (miembro de otea_app) e imprime su URL una sola vez
   ```

3. Guarda la URL que imprime `db:rol-app` como secreto `DATABASE_URL`. Para Neon el script ya la
   arma con el host **con agrupador de conexiones** (`-pooler`) y `sslmode=verify-full`, que la
   aplicación exige en producción.
4. **La aplicación nunca recibe el rol dueño.** Solo tiene los permisos mínimos de las migraciones, por
   columna: la auditoría y las correcciones admiten `SELECT` e `INSERT` (y un disparador rechaza
   `UPDATE`, `DELETE` y `TRUNCATE` aunque alguien los concediera); las alertas no se borran nunca; solo
   la lista de espera admite `DELETE`, y únicamente de inscripciones pendientes. El usuario tiene además
   límite de conexiones y de tiempo por consulta. `db:rol-app` rechaza un usuario existente con
   superusuario, `BYPASSRLS` u otros atributos de más.
5. **Seguridad por fila (migración `0003`).** Todas las tablas activan RLS (las nuevas, en su propia migración: `0005`, `0006`, `0007`…) y el usuario de la aplicación
   solo puede lo que una política le permite. El dueño de la base no está sujeto a RLS (por eso nunca se
   usa en la aplicación). Una tabla nueva debe activar RLS y declarar sus políticas en su propia
   migración: una prueba lo exige.
6. **Correos cifrados (migración `0004`).** Mira «Cifrado de los correos» más abajo **antes** de migrar
   una base que ya tenga inscripciones: la migración se detiene si hay correos en claro.

## 2. Correo (Resend)

1. Verifica tu dominio en Resend (registros SPF y DKIM en el DNS).
2. Crea una clave de API con permiso de envío y guárdala como secreto `RESEND_API_KEY`.
3. `EMAIL_REMITENTE` debe ser una dirección del dominio verificado.

## 3. Credenciales del panel `/admin`

```bash
npm run admin:credenciales
```

Muestra una sola vez la frase (guárdala en tu gestor de contraseñas), la clave TOTP (agrégala a tu
app de autenticación) y los valores de `ADMIN_CLAVE_HASH`, `ADMIN_TOTP_SECRETO`,
`ADMIN_SESION_SECRETO` y `ADMIN_ALIAS`. Sin estas variables el panel no existe (responde 404). Para
rotarlas, vuelve a ejecutar el comando y reemplaza los valores: las sesiones abiertas se cierran.

### Secreto de la lista de espera

```bash
npm run lista:secreto
```

Genera `WAITLIST_SECRETO` (256 bits). De él se derivan la marca de tiempo del formulario y el cifrado de
los correos. Guárdalo en Secret Manager y **haz una copia fuera de línea** (gestor de contraseñas): si se
pierde, los correos cifrados ya guardados no se pueden recuperar. Es obligatorio con
`WAITLIST_MODE=abierta`.

## 4. Google Cloud

```bash
export PROYECTO=mi-proyecto REGION=southamerica-west1   # Santiago; confirma tu región preferida

gcloud config set project $PROYECTO
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com

# Repositorio de imágenes
gcloud artifacts repositories create otea --repository-format=docker --location=$REGION

# Cuenta de servicio de ejecución: sin permisos salvo leer sus secretos
gcloud iam service-accounts create otea-ejecucion --display-name="Otea Austral (ejecución)"

# Secretos (el valor se lee de la entrada estándar: no queda en el historial del shell)
for s in otea-database-url otea-resend-api-key otea-waitlist-secreto otea-admin-clave-hash \
         otea-admin-totp-secreto otea-admin-sesion-secreto; do
  gcloud secrets create $s --replication-policy=automatic
  printf 'Valor de %s: ' "$s"; read -rs v; echo
  printf '%s' "$v" | gcloud secrets versions add $s --data-file=-
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:otea-ejecucion@$PROYECTO.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

Cada secreto lo lee **solo** la cuenta de ejecución. Quien despliega necesita además el rol
`roles/iam.serviceAccountUser` sobre esa cuenta.

## 5. Construir y subir la imagen

Con Cloud Build (no necesitas Docker local; ten en cuenta que usa el repositorio de la carpeta
`otea-austral/`):

```bash
cd otea-austral
ETIQUETA=$(git rev-parse --short HEAD)
gcloud builds submit --tag $REGION-docker.pkg.dev/$PROYECTO/otea/otea-austral:$ETIQUETA .
```

O en tu máquina: `docker build -t …` y `docker push …` al mismo repositorio. La imagen no contiene
secretos (`.dockerignore` excluye `.env*`) y se construye igual para cualquier dominio. Etiqueta
cada versión con el commit: así el reverso es inmediato.

> El build de Next.js descarga las tres tipografías de Google Fonts (`next/font/google`) y las
> incluye en la imagen, de modo que **en producción el navegador no contacta a Google**. Requiere
> salida a internet durante el build.

## 6. Desplegar

Edita `despliegue/cloud-run.yaml` (imagen, cuenta de ejecución, dominio) y aplícalo:

```bash
gcloud run services replace despliegue/cloud-run.yaml --region $REGION
gcloud run services add-iam-policy-binding otea-austral --region $REGION \
  --member=allUsers --role=roles/run.invoker       # sitio público
```

La plantilla define las sondas de arranque y de vida sobre `/api/salud`, que responde 200 **solo si
la configuración es válida**: una revisión con configuración insegura (por ejemplo
`WAITLIST_MODE=memoria`, una URL de base de datos sin `verify-full`, un panel a medio configurar o
sin `NEXT_PUBLIC_SITE_URL` https)
no recibe tráfico y la revisión anterior sigue sirviendo.

Empieza con `WAITLIST_MODE=cerrada` (la lista no guarda correos). Cuando la base, el correo y el
dominio estén verificados, cambia a `abierta` y vuelve a aplicar.

## 7. Comprobaciones después de desplegar

```bash
# Para probar localmente la misma salida que corre en el contenedor:
#   npm run build && NEXT_PUBLIC_SITE_URL=https://oteaustral.example.org npm start   (puerto 3000 por omisión; PORT lo cambia)
URL=$(gcloud run services describe otea-austral --region $REGION --format='value(status.url)')
curl -s  $URL/api/salud                     # {"estado":"ok"}
curl -sI $URL/ | grep -i -E 'content-security-policy|strict-transport'
curl -s  $URL/.well-known/security.txt
curl -s -o /dev/null -w '%{http_code}\n' $URL/admin   # 200 con el formulario, o 404 si no hay credenciales
```

### HTTPS forzado: prueba la revisión **antes** de darle tráfico

La aplicación redirige (308) a `NEXT_PUBLIC_SITE_URL` toda solicitud que el proxy marque como http
(`X-Forwarded-Proto`). Cloud Run envía `https` en las solicitudes reales y la sonda no se ve afectada, pero si
alguna plataforma no enviara la cabecera, **cada solicitud se redirigiría a sí misma y el sitio entraría en un
bucle**. Compruébalo con una revisión sin tráfico:

```bash
# La revisión nueva recibe una URL de prueba con etiqueta y ningún tráfico real (la URL exacta sale en la respuesta).
gcloud run deploy otea-austral --region $REGION --image $REGION-docker.pkg.dev/$PROYECTO/otea/otea-austral:$ETIQUETA \
  --no-traffic --tag=prueba
curl -sI https://prueba---otea-austral-HASH-REGION.a.run.app/ | head -1      # debe ser HTTP/2 200, no 308 ni un bucle
```

Solo entonces dale el tráfico (`gcloud run services update-traffic otea-austral --region $REGION --to-latest`). Si hubiera bucle: `--update-env-vars HTTPS_FORZADO=0` (la redirección se
apaga; HSTS y `upgrade-insecure-requests` siguen protegiendo). Para probar la imagen en local por http usa también
`-e HTTPS_FORZADO=0`, o envía `-H 'X-Forwarded-Proto: https'` como lo hace Cloud Run.

Y a mano: la portada, `/alertas`, `/seguridad`; inicia sesión en `/admin` con la frase y el código
TOTP; con la lista abierta, inscribe un correo tuyo y confirma el enlace recibido.

## 8. Dominio propio

El dominio (`oteaustral.com`) todavía no está comprado. Mientras tanto el servicio responde en la
URL `*.run.app`; actualiza `NEXT_PUBLIC_SITE_URL` cuando exista el dominio. Para asociarlo:

- Las **asignaciones de dominio** de Cloud Run no están disponibles en todas las regiones y su estado
  cambia: verifica en la consola si tu región las admite. Si no, cambia de región o evalúa otra vía.
- Un **balanceador de carga HTTP(S) externo** funciona en todas partes pero **tiene costo mensual
  fijo**: no entra en el presupuesto sin tu aprobación. Con balanceador, `IP_PROXIES_CONFIABLES=2`.
- Cuando el dominio esté fijo y estable, evalúa añadir `preload` a HSTS (ver `SECURITY.md`).

## 9. Qué registra la plataforma (privacidad)

Cloud Logging guarda los registros de cada solicitud de Cloud Run, que incluyen **la IP del visitante
y el agente de usuario**, además de los eventos de seguridad que emite la aplicación (sin datos
personales). Reduce la retención del bucket `_Default` al mínimo útil (por ejemplo 30 días) y
mantenla coherente con `/privacidad`:

```bash
gcloud logging buckets update _Default --location=global --retention-days=30
```

La URL de cada solicitud queda en esos registros, y la del enlace de confirmación de la lista de espera
lleva un token de un solo uso (vence en 72 horas; en la base solo se guarda su hash). Ver
`docs/seguridad/auditoria-owasp-2025.md` (A09-002).

Las solicitudes al asistente (`POST /api/asistente`) quedan en esos registros como cualquier otra, con su IP y
agente de usuario, pero **sin el cuerpo**: lo que la persona escribe no se registra. La aplicación solo anota
categorías (`"tipo":"asistente"` con `"resultado"` `ia`, `sin_respuesta`, `negativa` o `degradada`), nunca el texto
de la pregunta ni de la respuesta.

### Alerta ante intentos de acceso al panel

La aplicación registra cada intento en `/admin` como un evento JSON sin datos personales
(`"tipo":"acceso_admin"` con `"resultado"` `correcto`, `rechazado`, `limite` o `cierre`). Crea una métrica y
una alerta para enterarte de una racha de rechazos:

```bash
gcloud logging metrics create otea_acceso_admin_rechazado \
  --description="Intentos rechazados o bloqueados en /admin" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="otea-austral" AND jsonPayload.tipo="acceso_admin" AND jsonPayload.resultado=("rechazado" OR "limite")'
```

Después, en la consola: *Monitoring → Alertas → Crear política*, con la métrica
`logging.googleapis.com/user/otea_acceso_admin_rechazado`, umbral «más de 5 en 10 minutos» y un canal de
notificación a tu correo o teléfono. Es el objetivo `DE-04` del perfil de seguridad.

## 10. Operación

- **Migraciones nuevas.** Aplícalas **antes** de desplegar la imagen que las usa, con
  `npm run db:migrar` y el rol dueño, y escríbelas compatibles hacia atrás (la revisión anterior
  sigue corriendo contra el esquema nuevo hasta que el tráfico cambie). Una migración aplicada no se
  edita.
- **Reversa.** Devuelve el tráfico a la revisión anterior:

  ```bash
  gcloud run revisions list --service otea-austral --region $REGION
  gcloud run services update-traffic otea-austral --region $REGION --to-revisions=REVISION=100
  ```

- **Tope diario de correos.** La lista de espera envía como máximo `WAITLIST_ENVIOS_DIARIOS` enlaces de
  confirmación cada 24 horas (80 por defecto, bajo el límite de 100 al día del plan gratuito de Resend); al
  alcanzarlo responde «vuelve mañana». Súbelo solo si cambias de plan.
- **Cifrado de los correos de la lista de espera.** La aplicación guarda cada correo cifrado y no puede leerlo
  de vuelta; lo descifra solo el dueño, desde su computador, con el secreto de la lista:

  ```bash
  export DATABASE_URL_ADMIN='postgresql://DUEÑO:CLAVE@HOST/otea?sslmode=verify-full'   # rol dueño
  export WAITLIST_SECRETO='…'                                    # el de Secret Manager
  npm run lista:exportar > confirmados.txt                       # un correo por línea, solo los confirmados
  npm run lista:exportar -- --csv > confirmados.csv              # con fecha y protección contra fórmulas de planilla
  ```

  Exporta **solo a quienes confirmaron** (dieron su consentimiento). El archivo tiene datos personales: no lo
  subas a un repositorio ni a un chat, guárdalo cifrado y bórralo al terminar.
- **Migrar una base que ya tenía correos en claro.** La migración `0004` se detiene si hay inscripciones, porque
  esos correos no se pueden cifrar desde SQL. Exporta lo que necesites (`\copy (select correo from lista_espera
  where confirmado is not null) to 'confirmados.txt'`), vacía la tabla (`delete from lista_espera`), migra y
  vuelve a invitar a esas personas a inscribirse. En un despliegue nuevo la tabla está vacía.
- **Rotar el secreto de la lista** (`WAITLIST_SECRETO`): cambiarlo sin más dejaría ilegibles los correos y
  rompería el reconocimiento de quien ya está inscrito. En orden: (1) cierra la lista (`WAITLIST_MODE=cerrada`);
  (2) genera el secreto nuevo con `npm run lista:secreto` y conserva el anterior; (3) ensaya con
  `WAITLIST_SECRETO_ANTERIOR=… WAITLIST_SECRETO=… npm run lista:recifrar` (comprueba que todo se descifra y no
  cambia nada); (4) aplica con `npm run lista:recifrar -- --aplicar` (una transacción que bloquea las
  escrituras); (5) crea la versión nueva del secreto en Secret Manager, vuelve a desplegar y reabre la lista.
- **Cerrar todas las sesiones del panel:** rota `ADMIN_SESION_SECRETO` (las cookies existentes dejan de
  firmar bien). Cerrar una sola sesión basta con «Salir», que la revoca en la base.
- **Respaldos de la base de datos.** Neon ofrece restauración a un punto anterior en el tiempo, pero la
  ventana depende del plan: **confírmala en tu proyecto**, porque en el plan gratuito es corta. Si la
  lista de espera o las alertas importan, haz además una exportación periódica con el rol dueño desde tu
  computador (`pg_dump`), guárdala cifrada fuera del proyecto y prueba restaurarla en una base vacía antes
  de necesitarla.
- **Cerrar la lista de espera de inmediato:**
  `gcloud run services update otea-austral --region $REGION --update-env-vars WAITLIST_MODE=cerrada`.
- **Rotar un secreto:** crea una versión nueva (`gcloud secrets versions add …`), vuelve a desplegar
  (la plantilla usa `latest`) y deshabilita la versión anterior. Para `ADMIN_SESION_SECRETO` o la
  clave del panel, esto cierra las sesiones abiertas. Ante un secreto filtrado, sigue
  `docs/seguridad/respuesta-incidentes.md`.
- **Actualizar la imagen base.** Dependabot propone la nueva versión de `node` (fijada por digest en
  el `Dockerfile`); la CI la construye, la prueba y la escanea con Trivy antes de aceptarla. Los hallazgos
  altos de los paquetes de Alpine no bloquean (se ven en el registro de la CI) y se resuelven con esa
  actualización. El digest de Trivy en `.github/workflows/otea-austral.yml` se actualiza a mano de vez en
  cuando.
- **Avisos de dependencias aceptados.** `seguridad/avisos-npm-aceptados.json` lista, con motivo y fecha de
  revisión, los avisos de desarrollo sin corrección publicada. Al vencer la fecha la CI falla hasta que se
  revisen: vuelve a evaluar el aviso, renueva la fecha o corrígelo.
- **Vencimientos.** `security.txt` expira el 2027-04-01: renuévalo (ver `SECURITY.md`).

## 11. Asistente de preguntas (IA, opcional)

El asistente de la portada **funciona sin configurar nada**: responde con las preguntas frecuentes del sitio, sin IA,
sin clave y sin costo. Es lo que despliega `despliegue/cloud-run.yaml` por omisión. Activar la IA es una decisión de
dinero y de privacidad (reglas 1 y 7 de `CLAUDE.md`): [`asistente-ia.md`](asistente-ia.md) explica qué decidir y cuánto
cuesta. Si decides activarla:

1. **Decide** el modelo, los precios (dólares por millón de tokens, de la página de precios de Anthropic) y el tope de
   gasto diario. Sin esos valores la configuración se rechaza y la revisión no arranca.
2. **Crea la clave en la consola de Anthropic** y fija ahí un **límite de gasto mensual**: es la barrera final, porque
   el tope diario de la aplicación solo cuenta lo que la aplicación gasta. La clave sirve solo para esto; guárdala en
   tu gestor de contraseñas.
3. **Aplica la migración `0005`** (la tabla `asistente_uso`, donde se cuenta el gasto del día; es idempotente) **antes** de
   desplegar: `npm run db:migrar` con el rol dueño. Con la base caída, el asistente no llama al modelo (falla cerrado).
4. **Guarda la clave en Secret Manager**, igual que los demás secretos:

   ```bash
   gcloud secrets create otea-anthropic-api-key --replication-policy=automatic
   printf 'Clave de Anthropic: '; read -rs v; echo
   printf '%s' "$v" | gcloud secrets versions add otea-anthropic-api-key --data-file=-
   gcloud secrets add-iam-policy-binding otea-anthropic-api-key \
     --member="serviceAccount:otea-ejecucion@$PROYECTO.iam.gserviceaccount.com" \
     --role=roles/secretmanager.secretAccessor
   ```

5. **Prueba con la API real antes de abrirlo** (gasta centavos): `ASISTENTE_PRUEBA_REAL=1 ANTHROPIC_API_KEY=… ASISTENTE_MODELO=…
   ASISTENTE_PRECIO_ENTRADA=… ASISTENTE_PRECIO_SALIDA=… npm run asistente:probar`. Hace dos preguntas, imprime lo que
   respondió el modelo, cómo terminó y lo que costó de verdad, y falla si la API rechaza algo. Es la única prueba
   que toca el servicio real: las demás usan un servidor que lo imita.
6. **Descomenta el bloque «Asistente de preguntas» de `despliegue/cloud-run.yaml`**, completa los valores y despliega como
   en el paso 7 (una revisión con etiqueta y sin tráfico). Haz unas preguntas de verdad en esa dirección y mira en
   Cloud Logging los eventos `"tipo":"asistente"`; después dale tráfico.
7. **Vigila el gasto** unos días: los eventos con `"resultado":"degradada"` y `"motivo":"limite"` indican que se agotó el
   cupo o el tope del día (los visitantes reciben entonces la respuesta de las preguntas frecuentes, sin error), y la
   consola de Anthropic muestra el gasto real. Si el tope diario se agota seguido, súbelo con una decisión, no por
   reflejo.

**Apagarla de inmediato** (sigue funcionando, gratis, con las preguntas frecuentes):

```bash
gcloud run services update otea-austral --region $REGION --update-env-vars ASISTENTE_MODO=base
```

Si sospechas que la clave se filtró: revócala en la consola de Anthropic (efecto inmediato), crea otra, agrégala como
versión nueva del secreto y vuelve a desplegar; sigue `docs/seguridad/respuesta-incidentes.md`.

## 12. Cuentas de personas usuarias (opcional, cerradas por omisión)

Las cuentas (crear cuenta, entrar, contraseñas, verificación en dos pasos, sesiones, descarga y eliminación de datos) vienen
**cerradas**: con `CUENTAS_MODO=cerradas` (el valor por omisión, el de `despliegue/cloud-run.yaml`) las páginas explican que
abren con el lanzamiento y **no guardan nada**, y el sitio no ofrece entrar. Abrirlas es una decisión de la persona responsable
(secreto nuevo, correos, privacidad): el diseño, el modelo de amenazas y los límites están en [`cuentas.md`](cuentas.md). Para abrirlas:

1. **Revisión legal** de la política de privacidad y de las condiciones de uso (hoy son textos provisionales). Quita de ellas el aviso
   de «texto provisional» solo cuando la revisión esté hecha.
2. **Genera el secreto** con el rol que despliega: `npm run cuentas:secreto`. Se muestra una sola vez: guárdalo en tu gestor de
   contraseñas (copia fuera de línea) y en Secret Manager. **Es un secreto más**: Secret Manager incluye 6 versiones activas
   gratis al mes y a partir de la séptima cuestan unos US$0,06 por versión al mes: revisa cuántas usas antes de crearlo.

   ```bash
   gcloud secrets create otea-cuentas-secreto --replication-policy=automatic
   printf 'CUENTAS_SECRETO: '; read -rs v; echo
   printf '%s' "$v" | gcloud secrets versions add otea-cuentas-secreto --data-file=-
   gcloud secrets add-iam-policy-binding otea-cuentas-secreto \
     --member="serviceAccount:otea-ejecucion@$PROYECTO.iam.gserviceaccount.com" \
     --role=roles/secretmanager.secretAccessor
   ```

   **No lo rotes**: hoy no existe un script de recifrado y cambiarlo deja ilegibles los correos y los secretos de dos pasos.
3. **Aplica la migración `0006`** (tablas de cuentas, sesiones, códigos y actividad, con permisos por columna y seguridad por fila)
   **antes** de desplegar: `npm run db:migrar` con el rol dueño.
4. **Reparte la cuota de correo.** El plan gratuito de Resend permite 100 correos al día **en total**; la lista de espera usa hasta
   `WAITLIST_ENVIOS_DIARIOS` (80) y las cuentas hasta `CUENTAS_ENVIOS_DIARIOS` (20 por omisión: confirmaciones, restablecimientos y
   avisos de seguridad; las altas pueden usar como mucho el 60 % de ese cupo y el resto queda para restablecer contraseñas y avisos). Que la suma no pase de 100; si el tráfico lo pide, subir de plan es una decisión de gasto (regla 1).
5. **Descomenta el bloque «Cuentas»** de `despliegue/cloud-run.yaml` (`CUENTAS_MODO=abiertas`, `CUENTAS_ENVIOS_DIARIOS`,
   `CUENTAS_SECRETO`) y despliega como en el paso 7: una revisión con etiqueta y sin tráfico. Si falta algo (base, clave de Resend o
   secreto) la sonda `/api/salud` falla y la revisión no recibe tráfico.
6. **Prueba en esa dirección con un correo real**: crear la cuenta (el correo debe llegar y el enlace abrir el sitio **de verdad**,
   no `localhost`), entrar, activar los dos pasos con una app de autenticación (escanear el código QR), «olvidé mi contraseña»,
   descargar los datos y eliminar la cuenta. Después dale tráfico.
7. **Vigila los primeros días** en Cloud Logging los eventos `"tipo":"acceso_cuenta"` y `"tipo":"cuenta"`, y los
   `"resultado":"limite"` (intentos repetidos) y `limite_excedido` con `cuentas_envios_diarios` (se agotó la cuota de correos).

**Cerrarlas de inmediato** (las páginas siguen, sin guardar ni enviar nada; las sesiones abiertas dejan de servir):

```bash
gcloud run services update otea-austral --region $REGION --update-env-vars CUENTAS_MODO=cerradas
```

**Después de restaurar la base desde una copia**, cierra todas las sesiones, porque pueden reaparecer sesiones ya revocadas
(con el rol dueño): `update cuenta_sesiones set revocada = now() where revocada is null;`

## 13. Ingesta de metadatos (servicio privado `otea-tareas`, apagada por omisión)

La ingesta lee los feeds **verificados** del registro de fuentes y guarda **solo metadatos** (título, enlace, fecha, organismo e
identificador; nunca el texto) en `fuente_items`. Diseño, límites y decisiones: [`alertas-reales.md`](alertas-reales.md) §2. Corre en
un **segundo servicio de Cloud Run, privado**, con la misma imagen; el sitio público no la tiene (sin `TAREAS_MODO`,
`/api/tareas/ingesta` responde 404 a cualquier método) y nunca sale a las fuentes.

> **Hoy no hay nada que leer.** Ninguna de las 17 fuentes tiene un feed verificado (`docs/fuentes-pendientes.md`): una corrida toma el
> turno, no pide nada a internet, registra la corrida con 0 feeds y deja el evento `"resultado":"sin_feeds"`. Desplegarla tiene sentido
> cuando la dueña verifique al menos un feed y lea completas sus condiciones (`alertas-reales.md` §11, decisiones 1 y 5).

**Qué protege a quién:**

| Barrera | Dónde |
|---|---|
| Solo quien tiene `roles/run.invoker` llega al código (Cloud Scheduler con OIDC) | Cloud Run (`--no-allow-unauthenticated`) |
| `TAREAS_MODO=activo`, `POST` sin cuerpo y encabezado `X-Otea-Tarea` = `TAREAS_SECRETO` (tiempo constante); si no, 404 | `src/lib/tareas/exigir.ts` |
| Solo las URL exactas de `feeds` del registro; https, 443, sin IP ni credenciales; cada redirección (máx. 3) en el dominio de la fuente | `src/lib/ingesta/descarga.ts` (único archivo que hace `fetch`) |
| 10 s por solicitud, 4 min por corrida, 1 MB por feed (en flujo), tipo de contenido, ≥ 2 s por host, `Retry-After` (≤ 24 h) | `descarga.ts`, `servicio.ts` |
| `robots.txt` por host cada 24 h (404 = permitido; 5xx, sin respuesta u otro tipo ⇒ no se lee el feed; `Disallow` ⇒ pausa 24 h) | `robots.ts` |
| XML sin DTD ni entidades (XXE, bomba de entidades), profundidad ≤ 32, ≤ 50.000 elementos, ≤ 200 ítems; JSON con profundidad medida antes de analizar | `feeds.ts` |
| Solo metadatos, solo agregar (`otea_rechazar`), grants por columna y RLS; turno en la base | `db/migraciones/0007_ingesta.sql` |

### Activarla

1. **Verifica el feed** en `data/sources.seed.json`: `acceso` `rss` o `api`, el feed en `feeds` con su fecha `verificado` y en el
   dominio de `url_base`, y `condiciones_reutilizacion` «Verificadas el AAAA-MM-DD: …» (`registry.test.ts` lo exige). El registro
   viaja en la imagen: un feed nuevo es un commit, una imagen y un despliegue de **los dos** servicios.
2. **Migra** con el rol dueño (`npm run db:migrar`): la `0007` crea `fuente_items`, `ingesta_feeds`, `ingesta_corridas` y
   `tareas_turnos`, con grants por columna, RLS y disparadores de solo agregar.
3. **Secretos y cuentas de servicio.** El secreto del encabezado (256 bits) y dos cuentas: `sa-tareas` (ejecuta `otea-tareas` y solo
   lee sus dos secretos) y `sa-programador` (solo invoca `otea-tareas`). Secret Manager incluye 6 versiones activas gratis al mes:
   revisa cuántas usas.

   ```bash
   gcloud services enable cloudscheduler.googleapis.com
   gcloud iam service-accounts create sa-tareas --display-name="Otea Austral (tareas)"
   gcloud iam service-accounts create sa-programador --display-name="Otea Austral (Cloud Scheduler)"
   gcloud secrets create otea-tareas-secreto --replication-policy=automatic
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" \
     | gcloud secrets versions add otea-tareas-secreto --data-file=-
   for s in otea-tareas-secreto otea-database-url; do
     gcloud secrets add-iam-policy-binding $s --role=roles/secretmanager.secretAccessor \
       --member="serviceAccount:sa-tareas@$PROYECTO.iam.gserviceaccount.com"
   done
   ```

4. **Despliega `otea-tareas`** con la misma imagen del sitio. No recibe la clave de Anthropic, ni las del panel, ni las de correo:

   ```bash
   gcloud run deploy otea-tareas --region $REGION \
     --image $REGION-docker.pkg.dev/$PROYECTO/otea/otea-austral:$ETIQUETA \
     --service-account sa-tareas@$PROYECTO.iam.gserviceaccount.com \
     --no-allow-unauthenticated --ingress=all --max-instances=1 --concurrency=1 --timeout=300 --min-instances=0 \
     --set-env-vars "TAREAS_MODO=activo,NEXT_PUBLIC_SITE_URL=https://oteaustral.com,INGESTA_CONTACTO=mailto:ingesta@oteaustral.com" \
     --set-secrets "DATABASE_URL=otea-database-url:latest,TAREAS_SECRETO=otea-tareas-secreto:latest"
   URL_TAREAS=$(gcloud run services describe otea-tareas --region $REGION --format='value(status.url)')
   gcloud run services add-iam-policy-binding otea-tareas --region $REGION --role=roles/run.invoker \
     --member="serviceAccount:sa-programador@$PROYECTO.iam.gserviceaccount.com"
   ```

   `INGESTA_CONTACTO` aparece en cada solicitud a las fuentes (la SEC exige organización y contacto): un correo **de rol**, nunca
   personal. Si falta algo (`DATABASE_URL`, el secreto o el contacto), `/api/salud` falla y la revisión no recibe tráfico.
5. **Programa la corrida** (cada hora, a los :17, hora de Chile). El tiempo de intento debe cubrir los 4 minutos de la corrida (el valor
   por omisión de Cloud Scheduler es 3):

   ```bash
   printf 'TAREAS_SECRETO: '; read -rs SECRETO; echo
   gcloud scheduler jobs create http otea-ingesta --location $REGION \
     --schedule="17 * * * *" --time-zone="America/Santiago" --attempt-deadline=300s \
     --http-method=POST --uri="$URL_TAREAS/api/tareas/ingesta" \
     --oidc-service-account-email="sa-programador@$PROYECTO.iam.gserviceaccount.com" --oidc-token-audience="$URL_TAREAS" \
     --headers="X-Otea-Tarea=$SECRETO"
   unset SECRETO
   ```

   El encabezado queda guardado en la configuración del trabajo: quien pueda ver los trabajos de Cloud Scheduler lo ve. Por eso es la
   **segunda** barrera; la primera es IAM. Al rotarlo, actualiza a la vez el secreto (y despliega) y el trabajo
   (`gcloud scheduler jobs update http otea-ingesta --update-headers=X-Otea-Tarea=…`).
6. **Comprueba** que el servicio público no la tiene, que la plataforma rechaza a quien no es invocador y que una corrida responde
   solo conteos:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://oteaustral.com/api/tareas/ingesta        # 404
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL_TAREAS/api/tareas/ingesta"                 # 403 (IAM)
   gcloud scheduler jobs run otea-ingesta --location $REGION                                          # una corrida ahora
   gcloud logging read 'resource.labels.service_name="otea-tareas" AND jsonPayload.tipo="tarea"' --limit 3 --format json
   ```

   La respuesta y el registro llevan solo conteos y códigos: `{"resultado":"ok","feeds":1,"nuevos":12,"fallos":0,…}`. Un
   `"resultado":"rechazada"` significa que alguien con `run.invoker` llamó sin el secreto, con otro método o con cuerpo: revisa quién.

### Vigilarla

- **Sin corridas en 3 h** (`alertas-reales.md` §8.3): una métrica de registros y una alerta por ausencia.

  ```bash
  gcloud logging metrics create otea_ingesta_corridas \
    --description="Corridas de la ingesta (una por hora)" \
    --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="otea-tareas" AND jsonPayload.tipo="tarea" AND jsonPayload.tarea="ingesta"'
  ```

  En *Monitoring → Alertas → Crear política*: la métrica `logging.googleapis.com/user/otea_ingesta_corridas`, condición «ausencia de
  datos» durante 3 horas, y el mismo canal de notificación que la alerta del panel (§9).
- **Feeds en pausa** (`"tipo":"ingesta_feed"` con `"evento":"pausa"` tras 3 fallos seguidos, o `"robots_prohibido"`). Hasta que el
  tablero de `/admin` los muestre (F3), consúltalos con el rol dueño:

  ```sql
  select feed_url, fallos_seguidos, ultimo_error, pausado_hasta, robots, robots_revisado, ultimo_ok
    from ingesta_feeds order by pausado_hasta desc nulls last;
  select * from ingesta_corridas order by orden desc limit 24;
  ```

  Una pausa por `robots_prohibido` dura 24 h y después se vuelve a leer `robots.txt`: no la levantes a mano (el sitio pidió que no lo
  leamos). Una pausa por fallos también vence a las 24 h; para reanudar antes, con el rol dueño:
  `update ingesta_feeds set pausado_hasta = null, fallos_seguidos = 0 where feed_url = '…';`.
- **Ítems**: `fuente_items` es de solo agregar (ni el dueño la cambia o borra sin desactivar el disparador): ~50 ítems al día son
  ~10 MB al año.

### Apagarla de inmediato

```bash
gcloud scheduler jobs pause otea-ingesta --location $REGION                                   # deja de llamarla
gcloud run services update otea-tareas --region $REGION --update-env-vars TAREAS_MODO=inactivo   # la ruta vuelve a dar 404
```

### Probarla sin salir a internet

`npm test` con `PRUEBAS_DATABASE_URL` corre la ingesta completa contra un servidor de **fuentes falsas** (`scripts/lib/fuentes-falsas.mjs`)
con fixtures sintéticos marcados como de prueba (`e2e/fixtures/fuentes/`: RSS, Atom, JSON, `robots.txt` y casos malignos):
`src/lib/ingesta/almacen-postgres.test.ts` comprueba que guarda solo metadatos, que la segunda corrida no duplica y que un `Disallow`, un
`robots.txt` caído o una redirección fuera del dominio no se leen. A mano: `PORT=3297 node scripts/fuentes-falsas.mjs` y la aplicación
con `OTEA_E2E=1 INGESTA_URL_PRUEBA=http://127.0.0.1:3297` (cada solicitud ya validada se reescribe a `/<host>/<ruta>` de ese servidor).
La e2e `e2e/tareas.spec.ts` prueba las puertas en el sitio público (3200) y en una instancia con `TAREAS_MODO=activo` (3201).

**Costo:** US$ 0 dentro de las capas gratuitas (Cloud Scheduler incluye 3 trabajos por cuenta de facturación; ~720 corridas cortas al mes
en Cloud Run con mínimo 0 instancias). Confírmalo en las páginas de precios antes de crear el trabajo.
