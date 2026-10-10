# Despliegue · Otea Austral en Google Cloud Run

Guía para poner Otea Austral en producción con **Cloud Run** (la aplicación), **Neon** (Postgres) y
**Resend** (correo de confirmación). Una sola imagen de contenedor sirve a cualquier entorno: la
configuración llega como variables de entorno al ejecutar y los secretos, desde Secret Manager.

> **Qué está probado y qué no.** La imagen se construye y se prueba en la CI (job `contenedor`): corre
> sin privilegios, responde la sonda, envía la CSP y las cabeceras de seguridad, lee la URL del sitio
> al ejecutar y una configuración insegura hace fallar la sonda. Los comandos de `gcloud` y la
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
  solo la puedes activar tú.
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
4. **La aplicación nunca recibe el rol dueño.** Solo tiene los permisos mínimos de la migración
   `0001`, por columna: la auditoría y las correcciones admiten `SELECT` e `INSERT` (y un disparador
   rechaza `UPDATE`, `DELETE` y `TRUNCATE` aunque alguien los concediera); las alertas no se borran
   nunca; solo la lista de espera admite `DELETE`. El usuario tiene además límite de conexiones y de
   tiempo por consulta.

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
for s in otea-database-url otea-resend-api-key otea-admin-clave-hash \
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
  el `Dockerfile`); la CI la construye y prueba antes de aceptarla.
- **Vencimientos.** `security.txt` expira el 2027-04-01: renuévalo (ver `SECURITY.md`).
