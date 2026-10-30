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

> Las tres tipografías van en el repositorio (`src/app/_tipografias/`, `next/font/local`): el build no necesita salir a
> internet por ellas (solo `npm ci` usa la red) y **en producción el navegador no contacta a Google**.

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
  confirmación cada 24 horas (50 por defecto); al alcanzarlo responde «vuelve mañana». Los 100 correos al día del plan
  gratuito de Resend se reparten entre la lista, las cuentas y el resumen diario (50 + 20 + 30): si la suma pasa de 100, la
  revisión no arranca (§17). Súbelo solo si cambias de plan.
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
3. **Aplica las migraciones `0006` y `0009`** (tablas de cuentas, sesiones, códigos, actividad e invitaciones, con permisos por
   columna y seguridad por fila) **antes** de desplegar: `npm run db:migrar` con el rol dueño.
4. **Reparte la cuota de correo.** El plan gratuito de Resend permite 100 correos al día **en total**; la lista de espera usa hasta
   `WAITLIST_ENVIOS_DIARIOS` (50), las cuentas hasta `CUENTAS_ENVIOS_DIARIOS` (20 por omisión: confirmaciones, restablecimientos y
   avisos de seguridad; las altas pueden usar como mucho el 60 % de ese cupo y el resto queda para restablecer contraseñas y avisos)
   y el resumen diario hasta `RESUMEN_ENVIOS_DIARIOS` (30). `env.ts` no arranca si la suma pasa de 100; si el tráfico lo pide,
   subir de plan es una decisión de gasto (regla 1).
5. **Descomenta el bloque «Cuentas»** de `despliegue/cloud-run.yaml` (`CUENTAS_MODO`, `CUENTAS_ENVIOS_DIARIOS`,
   `CUENTAS_SECRETO`) y despliega como en el paso 7: una revisión con etiqueta y sin tráfico. Si falta algo (base, clave de Resend o
   secreto) la sonda `/api/salud` falla y la revisión no recibe tráfico.
6. **Prueba en esa dirección con un correo real**: crear la cuenta (el correo debe llegar y el enlace abrir el sitio **de verdad**,
   no `localhost`), entrar, activar los dos pasos con una app de autenticación (escanear el código QR), «olvidé mi contraseña»,
   descargar los datos y eliminar la cuenta. Después dale tráfico.
7. **Vigila los primeros días** en Cloud Logging los eventos `"tipo":"acceso_cuenta"` y `"tipo":"cuenta"`, y los
   `"resultado":"limite"` (intentos repetidos) y `limite_excedido` con `cuentas_envios_diarios` (se agotó la cuota de correos).

### Lanzamiento privado por invitación (`CUENTAS_MODO=invitacion`)

Es el modo previsto para el acceso anticipado ([`alertas-reales.md`](alertas-reales.md) §6, [`cuentas.md`](cuentas.md) §13): exige
lo mismo que `abiertas` y además solo se crea una cuenta con un código de `/admin/invitaciones`. Las alertas reales publicadas se ven
en `/alertas` **solo con sesión** (sin sesión, ejemplos), sea cual sea el modo.

1. Con el secreto y la migración `0009` ya aplicados, entra al panel y **emite los códigos** (alias interno sin datos personales,
   vigencia de 1 a 30 días). Cada código se muestra una vez: cópialo y envíalo por un canal privado. Se pueden emitir antes de
   cambiar el modo (con cualquier modo, siempre que la revisión tenga `CUENTAS_SECRETO` y la base).
2. Despliega con `CUENTAS_MODO=invitacion` (revisión con etiqueta y sin tráfico, como siempre) y prueba en esa dirección: crear una
   cuenta con un código (el correo llega), que el mismo código ya no sirva, y `/alertas` con y sin sesión.
3. Vigila `"tipo":"invitacion"` (`rechazada` en ráfagas = alguien prueba códigos) y `limite_excedido` con `cuentas_invitacion` o
   `cuentas_invitacion_codigo`. Un código filtrado se **revoca** en el panel.

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

   La respuesta y el registro llevan solo conteos y códigos: `{"resultado":"ok","feeds":1,"nuevos":12,"fallos":0,…,
   "agrupados":12,"eventos_nuevos":3}` (cada corrida agrupa al final los ítems en eventos candidatos, sin red ni IA, con la
   migración `0008`; la dueña los revisa en `/admin/eventos`). Un
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

## 14. Borradores con IA (en `otea-tareas`, apagados por omisión)

Al final de cada corrida de la ingesta, con el turno tomado, Claude (`claude-haiku-5-5`) redacta **un borrador por evento
candidato** sobre el umbral (o pedido por la dueña en `/admin/eventos`) y lo deja en la cola; la dueña lo acepta (la alerta nace en
borrador por `rules.ts`, con sus fuentes), lo edita o lo descarta con un motivo. **Nada se publica solo.** Diseño, costos y
decisiones: [`alertas-reales.md`](alertas-reales.md) §4, §5 y §4.8. Es un **servicio de pago** (CLAUDE.md, regla 1): solo la dueña
lo activa, con la clave, los precios y el tope que ella decida.

> **Hoy no redactaría nada.** Ninguna fuente del registro tiene `lectura_ia: true` y **nada de una fuente sin esa marca llega al
> modelo** (ni su texto ni sus títulos): un evento sin ninguna queda en la cola manual. Marcar una fuente exige leer sus condiciones
> completas y la opinión del abogado (`alertas-reales.md` §11, decisión 3). Sin feeds verificados (§13) tampoco hay eventos.

**Qué protege a quién:**

| Barrera | Dónde |
|---|---|
| `BORRADORES_MODO=ia` solo con `TAREAS_MODO=activo` y todo lo de pago explícito (clave, modelo, precios, tope); el sitio público no tiene la clave | `src/lib/env.ts` |
| Espacio de trabajo propio en la consola de Anthropic con **límite de gasto mensual de US$ 5** y su clave (distinta de la del asistente) | Consola de Anthropic (barrera final, independiente de la app) |
| Tope del mes ≤ US$ 5 (esquema, sentencia y restricción de la base), llamadas por mes y por corrida, tope acumulado opcional (`IA_TOPE_TOTAL_USD`); reserva del peor caso antes de llamar; **si la base falla, no se llama** | `src/lib/borradores/presupuesto-postgres.ts`, `src/lib/ia/gasto-postgres.ts`, `borradores_uso` (`0010`) |
| Solo fuentes con `lectura_ia`; el texto se lee con `descarga.ts` (registro, dominio, 10 s, 2 MB, `text/html`, `robots.txt`), se corta en 12.000 caracteres y **nunca se guarda ni se registra** | `src/lib/borradores/lectura.ts` |
| Marcas de inyección en títulos o documentos ⇒ no se llama (lectura manual); cada documento entre límites aleatorios | `src/lib/borradores/prompt.ts` |
| Sin herramientas, sin secretos, salida estructurada; un solo reintento del SDK, 60 s, sin registros del SDK | `src/lib/borradores/proveedor-borrador.ts` |
| Revisión en orden: Zod estricto, forma (sin enlaces, HTML ni Markdown), lenguaje de recomendación, cifras, anticopia, reglas; la confianza la calcula el código | `src/lib/borradores/revision.ts`, `anticopia.ts` |
| Aceptar, descartar y pedir con sesión y CSRF del panel; aceptar crea la alerta, sus fuentes y el borrador aceptado en una transacción | `src/app/admin/eventos/acciones.ts`, `src/lib/ingesta/cola-postgres.ts` |

**Costo previsto** (precios del 2026-10-06, a confirmar en la página de precios): ~US$ 0,0014 por borrador típico (8.000 tokens de
entrada y 1.200 de salida), ≤ US$ 0,0036 en el peor caso; a 430 borradores al mes, ~US$ 0,60 (≤ US$ 1,53). El tope de US$ 5 cubre
~1.400 llamadas aunque todas costaran el peor caso.

### Activarlos

1. **Migra** con el rol dueño (`npm run db:migrar`): la `0010` crea `borradores_uso`, `borradores` y `borrador_intentos` (grants por
   columna, RLS, disparadores: el contenido no cambia, el estado se resuelve una vez, los intentos son de solo agregar) y suma dos
   acciones a `evento_auditoria`.
2. **Espacio de trabajo en Anthropic** (decisión 4 de §11): en la consola, un espacio de trabajo «Otea · borradores» con **límite de
   gasto mensual de US$ 5** (si el plan no lo permite, el de la organización) y una clave propia; verificación en dos pasos en la
   cuenta. Confirma en la página de precios lo que cuesta `claude-haiku-5-5`.
3. **Mide el costo real** antes de activar (gasta décimas de centavo, con un documento sintético):

   ```bash
   BORRADORES_PRUEBA_REAL=1 BORRADORES_ANTHROPIC_API_KEY=sk-ant-… BORRADORES_PRECIO_ENTRADA=… BORRADORES_PRECIO_SALIDA=… \
     npm run borradores:probar
   ```

   Debe pasar: borrador revisado, **costo ≤ US$ 0,004** y el estimador del gasto por encima de `countTokens`.
4. **Elige las fuentes** (decisión 3 de §11): `"lectura_ia": true` en `data/sources.seed.json`, solo con condiciones «Verificadas el
   …» que permitan el uso con IA (el esquema lo exige). Es un commit, una imagen y un despliegue de los dos servicios.
5. **Secreto y despliegue** de `otea-tareas` (la misma imagen; el sitio público no recibe nada de esto):

   ```bash
   gcloud secrets create otea-borradores-anthropic --replication-policy=automatic
   printf 'Clave de borradores: '; read -rs CLAVE; echo; printf '%s' "$CLAVE" | gcloud secrets versions add otea-borradores-anthropic --data-file=-; unset CLAVE
   gcloud secrets add-iam-policy-binding otea-borradores-anthropic --role=roles/secretmanager.secretAccessor \
     --member="serviceAccount:sa-tareas@$PROYECTO.iam.gserviceaccount.com"
   gcloud run services update otea-tareas --region $REGION \
     --update-env-vars "BORRADORES_MODO=ia,BORRADORES_MODELO=claude-haiku-5-5,BORRADORES_PRECIO_ENTRADA=0.1,BORRADORES_PRECIO_SALIDA=0.5,BORRADORES_TOPE_MENSUAL_USD=5" \
     --update-secrets "BORRADORES_ANTHROPIC_API_KEY=otea-borradores-anthropic:latest"
   ```

   Los precios del ejemplo son los de la referencia del 2026-10-06: usa los que confirmes. Si la dueña aprueba el tope acumulado
   (decisión 2), `IA_TOPE_TOTAL_USD` va en **los dos** servicios (el asistente también lo respeta). Si falta algo, `/api/salud` falla
   y la revisión no recibe tráfico. La corrida debe terminar antes de los 300 s de Cloud Run: la redacción no empieza un borrador si
   quedan menos de 75 s del plazo de 270 s.
6. **Comprueba** una corrida: la respuesta lleva solo conteos (`…,"borradores":1,"ia":"ok"`; `"ia":"tope"` si no alcanzó el tope) y
   el registro, eventos `"tipo":"borrador"` con un resultado y un código, nunca textos. En `/admin` el tablero muestra los borradores
   por revisar y el gasto del mes contra el tope (aviso desde el 80 %).

### Vigilarlos

- **Panel**: tablero (gasto del mes, toda la IA desde el primer día, borradores pendientes) y `/admin/eventos/[id]` (cada intento con su
  resultado, motivo, llamadas y costo). Un evento que la IA no pudo redactar queda en la cola manual y no se vuelve a intentar (salvo
  errores del servicio, hasta 3 veces).
- **Registros**: `gcloud logging read 'resource.labels.service_name="otea-tareas" AND jsonPayload.tipo="borrador"' --limit 20`.
  `lectura_manual` con `posible_inyeccion` merece mirar ese documento; `sin_presupuesto`, que se llegó al tope.
- **Consola de Anthropic** una vez por semana (`alertas-reales.md` §8.6): gasto del espacio de trabajo contra el del panel.

### Apagarlos de inmediato

```bash
gcloud run services update otea-tareas --region $REGION --update-env-vars BORRADORES_MODO=apagado   # la próxima corrida no llama
```

Y, si hace falta cortar ya mismo o se sospecha de la clave: **revócala en la consola de Anthropic** (o baja el límite del espacio de
trabajo a 0) y pausa la ingesta (`gcloud scheduler jobs pause otea-ingesta --location $REGION`). Apagados, la cola de `/admin/eventos`
sigue funcionando a mano y los borradores ya hechos se pueden aceptar o descartar.

### Probarlos sin salir a internet

`npm test` con `PRUEBAS_DATABASE_URL` corre la redacción completa con Postgres, el servidor de **fuentes falsas** (documentos HTML
sintéticos en `e2e/fixtures/fuentes/*/documentos/`) y el **Anthropic falso** (`scripts/lib/anthropic-falso.mjs`, salida estructurada
sin flujo) contra el SDK oficial (`src/lib/borradores/integracion.test.ts`): qué recibe el modelo y qué no, que ningún texto queda en
la base, la inyección, el tope agotado y la revisión en la cola. La e2e `e2e/borradores.spec.ts` corre la ingesta en el 3201 con los
borradores activos y el registro real (al «proveedor» no le llega nada) y la revisión en el panel con un borrador sintético.

## 15. Aportes voluntarios por Mercado Pago (opcional, apagados por omisión)

`/apoyar` explica en qué se usa lo que se reúne (dominio ~US$ 12 al año, servidores y correo en planes gratuitos, tope de la IA
de US$ 5 al mes; cifras estimadas), que el aporte es voluntario y no da recomendaciones, prioridad ni trato preferente, que no
es deducible de impuestos, que el reembolso se rige por Mercado Pago y que Otea Austral no recibe ni guarda datos de pago. Su
botón de latón es **solo un enlace** al «link de pago» de la dueña, en una pestaña nueva (`target="_blank"`,
`rel="noopener noreferrer"`, `safeHref`): el pago ocurre en Mercado Pago y el sitio no carga nada suyo (ni scripts, ni marcos,
ni widgets) ni procesa pagos o datos de tarjeta. **La CSP no cambia.**

**Apagado** (sin `DONACIONES_URL`, como hoy): `/apoyar` responde 404 (también sus metadatos) y no aparece en ninguna parte: ni
en el pie, ni en el menú del teléfono, ni en el mapa del sitio. **Activo**: la página, «Apoyar el proyecto» al final de la
columna «Confianza» del pie y junto a la cuenta en el menú del teléfono, y `/apoyar` en `sitemap.xml`.

**Dominios permitidos** (`src/lib/donaciones/enlace.ts`, host exacto, verificados el 2026-10-28):

| Dominio | Qué es | Cómo se verificó |
|---|---|---|
| `link.mercadopago.cl` | El link de cobro de una cuenta de Chile (`https://link.mercadopago.cl/nombre`; con monto abierto muestra «Ingresa el monto a pagar») | Páginas de pago de cuentas chilenas indexadas en ese subdominio |
| `mpago.la` | El dominio corto de los links de pago | Documentación oficial de Mercado Pago para desarrolladores (links de pago generados, p. ej. `https://mpago.la/…`) |

**No** se admiten: subdominios de esos dominios, dominios parecidos (`mpago.co` es una herramienta de un tercero), otros
dominios de Mercado Pago (`www.mercadopago.cl`) ni los que no se pudieron confirmar como de links de pago de Chile (`mpago.li`
aparece en enlaces de promociones; `mpago.cl/link`, solo como dibujo en la página comercial). La URL debe ser https, sin puerto,
sin credenciales, con su ruta y **sin parámetros ni ancla**. Si Mercado Pago te entrega un link corto de otro dominio, usa el
largo de `link.mercadopago.cl` (en la sección «Link de pago» de tu cuenta); sumar un dominio exige verificarlo en una fuente
oficial, agregarlo a `DOMINIOS_DONACIONES` con su caso en `enlace.test.ts` y desplegar una imagen nueva.

### Activarlos

1. **La dueña crea su link** en la sección «Link de pago» de su cuenta de Mercado Pago (para aportes, con monto abierto) y
   revisa ahí sus comisiones, qué informa de cada pago y cómo se reembolsa. Abre el link en una ventana
   privada y comprueba que es el suyo (nombre de la cuenta) antes de publicarlo.
2. **Configura y despliega** (no es un secreto: se publica en la página):

   ```bash
   gcloud run services update otea-austral --region $REGION \
     --update-env-vars "DONACIONES_URL=https://link.mercadopago.cl/‹nombre›"
   ```

   Un valor inválido (http, otro dominio, un subdominio, parámetros) hace fallar `/api/salud`: **la revisión no recibe tráfico**
   y sigue la anterior. Corrígelo y vuelve a desplegar. En local, `DONACIONES_URL=… npm start`.
3. **Comprueba**: `curl -sI "$URL/apoyar"` da 200, la página muestra el botón «Aportar en Mercado Pago», y el pie y
   `$URL/sitemap.xml` incluyen `/apoyar`; el botón abre el link de la dueña en una pestaña nueva.

Antes de anunciarlo, la revisión legal (`alertas-reales.md` §9): la política de privacidad ya menciona los aportes (desde la
versión `2026-10-borrador-5`), pero los textos siguen siendo borradores.

### Apagarlos

```bash
gcloud run services update otea-austral --region $REGION --remove-env-vars DONACIONES_URL   # /apoyar vuelve a 404
```

### Probarlos sin salir a internet

`npm test` cubre la lista (dominios permitidos, http, dominios parecidos, subdominios engañosos, parámetros) en
`src/lib/donaciones/enlace.test.ts` y `src/lib/env.test.ts`, y `arquitectura.test.ts` vigila que nada de Mercado Pago se cargue,
que la CSP no cambie y que los puntos de entrada dependan del apartado. La e2e `e2e/apoyar.spec.ts` lo prueba activo en el 3201
(con el link **de prueba** `DONACIONES_URL_PRUEBA` de `e2e/puertos.ts`; la pestaña de Mercado Pago se responde en la propia
prueba, sin red) y apagado en el 3200.

## 16. Resumen diario por correo (en `otea-tareas`, apagado por omisión)

Una vez al día (**07:41**, hora de Chile), cada cuenta que **lo pidió de forma explícita** en su perfil (una casilla separada; la base
guarda desde cuándo) recibe los títulos de Otea de las alertas reales publicadas **en sus temas** desde su último resumen (la primera
vez, desde que lo pidió o las últimas 24 h; nunca más de 7 días), con su tema, su confianza calculada y un enlace a `/alertas`. Sin
alertas nuevas en sus temas no se le envía nada. Nunca lleva texto de una fuente, datos de pago ni nada sensible, y dice «Información
y análisis; no es asesoría». Diseño: [`alertas-reales.md`](alertas-reales.md) §7 y §7.1.

**Qué protege a quién:**

| Barrera | Dónde |
|---|---|
| `RESUMEN_MODO=activo` solo con `TAREAS_MODO=activo`, `RESEND_API_KEY` y `CUENTAS_SECRETO`; si no, `/api/tareas/resumen` da 404 a los siete métodos (también en el sitio público) | `src/lib/env.ts`, `src/app/api/tareas/resumen/route.ts` |
| IAM de Cloud Run (OIDC) y `X-Otea-Tarea` en tiempo constante, como la ingesta; turno propio en la base (`tareas_turnos`, `resumen`) | `src/lib/tareas/exigir.ts`, `src/lib/ingesta/turno.ts` |
| Un resumen por cuenta y día (clave `(cuenta, día)`), aunque la tarea corra dos veces; cupo del día en la base (`resumen_envios_diarios`, solo sube); la suma de los tres cupos de Resend ≤ 100 o no arranca | `db/migraciones/0011_resumen.sql`, `src/lib/resumen/almacen-postgres.ts` |
| Solo cuentas con `resumen_previo` **y** su fecha de consentimiento (una restricción exige las dos); solo alertas `es_ejemplo = false` publicadas o corregidas | `0011`, `src/lib/resumen/seleccion.ts` |
| Baja de un clic (RFC 8058): cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post`; token al azar por correo, solo su hash en la base (60 días); **solo el POST da de baja** (un GET lleva a una página que pide confirmar); 1 KB, límites por IP | `src/lib/resumen/manejador-baja.ts`, `src/app/resumen/baja/page.tsx` |
| Registros solo con conteos (`"tipo":"tarea","tarea":"resumen"`, `"tipo":"resumen_baja"`); nunca el correo ni el contenido | `src/lib/security/log.ts` |

### Activarlo

1. **Migra** con el rol dueño (`npm run db:migrar`): la `0011` agrega `cuentas.resumen_alta` (y la fecha a quien ya había marcado la
   casilla), dos tipos de actividad (`resumen_activado`, `resumen_desactivado`), `resumen_envios`, `resumen_envios_diarios` y
   `resumen_bajas`, con grants por columna, RLS y disparadores.
2. **Reparte la cuota de Resend** (decisión 6 de `alertas-reales.md` §11): por omisión 50 (lista) + 20 (cuentas) + 30 (resumen). Declara
   los **tres** valores, iguales, en los dos servicios: cada uno comprueba la suma al arrancar.
3. **Dale a `otea-tareas` lo que necesita** (la clave de Resend y el secreto de las cuentas ya existen; solo se comparten con `sa-tareas`):

   ```bash
   for s in otea-resend-api-key otea-cuentas-secreto; do
     gcloud secrets add-iam-policy-binding $s --role=roles/secretmanager.secretAccessor \
       --member="serviceAccount:sa-tareas@$PROYECTO.iam.gserviceaccount.com"
   done
   gcloud run services update otea-tareas --region $REGION \
     --update-env-vars "RESUMEN_MODO=activo,WAITLIST_ENVIOS_DIARIOS=50,CUENTAS_ENVIOS_DIARIOS=20,RESUMEN_ENVIOS_DIARIOS=30" \
     --update-secrets "RESEND_API_KEY=otea-resend-api-key:latest,CUENTAS_SECRETO=otea-cuentas-secreto:latest"
   ```

   El servicio público necesita la base para la baja de un clic (`/api/resumen/baja`, `/resumen/baja`), que ya tiene con las cuentas.
4. **Programa el envío** (segundo trabajo de Cloud Scheduler, con la misma cuenta `sa-programador` y el mismo secreto):

   ```bash
   printf 'TAREAS_SECRETO: '; read -rs SECRETO; echo
   gcloud scheduler jobs create http otea-resumen --location $REGION \
     --schedule="41 7 * * *" --time-zone="America/Santiago" --attempt-deadline=300s \
     --http-method=POST --uri="$URL_TAREAS/api/tareas/resumen" \
     --oidc-service-account-email="sa-programador@$PROYECTO.iam.gserviceaccount.com" --oidc-token-audience="$URL_TAREAS" \
     --headers="X-Otea-Tarea=$SECRETO"
   unset SECRETO
   ```

5. **Prueba con tu cuenta**: pide el resumen en tu perfil, publica una alerta en uno de tus temas y ejecuta el trabajo a mano
   (`gcloud scheduler jobs run otea-resumen --location $REGION`). La respuesta lleva solo conteos
   (`{"resultado":"ok","cuentas":1,"enviados":1,"sin_novedades":0,"fallos":0,"cupo_agotado":false}`); una segunda ejecución el
   mismo día no envía nada. En el correo, «Dejar de recibir el resumen» debe abrir la página que pide confirmar; en Gmail, el
   enlace «Anular suscripción» junto al remitente usa la baja de un clic.

### Vigilarlo

- **Panel**: tarjeta «Resumen diario» (cuentas que lo pidieron, enviados y sin salir hoy, última corrida) y los avisos de operación.
- **Registros**: `gcloud logging read 'resource.labels.service_name="otea-tareas" AND jsonPayload.tarea="resumen"' --limit 5`;
  `limite_excedido` con `resumen_envios_diarios` = se agotó el cupo (las cuentas que faltaron lo reciben mañana, con todo lo pendiente).
- **Resend**: rebotes y quejas en su panel, una vez por semana ([`rutina-diaria.md`](rutina-diaria.md)).

### Apagarlo de inmediato

```bash
gcloud scheduler jobs pause otea-resumen --location $REGION                                    # no vuelve a llamar
gcloud run services update otea-tareas --region $REGION --update-env-vars RESUMEN_MODO=apagado   # la ruta vuelve a dar 404
```

Apagado, la baja de un clic **sigue funcionando** en el sitio público (un correo ya enviado debe poder darse de baja). Para que una
cuenta deje de recibirlo sin su enlace, con el rol dueño:
`update cuentas set resumen_previo = false, resumen_alta = null where id = '…';`.

### Probarlo sin salir a internet

`npm test` con `PRUEBAS_DATABASE_URL` corre la corrida completa contra Postgres (`src/lib/resumen/almacen-postgres.test.ts`: solo lo
real y publicado, una por cuenta y día con dos corridas a la vez, cupo atómico con diez reservas simultáneas, baja de un clic, columnas
sin contenido). La e2e `e2e/resumen.spec.ts` sigue temas en la portada, ve `/alertas` filtrado, pide el resumen, lo recibe en el
servidor que imita a Resend desde el 3201 y se da de baja con el POST de un clic.

## 17. Alertas reales: puesta en marcha, de punta a punta

Todo lo de las alertas reales (F2 a F6) **nace apagado** y se activa por piezas, cada una con su interruptor y su forma de apagarla al
instante. Antes de empezar, la lista de lo que solo la dueña puede hacer: [`lanzamiento-privado.md`](lanzamiento-privado.md).

### Orden de las migraciones

Con el rol dueño y **antes** de desplegar la imagen que las usa (`npm run db:migrar` aplica las que falten, en orden, y registra su
hash; una aplicada no se edita):

| Migración | Qué agrega | La usa |
|---|---|---|
| `0007_ingesta.sql` | `fuente_items`, `ingesta_feeds`, `ingesta_corridas`, `tareas_turnos` | Ingesta (§13) |
| `0008_eventos.sql` | `eventos_candidatos`, `evento_auditoria`, `fuente_items.evento_id` | Cola de `/admin/eventos` |
| `0009_invitaciones.sql` | `invitaciones`, `invitacion_auditoria`, `cuenta_tokens.invitacion_id` | Acceso por invitación (§12) |
| `0010_borradores.sql` | `borradores_uso`, `borradores`, `borrador_intentos` | Borradores con IA (§14) |
| `0011_resumen.sql` | `cuentas.resumen_alta`, `resumen_envios`, `resumen_envios_diarios`, `resumen_bajas` | Resumen diario (§16) |

Todas son compatibles hacia atrás: la revisión anterior sigue funcionando contra el esquema nuevo.

### Variables nuevas

| Variable | Servicio | Por omisión | Para qué |
|---|---|---|---|
| `TAREAS_MODO`, `TAREAS_SECRETO` (secreto), `INGESTA_CONTACTO` | `otea-tareas` | `inactivo` | Ingesta y puerta de las tareas (§13) |
| `BORRADORES_MODO`, `BORRADORES_ANTHROPIC_API_KEY` (secreto), `BORRADORES_MODELO`, `BORRADORES_PRECIO_ENTRADA`, `BORRADORES_PRECIO_SALIDA`, `BORRADORES_TOPE_MENSUAL_USD` (≤ 5), `BORRADORES_LLAMADAS_MES`, `BORRADORES_POR_CORRIDA` | `otea-tareas` | `apagado` | Borradores con IA, de pago (§14) |
| `IA_TOPE_TOTAL_USD` | los dos | sin tope | Tope acumulado de toda la IA (decisión 2 de §11) |
| `CUENTAS_MODO=invitacion` | sitio | `cerradas` | Acceso anticipado privado (§12) |
| `RESUMEN_MODO`, `RESUMEN_ENVIOS_DIARIOS` | `otea-tareas` (el cupo, en los dos) | `apagado`, 30 | Resumen diario (§16) |
| `WAITLIST_ENVIOS_DIARIOS` | los dos | **50** (antes 80) | Su parte del cupo de Resend: la suma de los tres ≤ 100 |
| `DONACIONES_URL` | sitio | sin enlace | Aportes (§15) |

Las de prueba (`INGESTA_URL_PRUEBA`, `BORRADORES_URL_API_PRUEBA`, `RESEND_URL_API_PRUEBA`) solo se admiten con `OTEA_E2E=1`: nunca en
producción. Una variable inválida o incompleta hace fallar `/api/salud` y la revisión no recibe tráfico.

### Cloud Scheduler

| Trabajo | Horario (America/Santiago) | Destino | Qué hace |
|---|---|---|---|
| `otea-ingesta` | `17 * * * *` | `POST $URL_TAREAS/api/tareas/ingesta` | Lee los feeds verificados, agrupa en eventos y, con `BORRADORES_MODO=ia`, **redacta los borradores al final de la misma corrida** (§13, §14) |
| `otea-resumen` | `41 7 * * *` | `POST $URL_TAREAS/api/tareas/resumen` | Envía el resumen diario (§16) |

Los **borradores no tienen trabajo propio**: corren dentro de la corrida de la ingesta, con su turno tomado y el plazo de 270 s (un
borrador que la dueña pide en el panel lo redacta la corrida siguiente). Son dos de los tres trabajos gratuitos por cuenta de
facturación; los dos usan `sa-programador` (OIDC, solo `run.invoker` sobre `otea-tareas`) y el encabezado `X-Otea-Tarea`. Al rotar
`TAREAS_SECRETO`, actualiza el secreto, despliega `otea-tareas` y los **dos** trabajos (`--update-headers=X-Otea-Tarea=…`).

### Activar cada pieza (en este orden)

1. **Acceso privado** (§12): migración `0009`, `CUENTAS_SECRETO`, emitir códigos y `CUENTAS_MODO=invitacion`. Desde ya, `/alertas`
   muestra lo real solo con sesión.
2. **Ingesta** (§13): al menos un feed verificado en `data/sources.seed.json`, migraciones `0007` y `0008`, `otea-tareas` con
   `TAREAS_MODO=activo` y el trabajo `otea-ingesta`. La cola de `/admin/eventos` funciona a mano desde la primera corrida.
3. **Borradores con IA** (§14, de pago): migración `0010`, espacio de trabajo de Anthropic con límite de US$ 5, `npm run
   borradores:probar`, `lectura_ia` en las fuentes que la permitan y `BORRADORES_MODO=ia`.
4. **Resumen diario** (§16): migración `0011`, reparto de la cuota, `RESUMEN_MODO=activo` y el trabajo `otea-resumen`.
5. **Alertas de Cloud Monitoring**: sin corridas de la ingesta en 3 h (§13, «Vigilarla») y accesos fallidos al panel (§9). Después,
   la rutina de cada mañana: [`rutina-diaria.md`](rutina-diaria.md).

### Apagar de inmediato

| Pieza | Comando (el efecto es inmediato en la revisión nueva) |
|---|---|
| Resumen diario | `gcloud scheduler jobs pause otea-resumen --location $REGION` y `gcloud run services update otea-tareas --region $REGION --update-env-vars RESUMEN_MODO=apagado` |
| Borradores con IA | `gcloud run services update otea-tareas --region $REGION --update-env-vars BORRADORES_MODO=apagado`; si se sospecha de la clave, revocarla en la consola de Anthropic |
| Ingesta (y con ella los borradores) | `gcloud scheduler jobs pause otea-ingesta --location $REGION` y `--update-env-vars TAREAS_MODO=inactivo` (también apaga el resumen: sus rutas dan 404) |
| Acceso privado | `gcloud run services update otea-austral --region $REGION --update-env-vars CUENTAS_MODO=cerradas` (nadie entra; `/alertas` vuelve a solo ejemplos) |
| Una alerta publicada con un error | Corregirla o retractarla en `/admin/alertas/[id]` (queda la corrección pública; nada se borra) |
| Aportes | `gcloud run services update otea-austral --region $REGION --remove-env-vars DONACIONES_URL` |

Todo de una vez (incidente): pausa los dos trabajos, `TAREAS_MODO=inactivo` en `otea-tareas` y `CUENTAS_MODO=cerradas` en el sitio;
después sigue `docs/seguridad/respuesta-incidentes.md`.
