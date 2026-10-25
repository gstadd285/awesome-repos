# Alertas reales · diseño técnico

Fase **F1** (2026-10-25): verificación de fuentes y este diseño. Fase **F2** (2026-10-25): la ingesta de metadatos (§2) está
implementada, probada contra fuentes falsas y **apagada por omisión** (§2.4); hoy no tiene nada que leer. Fase **F3**
(2026-10-25): la agrupación en eventos candidatos y la cola manual sin IA de `/admin` (§3.1); sin datos reales que agrupar
todavía. Fase **F4** (2026-10-25): el acceso privado por invitación (§6.1), **apagado por omisión** (`CUENTAS_MODO=cerradas`); desde
ya, `/alertas` muestra lo real solo con sesión. F5 y F6 siguen sin implementar. El plan está en §10; cada fase deja el sitio desplegable y con las pruebas en verde.

Encargo de la dueña: un sistema lee las fuentes oficiales del registro y arma borradores; Claude redacta **un borrador por
evento** con un tope duro de **US$ 5 al mes** (autorizado solo para esto); ella aprueba o descarta cada uno en `/admin` y
**nada se publica sin su aprobación**; lanzamiento **privado** (solo cuentas por invitación) mientras un abogado revisa los
textos legales. Presupuesto del proyecto: unos US$ 40, solo planes gratuitos salvo el dominio (~US$ 12 al año) y la IA.

## 0. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | La ingesta corre en un **segundo servicio de Cloud Run, privado** (`otea-tareas`, misma imagen), llamado por **Cloud Scheduler con OIDC** a `POST /api/tareas/ingesta`. No un Cloud Run Job | Un Job necesita otro punto de entrada compilado fuera de Next.js (la imagen solo lleva la salida `standalone`) y otra cadena de build y escaneo. El servicio privado reutiliza imagen, `env.ts`, base y registros; la plataforma rechaza a quien no tenga `run.invoker` antes de llegar al código. El servicio público **nunca** tiene la clave de Anthropic de los borradores ni hace peticiones a las fuentes |
| D2 | Se leen **solo las URL exactas de `feeds`** del registro, y cada enlace que llegue en ellas debe estar **en el dominio de su fuente** (`dentroDelDominio`) | La lista de permitidos es el propio registro, revisado en Git, con fecha de verificación por feed |
| D3 | En la base solo **metadatos** (título, enlace, fecha, organismo, identificador). El texto de la fuente vive **en memoria** durante una redacción y se descarta | Regla 6 de `CLAUDE.md` y riesgo de derechos de autor |
| D4 | Modelo **`claude-haiku-5-5`**, `effort: "low"`, salida estructurada, **sin herramientas**. Tope **mensual** en Postgres (patrón de `asistente_uso`) **y** límite de gasto del espacio de trabajo en la consola de Anthropic, con una **clave propia** | Es el único modelo que cabe en US$ 5 al mes con margen (§4.1); dos barreras independientes |
| D5 | El borrador vive en su **propia tabla**; la alerta nace cuando la dueña lo **acepta**, con `rules.ts` (`crearAlerta` y después revisión, aprobación y publicación) | La IA nunca escribe en `alertas`; la auditoría muestra a la dueña como autora y el origen del borrador en la nota |
| D6 | La IA lee el texto **solo de fuentes con `lectura_ia: true`** (campo nuevo, por omisión `false`), que exige condiciones «Verificadas» que lo permitan | El FMI prohíbe usar su contenido con modelos de lenguaje sin permiso; la OPEP y el BIS restringen copiar y traducir (`docs/fuentes-pendientes.md`). Por omisión, no se lee |
| D7 | `CUENTAS_MODO=invitacion`: códigos de un solo uso emitidos desde `/admin`, guardados con HMAC. `/alertas` muestra lo real **solo con sesión**; sin sesión, los ejemplos | Lanzamiento privado sin otra infraestructura |
| D8 | **Ninguna alerta real se publica antes de cerrar F4** (puerta de `/alertas`). **Cerrada el 2026-10-25**: sin sesión, `/alertas` muestra solo ejemplos | Antes de F4, `/alertas` mostraba en público todo lo publicado |

**Punto de partida (2026-10-25): 0 de 17 fuentes con feed verificado** (`docs/fuentes-pendientes.md`). La ingesta no
tiene nada que leer hasta que la dueña permita los dominios o compruebe los feeds a mano (criterio de entrada de F2).

## 1. Recorrido

```
Cloud Scheduler ──OIDC + X-Otea-Tarea──▶ otea-tareas  POST /api/tareas/ingesta   (cada hora, :17)
   turno en la base ─▶ robots.txt ─▶ feeds del registro ─▶ fuente_items (solo metadatos)
   ─▶ agrupar ─▶ eventos_candidatos ─▶ ¿puntaje ≥ umbral, lectura_ia y presupuesto?
   ─▶ lectura transitoria (memoria) ─▶ Claude (sin herramientas) ─▶ revisión de la salida ─▶ borradores
/admin/eventos (dueña) ─▶ aceptar = crearAlerta + fuentes ─▶ revisión ─▶ aprobar ─▶ publicar (rules.ts)
/alertas: con sesión, lo publicado real; sin sesión, ejemplos       POST /api/tareas/resumen (07:41) ─▶ Resend
```

## 2. Ingesta (F2)

### 2.1 Dónde y cómo corre

- `otea-tareas`: `gcloud run deploy` con `--no-allow-unauthenticated --max-instances=1 --concurrency=1 --timeout=300`, cuenta
  de servicio propia (`sa-tareas`) que solo lee sus secretos; `TAREAS_MODO=activo`. En el servicio público la variable no
  existe y las rutas `/api/tareas/*` responden 404.
- Cloud Scheduler (`--schedule="17 * * * *" --time-zone="America/Santiago" --http-method=POST`) con
  `--oidc-service-account-email` de una cuenta (`sa-programador`) que solo tiene `roles/run.invoker` sobre `otea-tareas`, y el
  encabezado `X-Otea-Tarea` con `TAREAS_SECRETO`. Dos barreras: IAM de la plataforma y secreto comparado en tiempo constante.
- La ruta: solo `POST` y sin cuerpo (con `Content-Length` mayor que 0 no lo lee), 404 ante cualquier falla de las puertas (no
  revela que existe).
  Responde solo conteos. Un **turno en la base** (`tareas_turnos`: `update … set ocupado_hasta = now() + interval '10
  minutes' where ocupado_hasta < now() returning 1`) evita dos corridas a la vez sin depender de candados de sesión, que el
  pooler de Neon no conserva. Si no hay turno, registra la corrida como `omitida`.
- Presupuesto de tiempo: 4 minutos por corrida; lo que no alcanza queda para la siguiente.

### 2.2 Qué lee y con qué límites

Solo fuentes `activa` con `acceso` `rss` o `api` y condiciones «Verificadas el …» (invariante nueva de `registry.test.ts` en
F2). `src/lib/ingesta/descarga.ts` es **el único archivo** de la ingesta y los borradores que hace `fetch` (lo vigila
`arquitectura.test.ts`):

| Límite | Valor | Nota |
|---|---|---|
| Destinos | URL exacta de `feeds`; enlaces de ítems con `dentroDelDominio(url, url_base)` | https, puerto 443, sin credenciales ni IP literales |
| Redirecciones | `redirect: "manual"`, hasta 3, cada salto se vuelve a validar | Un salto fuera del dominio corta la lectura |
| Tiempo | 10 s por solicitud (`AbortSignal.timeout`), 4 min por corrida | |
| Tamaño | 1 MB por feed, 2 MB por documento, leídos en flujo y cortados | Nunca `await res.text()` sin tope |
| Tipo | `application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`, `application/json` (API), `text/html` (documento) | PDF: el borrador queda «lectura manual» |
| Ritmo | Secuencial, ≥ 2 s entre solicitudes al mismo host; `Retry-After` respetado (máx. 24 h) | La SEC pide ≤ 10 por segundo |
| Fallos | 3 seguidos ⇒ feed en pausa 24 h y aviso en `/admin` | |
| Identidad | `User-Agent: OteaAustral/1.0 (+https://oteaustral.com/fuentes; INGESTA_CONTACTO)` | La SEC exige organización y contacto: un correo **de rol**, no personal |
| Caché | `If-None-Match` / `If-Modified-Since` con lo guardado en `ingesta_feeds` | 304 no cuesta nada |

- **robots.txt**: se lee por host cada 24 h; analizador propio (grupos `User-agent`, `Allow`/`Disallow` con la coincidencia más
  larga, `*` y `$`). Prohibido ⇒ feed en pausa y aviso. Si `robots.txt` responde 5xx o no llega, no se lee el feed; 404 = permitido.
- **Lector de feeds propio** (RSS 2.0 y Atom 1.0) sin dependencias: rechaza documentos con `<!DOCTYPE` o `<!ENTITY` (sin
  expansión de entidades), y solo extrae `title`, `link`, `guid`/`id` y `pubDate`/`published`/`updated`. **La `description` no
  se lee.** El título se decodifica, se le quitan etiquetas y caracteres de control y se corta en 300.
- **Deduplicación**: `clave = sha256(source_id ‖ "\n" ‖ (guid normalizado o URL canónica))`; URL canónica: host en minúsculas,
  sin fragmento ni `utm_*`, sin barra final. `insert … on conflict (source_id, clave) do nothing`.

### 2.3 Tablas (migración `0007_ingesta.sql`)

```sql
create table fuente_items (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references fuentes (id),
  feed_url text not null check (feed_url ~ '^https://[^[:space:]]+$' and char_length(feed_url) <= 2048),
  clave text not null check (clave ~ '^[0-9a-f]{64}$'),
  titulo text not null check (char_length(titulo) between 1 and 300),
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 2048),
  identificador text check (identificador is null or char_length(identificador) between 1 and 120),
  publicado timestamptz,                         -- lo que declara el feed (puede faltar)
  visto timestamptz not null default now(),
  constraint fuente_items_unico unique (source_id, clave)
);
create index fuente_items_recientes on fuente_items (visto desc);
-- Solo agregar: sin texto de la fuente, sin cambios, sin borrados.
create trigger fuente_items_solo_agregar before update or delete on fuente_items
  for each row execute function otea_rechazar();
create trigger fuente_items_sin_vaciar before truncate on fuente_items
  for each statement execute function otea_rechazar();

create table ingesta_feeds (                     -- estado de cada feed (se actualiza)
  feed_url text primary key check (feed_url ~ '^https://[^[:space:]]+$' and char_length(feed_url) <= 2048),
  source_id text not null references fuentes (id),
  etag text check (etag is null or char_length(etag) <= 200),
  ultima_modificacion text check (ultima_modificacion is null or char_length(ultima_modificacion) <= 100),
  ultimo_intento timestamptz, ultimo_ok timestamptz,
  fallos_seguidos integer not null default 0 check (fallos_seguidos >= 0),
  pausado_hasta timestamptz,
  robots text not null default 'sin_revisar' check (robots in ('sin_revisar', 'permitido', 'prohibido')),
  robots_revisado timestamptz,
  ultimo_error text check (ultimo_error is null or ultimo_error ~ '^[a-z_]{1,40}$')   -- código, nunca un mensaje
);

create table ingesta_corridas (                  -- una fila por corrida, solo agregar
  orden bigint generated always as identity primary key,
  tarea text not null check (tarea in ('ingesta', 'resumen')),
  inicio timestamptz not null, fin timestamptz not null check (fin >= inicio),
  feeds integer not null check (feeds >= 0), nuevos integer not null check (nuevos >= 0),
  fallos integer not null check (fallos >= 0), borradores integer not null default 0 check (borradores >= 0),
  costo_micros bigint not null default 0 check (costo_micros >= 0),
  resultado text not null check (resultado in ('ok', 'parcial', 'fallida', 'omitida'))
);
-- + disparadores otea_rechazar (update, delete, truncate) como fuente_items.

create table tareas_turnos (tarea text primary key check (tarea in ('ingesta', 'resumen')),
  ocupado_hasta timestamptz not null default '-infinity');
insert into tareas_turnos (tarea) values ('ingesta'), ('resumen');

grant select, insert (source_id, feed_url, clave, titulo, url, identificador, publicado) on fuente_items to otea_app;
grant select, insert, update (etag, ultima_modificacion, ultimo_intento, ultimo_ok, fallos_seguidos, pausado_hasta,
  robots, robots_revisado, ultimo_error) on ingesta_feeds to otea_app;
grant select, insert (tarea, inicio, fin, feeds, nuevos, fallos, borradores, costo_micros, resultado) on ingesta_corridas to otea_app;
grant select, update (ocupado_hasta) on tareas_turnos to otea_app;

alter table fuente_items enable row level security;      -- y las otras tres
create policy fuente_items_lectura on fuente_items for select to otea_app using (true);
create policy fuente_items_alta on fuente_items for insert to otea_app with check (true);
create policy ingesta_feeds_lectura on ingesta_feeds for select to otea_app using (true);
create policy ingesta_feeds_alta on ingesta_feeds for insert to otea_app with check (fallos_seguidos = 0);
create policy ingesta_feeds_cambio on ingesta_feeds for update to otea_app using (true) with check (true);
create policy ingesta_corridas_lectura on ingesta_corridas for select to otea_app using (true);
create policy ingesta_corridas_alta on ingesta_corridas for insert to otea_app with check (true);
create policy tareas_turnos_lectura on tareas_turnos for select to otea_app using (true);
create policy tareas_turnos_cambio on tareas_turnos for update to otea_app using (true) with check (true);
```

Volumen: ~50 ítems al día ≈ 10 MB al año; cabe de sobra en el plan gratuito de Neon.

### 2.4 Implementado en F2 (lo que se precisó al construirlo)

Código en `src/lib/ingesta/` (`descarga`, `robots`, `feeds`, `canonica`, `servicio`, `almacen-postgres`, `turno`, `instancia`),
`src/lib/tareas/exigir.ts`, `src/app/api/tareas/ingesta/route.ts` y `db/migraciones/0007_ingesta.sql`; operación en
`docs/despliegue.md` §13. Sobre lo escrito arriba:

- **La ruta responde 404 a los siete métodos** (todos pasan por `exigirTarea`, que llama `notFound()`): sin eso Next.js contestaría
  405 u `OPTIONS` con `Allow` y delataría la ruta. El 404 va sin cuerpo (el de una ruta inexistente trae la página de error): la ruta
  no es secreta (está en el repositorio); lo que importa es que no hace nada ni revela configuración. Un rechazo con
  `TAREAS_MODO=activo` deja el evento `tarea` · `rechazada`; en el sitio público no se anota nada (sería ruido de escáneres).
- **`robots.txt`**: 404 y 410 = permitido; cualquier otra respuesta, sin respuesta o un tipo distinto de `text/plain` ⇒ no se lee el
  feed y cuenta como fallo (`robots_no_disponible`). Se lee una vez por host y corrida, y el veredicto de cada feed vale 24 h.
- **Formato `api`**: el lector genérico es **JSON Feed 1.x** (`application/json` o `application/feed+json`). Una API oficial con otra
  forma (BCCh, CMF, EIA) necesitará su adaptador en `feeds.ts` al verificarse.
- **Codificación**: solo UTF-8 y Latin-1 (del `charset` o de la declaración XML); otra ⇒ `codificacion`, sin adivinar.
- **Títulos**: además de lo de §2.2 se quitan los caracteres invisibles y de dirección (suplantación); 300 puntos de código, como
  `char_length`. Un enlace relativo se resuelve contra el feed y luego se valida; un ítem sin título o con enlace fuera del dominio
  se descarta; una fecha inválida, anterior a 1995 o más de un día en el futuro queda nula (el ítem se guarda).
- **Turno**: se toma con la «ficha» (`ocupado_hasta` como texto) y se suelta solo si sigue siendo la propia; la política de RLS no
  deja reservarlo por más de 15 minutos. `ingesta_feeds` nace sin historia (`fallos_seguidos = 0`, sin pausa, robots `sin_revisar`)
  y sus altas y cambios son por columna.
- **User-Agent**: `OteaAustral/1.0 (+⟨NEXT_PUBLIC_SITE_URL⟩/fuentes; ⟨INGESTA_CONTACTO⟩)`. El contacto se valida como `mailto:` sin
  espacios ni paréntesis.
- **Pruebas sin red**: `INGESTA_URL_PRUEBA` (solo con `OTEA_E2E=1`) reescribe cada solicitud ya validada a `/<host>/<ruta>` del
  servidor de fuentes falsas (`scripts/lib/fuentes-falsas.mjs`, fixtures en `e2e/fixtures/fuentes/`). En la e2e, la instancia 3201
  hace de `otea-tareas`.
- **Cloud Scheduler** necesita `--attempt-deadline=300s` (por omisión espera 3 minutos y la corrida puede durar 4). El encabezado con
  el secreto queda en la configuración del trabajo: por eso IAM es la primera barrera.
- **Perfil NIST**: PR-19 queda «parcial» (implementada, apagada); PR-20, PR-21 y DE-05, «objetivo». ID-02 ya nombra la salida a los
  feeds.

## 3. Agrupación en eventos candidatos (F3)

`src/lib/ingesta/agrupar.ts`: función pura (ítems sin evento + eventos abiertos + `ahora`) → asignaciones. Determinista y con
pruebas de tabla.

- **Tema**: los `temas` de la fuente del registro, afinados por un léxico por tema en español e inglés (`tasa`, `rate`,
  `copper`, `cobre`, `crude`, `OPEC+`, `tariff`, `aranceles`, `sanctions`…). Sin tema claro ⇒ `sin_tema`: va a la cola pero
  nunca a la IA.
- **Mismo evento** si: mismo tema, dentro de una **ventana de 48 h** desde el primer ítem, y (similitud de títulos ≥ 0,35 —
  Jaccard sobre palabras significativas normalizadas— **o** la misma **clave de agenda** detectada por patrones: `FOMC`,
  `RPM`, `IPoM`, `CPI`/`IPC`, `Employment Situation`, reunión OPEP+, `WEO`). Un evento se cierra a las 72 h.
- **Puntaje 0–100** (señales simples): organismos distintos (+25 por cada uno desde el segundo), palabras de decisión
  (`decisión`, `rate decision`, `sanciones`, `recorte`, `cuotas`: +30), prioridad de la fuente (A +15, B +10, C +5), clave de
  agenda (+20), ítem de las últimas 6 h (+10). **Umbral del borrador con IA: 50**, a calibrar en F3 con datos reales (la cola
  muestra todos).
- Migración `0008_eventos.sql`: tabla `eventos_candidatos` (`id uuid`, `tema` (los seis o `sin_tema`), `clave_agenda`,
  `titulo_referencia` (el título del primer ítem: metadato), `primero`, `ultimo`, `puntaje smallint 0–100`, `estado`
  `abierto`·`solicitado`·`con_borrador`·`descartado`·`convertido`, `alert_id` → `alertas`); `fuente_items` recibe `evento_id`
  (se cambia el disparador: solo `update` de `evento_id` de nulo a un valor, una vez; `grant update (evento_id)`), y un
  disparador que solo deja avanzar el `estado`. Grants por columna y RLS con una política por operación.
- `/admin/eventos`: la cola **sin IA** ya sirve: la dueña puede crear una alerta a mano desde un evento con sus fuentes
  precargadas.

### 3.1 Implementado en F3 (lo que se precisó al construirlo)

Código en `src/lib/ingesta/{lexico,agrupar,eventos-postgres,cola-postgres,cola}.ts`, `src/app/admin/eventos/` (cola, detalle y
`acciones.ts`), el tablero en `src/app/admin/page.tsx` y `db/migraciones/0008_eventos.sql`. Sobre lo escrito arriba:

- **Cuándo agrupa**: al final de cada corrida de la ingesta, con el turno todavía tomado y también sin feeds
  (`agruparPendientes`: hasta 500 ítems por corrida, en una transacción; si otra corrida asignó un ítem entretanto se revierte
  y la siguiente lo reintenta). La ruta suma `agrupados` y `eventos_nuevos` a su respuesta; si la agrupación falla, la corrida
  queda `parcial` con el evento `fallo_servicio` · `ingesta_agrupar` y los ítems esperan sin evento.
- **Fechas**: la de un ítem es `publicado` o, si falta, `visto`. Todos los ítems de un evento caben en **48 h** (la ventana se
  ensancha hacia ambos lados). Un evento guardado deja de recibir ítems **72 h** después de su primer ítem (respecto de la
  corrida): un ítem que llega tarde abre otro.
- **Tema**: cada acierto del léxico vale 2 y ser tema de la fuente, 1; gana el máximo si es único (empate ⇒ `sin_tema`).
  Normalización: sin tildes, minúsculas, `OPEP+` entero y una raíz mínima para el plural (tasa/tasas, arancel/aranceles); no
  cuentan las palabras vacías, las de menos de 3 letras, las cifras sueltas ni la marca «(ejemplo)» de los datos de prueba.
- **Agenda**: IPC (Chile) y CPI (EE. UU.) son claves distintas, y **dos claves distintas nunca se unen** aunque los títulos se
  parezcan (un comunicado del FOMC y uno de la RPM con el mismo texto). Entre varios candidatos gana la misma clave y después
  la similitud más alta.
- **Puntaje**: se calcula cuando el evento cambia («últimas 6 h» es respecto de esa corrida). Un evento descartado o convertido
  sigue recibiendo los ítems de su ventana, sin volver a la cola.
- **Base**: `fuente_items.evento_id` pasa de nulo a un valor una vez (disparador, política `using (evento_id is null)` y
  `grant update (evento_id)`); ni el dueño cambia otra columna (`OT001`). En `eventos_candidatos` el estado solo avanza
  (`OT012`), tema, título de referencia y alerta no cambian y la ventana solo se ensancha (`OT011`); nace `abierto` (RLS) y
  `convertido` ⇔ `alert_id`. `evento_auditoria` (solo agregar) guarda `descartado` y `convertido` con el alias del panel.
- **Cola**: `/admin/eventos` (por puntaje y hora, hasta 100), `/admin/eventos/[id]` (señales, confianza posible con
  `calcularConfianza`, fuentes, crear, descartar y auditoría) y el tablero de `/admin` (última corrida, feeds en pausa o con
  fallos, pendientes). Cada fuente enlaza su documento oficial con `safeHref` y `rel="noopener noreferrer"`.
  `crearAlertaDesdeEventoAccion` usa `crearConFuentes` del repositorio de alertas: `crearAlerta` (nota «Desde el evento
  candidato ⟨id⟩ · N fuentes») y una fila `editada` por fuente, como `agregarFuente`; `es_ejemplo` siempre falso; hasta 12
  fuentes cuyos datos salen de `fuente_items` (del formulario solo llegan ids); `fecha_publicacion` = día de Chile de la fecha
  del ítem (nunca posterior a hoy) y `fecha_consulta` = hoy; el evento queda `convertido` en la misma transacción (dos
  conversiones a la vez dan una sola alerta). El descarte admite un motivo opcional (≤ 500 caracteres) para calibrar.
- **Sin acceso privado** (D8): el tablero, la cola, el evento y el detalle de una alerta real en edición avisan «Sin acceso
  privado, no publiques alertas reales». La publicación no cambió.
- **Umbral 50 sin calibrar**: no hay datos reales todavía (ningún feed verificado).

## 4. Borrador con IA (F5)

### 4.1 Modelo y costo

Precios de la referencia de la API incluida en la skill `claude-api` (tabla del 2026-10-06; **no se pudo abrir la página de
precios desde este entorno: confírmalos antes de activar**). Haiku 5.5: US$ 0,10 / 0,50 por millón de tokens de entrada /
salida si el prompt tiene 100.000 tokens o menos (sobre eso, 0,50 / 2,50: el código rechaza prompts estimados sobre 90.000);
lectura de caché 0,1×, escritura de caché de 5 min 1,25×. Un precio por millón de tokens es el costo en micros por token
(`presupuesto.ts`).

Supuestos por borrador. **Típico**: 8.000 tokens de entrada (instrucciones ~1.500, metadatos ~500, documentos ~6.000) y 1.200
de salida (JSON ~500 más el razonamiento con esfuerzo bajo). **Peor caso, lo que se reserva**: 16.400 tokens estimados por lo
alto (3 documentos × 12.000 caracteres ÷ 2,5 + 2.000) × 1,25 por la escritura de caché = 20.500, y la salida completa (3.000).
**Volumen**: ~12 eventos al día sobre el umbral + 20 % de reintentos ≈ 14 llamadas al día ≈ **430 al mes**.

| Modelo | Típico por borrador | Peor caso por llamada | 430 al mes (típico) | 430 al mes (peor caso) |
|---|---|---|---|---|
| **`claude-haiku-5-5`** (US$ 0,10 / 0,50) | 800 + 600 = 1.400 micros ≈ **US$ 0,0014** | 2.050 + 1.500 = 3.550 micros ≈ US$ 0,0036 | **≈ US$ 0,60** | **≈ US$ 1,53** |
| `claude-sonnet-5-5` (US$ 2 / 10) | ≈ US$ 0,028 | ≈ US$ 0,071 | ≈ US$ 12 | ≈ US$ 30 |
| `claude-opus-5-5` (US$ 4 / 20) | ≈ US$ 0,056 | ≈ US$ 0,142 | ≈ US$ 24 | ≈ US$ 61 |

Con Haiku, US$ 5 alcanzan para ~1.400 llamadas al mes **aunque todas costaran el peor caso** (más de 3 veces el volumen
previsto). Sonnet y Opus no caben ni en el caso típico. **Elegido: `claude-haiku-5-5`.** El costo real lo mide
`npm run borradores:probar` (gasta centavos) antes de activar; ahí también se usa `client.messages.countTokens` para comprobar
que el estimador de `presupuesto.ts` queda por encima de lo real (Haiku 5.5 cuenta ~30 % más tokens que Haiku 4.5).
Descartado: la API de lotes (mitad de precio, hasta 24 h de espera: una alerta tardía pierde valor y el margen no lo necesita).

**Ojo con el total del proyecto:** el tope protege el mes, no el proyecto. Quitado el dominio (~US$ 12), quedan ~US$ 28: a tope
lleno, 5 al mes los agotan en unos 5 meses; al gasto previsto (~US$ 0,6–1,5 al mes), en más de un año y medio. Por eso se
agrega un **tope acumulado de toda la IA** (`IA_TOPE_TOTAL_USD`, asistente + borradores, contado en la base): decisión pendiente
de la dueña (§11).

### 4.2 La llamada

`src/lib/borradores/proveedor-borrador.ts` (único archivo que llama al modelo; mismas reglas que `proveedor-anthropic.ts`):

```ts
const cliente = new Anthropic({
  apiKey: env.BORRADORES_ANTHROPIC_API_KEY, authToken: null, webhookKey: null,
  baseURL: URL_API_ANTHROPIC, maxRetries: 1, timeout: 60_000, logLevel: "off",
});
const r = await cliente.messages.parse({
  model: "claude-haiku-5-5",
  max_tokens: 3_000,
  system: [{ type: "text", text: SISTEMA_BORRADOR, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: mensajeConDocumentos }],
  output_config: { effort: "low", format: zodOutputFormat(BorradorModeloSchema) },   // "@anthropic-ai/sdk/helpers/zod"
});
```

- **Sin** `tools`, `tool_choice` ni `mcp_servers`; sin `thinking` (Haiku 5.5 razona de forma adaptativa por omisión), sin
  `temperature`/`top_p`/`top_k` (400), sin relleno del asistente (400) y sin `fallbacks` (Haiku 5.5 no tiene respaldo en el
  servidor). El SDK 0.128.0 instalado trae `messages.parse`, `zodOutputFormat` (Zod 4) y `countTokens`.
- La caché del prompt de sistema (~1.500 tokens; mínimo cacheable de Haiku 5.5: 512) ahorra poco (las llamadas de una corrida
  caen dentro de 5 minutos), pero no cuesta nada mantener el prompt fijo; se registra `cache_read_input_tokens`.
- `stop_reason`: `refusal` ⇒ sin borrador (se anota la categoría); `max_tokens` ⇒ se descarta; `parsed_output` nulo ⇒ se descarta.
- `BorradorModeloSchema` (estricto): `evento` (≤ 160), `resumen` (≤ 600), `filas` 1–6 con `sector` (≤ 80), `direccion`
  (`gana`·`condicionado`·`pierde`) y `condicion` (≤ 240), `impacto_sugerido` (`bajo`·`medio`), `dudas` (0–3, ≤ 200: lo que la
  dueña debería comprobar). **Sin** confianza, tema, fuentes, enlaces ni estado: el API no aplica `maxLength`, el SDK los quita
  del esquema enviado y los valida al recibir; se vuelve a validar con el esquema local.

### 4.3 Lectura transitoria

- Para un evento elegido, hasta **3 documentos** (los enlaces de sus ítems, de fuentes con `lectura_ia: true`), leídos con
  `descarga.ts` y sus límites. Del HTML se quitan `script`, `style`, `nav`, `header` y `footer`, etiquetas y entidades; se toman
  los primeros **12.000 caracteres** por documento (el borrador lleva la bandera `lectura_parcial` si se cortó).
- El texto vive en variables locales de la redacción: no se guarda en la base, no se registra (`logSecurityEvent` solo anota
  códigos), no viaja al navegador y se descarta al terminar. La comprobación anticopia lo usa en memoria.

### 4.4 Inyección de instrucciones en el texto de las fuentes

- **Antes del modelo**: si el texto trae marcas de inyección («ignore previous instructions», «ignora las instrucciones», «system
  prompt», «you are now», `<|`, etiquetas `</documento`), no se llama al modelo: el evento queda «lectura manual» con la bandera
  `posible_inyeccion` (una web oficial con eso merece mirarse).
- **En el prompt**: cada documento va entre `<documento n="1" limite="⟨nonce aleatorio⟩">…</documento ⟨nonce⟩>`, sin
  ocurrencias del nonce en el texto; el sistema declara que su contenido es dato, no instrucciones.
- **Por construcción**: sin herramientas ni secretos ni red; la salida es JSON con campos cerrados; tema, fuentes, enlaces,
  confianza y estado los pone el código; nada se publica sin la dueña.
- **Después**: la revisión de §4.5 rechaza enlaces, HTML, cifras inventadas y lenguaje de recomendación.

### 4.5 Revisión de la salida (en este orden)

1. **Zod** estricto (`BorradorModeloSchema` local).
2. **Forma**: sin URL, correos, HTML ni Markdown; cada `condicion` con un marcador condicional («si», «podría», «en caso de»,
   «cuando», «mientras»); si falta, bandera `sin_condicion`.
3. **Política de lenguaje**: `frasesProhibidas` de `src/lib/domain/lenguaje.ts` en `evento`, `resumen`, `condicion` y `dudas`.
4. **Cifras**: todo número de dos o más dígitos del borrador debe aparecer en algún documento o título (la misma idea de
   `salida.ts` del asistente).
5. **Anticopia**: texto normalizado (sin tildes, minúsculas, solo letras y números). Se rechaza si hay una secuencia común de
   **10 o más palabras** con la fuente, o si más del **10 %** de los 5-gramas del borrador están en ella (umbrales a calibrar en
   F5 con comunicados reales en español del BCCh y la CMF y paráfrasis propias). Se guardan solo las dos cifras.
6. **Reglas de negocio**: tema = el del evento; `impacto` = el sugerido (nunca `alto`: solo la dueña, y `rules.ts` exige dos
   organismos); fuentes = los ítems del evento; **confianza calculada** con `calcularConfianza` (`respaldo.ts`) y usada como la
   declarada de cada fila (la dueña puede bajarla); el contenido debe pasar la validación de `crearAlerta`.

Si falla 1, 2 (largo) o 5, **un** reintento con una indicación neutra («reescribe con tus palabras, más breve»); si vuelve a
fallar, no hay borrador y se cuenta el motivo. Ningún texto rechazado se guarda.

### 4.6 Tope mensual (migración `0010_borradores.sql`)

Mismo patrón que `asistente_uso` (`0005`), por mes de Chile. Lo común (`Precios`, `costoEnMicros`, `costoMaximoEnMicros`, la
interfaz `Presupuesto`) pasa a `src/lib/ia/gasto.ts` y `asistente/presupuesto.ts` lo reexporta sin cambiar su conducta.

```sql
create table borradores_uso (
  mes date primary key check (extract(day from mes) = 1),
  llamadas integer not null default 0 check (llamadas >= 0),
  costo_micros bigint not null default 0 check (costo_micros >= 0),
  actualizado timestamptz not null default now()
);
-- Disparadores como 0005: el mes no cambia, las llamadas solo suben, sin borrar ni vaciar.
-- SQL_RESERVAR: insert … values (date_trunc('month', now() at time zone 'America/Santiago')::date, 1, $1)
--   on conflict (mes) do update set … where u.llamadas < $3 and u.costo_micros + $1 <= $2 returning 1
```

- Antes de cada llamada se **reserva el peor caso** (§4.1); al terminar se ajusta a `usage` (entrada + caché creada + caché
  leída, con sus precios). Si la base falla, no se llama.
- Topes: `BORRADORES_TOPE_MENSUAL_USD` (el esquema no admite más de 5), `BORRADORES_LLAMADAS_MES` (600 por omisión: ≈ US$ 2,1
  aun en el peor caso), `BORRADORES_POR_CORRIDA` (5) y, si la dueña lo aprueba, `IA_TOPE_TOTAL_USD`.
- **Barrera final**: un espacio de trabajo propio en la consola de Anthropic con **límite de gasto mensual de US$ 5** y su
  propia clave (`BORRADORES_ANTHROPIC_API_KEY`, distinta de la del asistente). Confirmar en la consola que el plan permite
  límites por espacio de trabajo; si no, límite de la organización.

### 4.7 Tabla de borradores (misma migración)

`borradores`: `id uuid`, `evento_id` → `eventos_candidatos`, `contenido jsonb` (el borrador validado, ≤ 8 KB, objeto),
`modelo` (lista cerrada), `entrada_tokens`, `salida_tokens`, `cache_tokens`, `costo_micros`, `copia_proporcion numeric(4,3)`,
`copia_tramo smallint`, `banderas text[]` (lista cerrada), `estado` `pendiente`·`aceptado`·`descartado`, `motivo_descarte`
`irrelevante`·`duplicado`·`impreciso`·`copia`·`otro`, `alert_id` → `alertas`, `creado`, `resuelto`. Disparador: el contenido
no cambia y el estado pasa de `pendiente` a `aceptado` o `descartado` una sola vez; sin borrados. Grants por columna (la app
inserta todo salvo `estado`, `alert_id`, `resuelto`; actualiza solo esos tres) y RLS con una política por operación.

## 5. Revisión en `/admin` (F5; la cola sin IA llega en F3)

- **`/admin` (tablero)**: última corrida y su resultado, feeds en pausa o con fallos, gasto del mes contra el tope, borradores
  pendientes.
- **`/admin/eventos`**: cola ordenada por puntaje y hora; cada evento muestra tema, títulos y enlaces de sus fuentes (se abren
  en pestaña nueva), confianza que tendría, banderas, cifras de anticopia y las dudas del modelo.
- **`/admin/eventos/[id]`**: el borrador en el mismo formulario de alta (editable). Acciones de `src/app/admin/eventos/acciones.ts`,
  todas con `exigirAccionAdmin(formData)`:
  - `aceptarBorradorAccion`: valida lo editado y, en **una transacción**, `crearAlerta` (`rules.ts`, actor = `ADMIN_ALIAS`, nota
    «Desde borrador ⟨id⟩ · claude-haiku-5-5»), `agregarFuente` por cada ítem (título, enlace, `fecha_publicacion` = `publicado`
    o `visto`, `fecha_consulta` = hoy, identificador) y borrador `aceptado`, evento `convertido`. Después sigue el flujo de
    siempre en `/admin/alertas/[id]`: enviar a revisión → aprobar → publicar (`motivosParaNoPublicar`).
  - `descartarBorradorAccion` (motivo obligatorio) y `descartarEventoAccion`.
  - `pedirBorradorAccion`: marca un evento bajo el umbral como `solicitado`; lo redacta la próxima corrida (el servicio público
    no tiene la clave). Cuenta para el tope.
  - `crearAlertaDesdeEventoAccion` (F3): alerta manual con las fuentes del evento precargadas.

## 6. Acceso privado (F4)

- `CUENTAS_MODO=invitacion` (nuevo; exige lo mismo que `abiertas`). `/cuenta/crear` pide además el **código de invitación**.
- Código: 100 bits al azar en base32, mostrado **una vez** como `XXXXX-XXXXX-XXXXX-XXXXX`; se guarda `HMAC-SHA256` con una clave
  derivada por HKDF de `CUENTAS_SECRETO` (propósito `invitaciones`), nunca el código. Migración `0009_invitaciones.sql`:
  `invitaciones` (`id uuid`, `codigo_hash` único, `alias` interno con la forma de `Actor` — sin datos personales —, `emitida`,
  `vence` (≤ 30 días; 14 por omisión), `usada`, `revocada`, `cuenta_id` → `cuentas` con `on delete set null`) y
  `cuenta_tokens.invitacion_id`. Se gasta con una sola sentencia (`update … set usada = now() where codigo_hash = $1 and usada is
  null and revocada is null and vence > now() returning 1`) **en la misma transacción** que crea la cuenta al enviar la
  contraseña. Disparador: `usada` y `revocada` se fijan una vez.
- Un código inválido se dice tal cual (con 100 bits no hay nada que adivinar); límites por IP (10 por hora) y por día. El resto
  del alta no cambia: **misma respuesta exista o no el correo**, y lo que vuelve al navegador nunca incluye el código.
- `/admin/invitaciones`: emitir (alias, vigencia), listar (alias, fechas, estado), revocar. Acciones en
  `src/app/admin/invitaciones/acciones.ts`. Tope de 50 vigentes.
- `/alertas`: `sesionCuentaOpcional()` (nueva en `lib/cuentas/acceso.ts`, no redirige). **Con sesión** (modos `invitacion` o
  `abiertas`): lo publicado real (`es_ejemplo = false`) y un aviso «Acceso anticipado privado · textos legales en revisión».
  **Sin sesión**: las alertas de `src/data/ejemplo.ts` con «Datos de ejemplo» y un enlace para entrar. La respuesta con sesión
  lleva `Cache-Control: private, no-store`. Solo `alertasVisibles(sesion)` llama a `repo.publicas()` (prueba de arquitectura).

### 6.1 Implementado en F4 (lo que se precisó al construirlo)

Código en `src/lib/cuentas/{invitaciones,servicio,almacen,almacen-memoria,almacen-postgres,cifrado}.ts`, `src/app/admin/invitaciones/`,
`src/components/admin/{FormularioInvitacion,AvisoAccesoPrivado}.tsx`, `src/lib/alertas/visibles.ts`, `src/app/alertas/page.tsx` y
`db/migraciones/0009_invitaciones.sql`; operación en `cuentas.md` §13 y `despliegue.md` §12. Sobre lo escrito arriba:

- **Cambió una decisión: un código que no sirve ya no se dice.** El formulario solo valida la **forma** del código; uno que no existe,
  venció, se usó, se revocó o agotó sus correos responde lo mismo que uno bueno y no envía nada (encargo de F4: sin oráculos). Lo
  mismo con un código bueno y un correo que ya tiene cuenta (el aviso de siempre a su dueña; la invitación no se gasta). Quien tenga
  un código y un buzón propio sabe si sirve (llega o no el correo): inevitable.
- **Límites** (todos los pedidos cuentan, sirva o no el código): 10 por hora y 30 por día por IP, 5 por hora por código (su huella) en
  memoria y **5 correos de alta por invitación en la base** (`envios`, común a todas las instancias). Con el cupo diario de altas
  agotado, el alta responde «saturada» antes de mirar el correo o el código (también con `abiertas`): no distingue a nadie.
- **Código**: 20 caracteres del alfabeto base32 de RFC 4648 (100 bits); al comparar, sin espacios ni guiones, en mayúsculas y con 0, 1
  y 8 leídos como O, I y B. HMAC-SHA256 con la clave HKDF `otea:cuentas:invitaciones:v1` de `CUENTAS_SECRETO`.
- **Se gasta al enviar la contraseña**, en la transacción de `activarAlta` (enlace usado, cuenta, `update … usada … where usada is null
  and revocada is null and vence > ahora`, fila `usada` en la auditoría); dos altas a la vez con el mismo código dan una sola cuenta
  (probado con Postgres). Si ya no vale, el enlace lo dice y se borra. El enlace de alta guarda `invitacion_id` y, al renovarse, toma
  la del pedido nuevo. Con `abiertas` las invitaciones no cuentan.
- **Base** (`0009`): `invitaciones` (sin borrado; `usada` y `revocada` una vez, `envios` solo sube, `OT013`; vigencia ≤ 30 días; nace
  vigente por RLS), `invitacion_auditoria` (solo agregar; actor nulo solo en `usada`) y `cuenta_tokens.invitacion_id`. `cuenta_id` →
  `cuentas` con `on delete set null`: por eso la privacidad y «Descargar mis datos» mencionan la invitación (`VERSION_TEXTOS` y
  `VERSION_CONSENTIMIENTO` pasan a `2026-10-borrador-4`).
- **Panel**: `/admin/invitaciones` (emitir con alias y vigencia, el código una sola vez; lista con estado y correos; revocar;
  auditoría). Se puede emitir con cualquier modo si hay base y `CUENTAS_SECRETO` (sin el secreto fijo un código no serviría en otra
  instancia). El aviso de F3 pasa a `AvisoAccesoPrivado`: dice quién verá lo real publicado según `CUENTAS_MODO` (con `cerradas`,
  nadie; con `abiertas`, cualquiera con cuenta; con `invitacion`, las cuentas invitadas).
- **`/alertas`**: no hizo falta `sesionCuentaOpcional`: `sesionCuenta()` ya existía y no redirige. `alertasVisibles(sesion, repo)`
  (`src/lib/alertas/visibles.ts`) es el único que llama a `repo.publicas({ ejemplo })`, que ya no puede pedir las dos clases a la vez.
  Sin sesión: los publicados de ejemplo de la base o, si no hay, los de `src/data/ejemplo.ts`, con un aviso según el modo (por
  invitación, con cuentas o lista de espera); con sesión: solo `es_ejemplo = false` y «Acceso anticipado privado · textos legales en
  revisión». Metadatos fijos; mapa del sitio, `robots.txt`, manifiesto e imagen OG no leen alertas; no hay RSS (lo vigilan
  `arquitectura.test.ts` y la e2e). La página lee la cookie: Next.js la sirve con `Cache-Control: private, no-store`.
- **Pruebas**: e2e `invitaciones.spec.ts` contra una tercera instancia (3202) con `CUENTAS_MODO=invitacion`, misma base y mismo secreto
  que la del 3200, cuyo panel emite los códigos.

## 7. Preferencias y aviso (F6)

- Los temas seguidos y «Resumen pre-apertura» ya existen en la cuenta (`temas`, `resumen_previo`, `guardarPerfilAccion`).
  `/alertas` con sesión ofrece «Solo mis temas».
- **Resumen diario** opcional: `POST /api/tareas/resumen` en `otea-tareas`, a las 07:41 (Scheduler, segundo trabajo). Una vez por
  cuenta y día (`resumen_envios`, clave `(cuenta_id, dia)`, migración `0011_resumen.sql`), solo si hay alertas publicadas en sus
  temas en las últimas 24 h. Contenido: títulos de Otea, tema, confianza y enlace a `/alertas`; nada de texto de las fuentes. Pie:
  cómo dejar de recibirlo (preferencias en `/cuenta`).
- **Cuota de Resend** (100 al día en el plan gratuito, compartida): `WAITLIST_ENVIOS_DIARIOS` + `CUENTAS_ENVIOS_DIARIOS` +
  `RESUMEN_ENVIOS_DIARIOS` ≤ 100, comprobado en `env.ts`. Propuesta para el lanzamiento privado: 50 + 20 + 30.

## 8. Despliegue y operación

### 8.1 Programación (planes gratuitos; confirmar cuotas en las páginas de precios)

| Trabajo de Cloud Scheduler | Horario (America/Santiago) | Destino |
|---|---|---|
| `otea-ingesta` | `17 * * * *` | `POST /api/tareas/ingesta` |
| `otea-resumen` (F6) | `41 7 * * *` | `POST /api/tareas/resumen` |

Dos de los tres trabajos gratuitos por cuenta de facturación. `otea-tareas` con mínimo 0 instancias: ~720 corridas cortas al mes,
dentro de la capa gratuita de Cloud Run. Sin Cloud SQL, balanceador ni Cloud Armor.

### 8.2 Variables nuevas en `env.ts`

| Variable | Valores | Reglas en `superRefine` |
|---|---|---|
| `TAREAS_MODO` | `inactivo` (omisión) · `activo` | `activo` exige `DATABASE_URL`, `TAREAS_SECRETO` e `INGESTA_CONTACTO` |
| `TAREAS_SECRETO` (secreto) | ≥ 256 bits en base64url | Distinto de los demás secretos |
| `INGESTA_CONTACTO` | `mailto:` de rol | Formato de correo |
| `INGESTA_URL_PRUEBA` | URL | Solo con `OTEA_E2E=1` (reescribe el origen hacia el servidor falso; la validación usa la URL original) |
| `BORRADORES_MODO` | `apagado` (omisión) · `ia` | `ia` exige `TAREAS_MODO=activo` y todo lo de abajo, sin valores por omisión |
| `BORRADORES_ANTHROPIC_API_KEY` (secreto) | `sk-ant-…` | Distinta de `ANTHROPIC_API_KEY` |
| `BORRADORES_MODELO` | `claude-haiku-5-5` (lista cerrada) | |
| `BORRADORES_PRECIO_ENTRADA`, `BORRADORES_PRECIO_SALIDA` | US$ por millón de tokens | |
| `BORRADORES_TOPE_MENSUAL_USD` | 0 < x ≤ 5 | El techo autorizado está en el esquema |
| `BORRADORES_LLAMADAS_MES`, `BORRADORES_POR_CORRIDA` | 600, 5 | |
| `IA_TOPE_TOTAL_USD` | opcional | Si la dueña lo aprueba (§11) |
| `BORRADORES_URL_API_PRUEBA` | URL | Solo con `OTEA_E2E=1` |
| `CUENTAS_MODO` | + `invitacion` | Exige lo mismo que `abiertas` |
| `RESUMEN_MODO`, `RESUMEN_ENVIOS_DIARIOS` | `apagado`·`activo`, 30 | Suma de cupos ≤ 100 |

### 8.3 Canarios y vigilancia

- **Canarios de secretos**: `TAREAS_SECRETO` y `BORRADORES_ANTHROPIC_API_KEY` entran en `scripts/lib/canarios.mjs` (y los
  ajustes `TAREAS_MODO=activo`, `BORRADORES_MODO=ia`, `CUENTAS_MODO=invitacion` en `AJUSTES`): `npm run seguridad:canarios` debe
  seguir sin encontrarlos en `.next/`; `canarios.test.ts` lo exige.
- **Vigilancia de la operación**: feed con 3 fallos seguidos, en pausa o sin ítems nuevos en 14 días ⇒ aviso en `/admin`; sin
  evento `tarea` de ingesta en 3 h ⇒ alerta de Cloud Monitoring basada en registros (como la del panel, `docs/despliegue.md` §9);
  gasto ≥ 80 % del tope ⇒ aviso en `/admin`. Los registros (`logSecurityEvent`) llevan solo códigos y conteos.

### 8.4 Inventario para `arquitectura.test.ts`

- **Endpoints**: + `src/app/api/tareas/ingesta/route.ts`, + `src/app/api/tareas/resumen/route.ts` (F6). Prueba nueva: ambas
  llaman primero a `exigirTarea(request)` (modo, método y secreto en tiempo constante) y no leen cuerpo.
- **Server Actions**: + `src/app/admin/eventos/acciones.ts`, + `src/app/admin/invitaciones/acciones.ts` (ambas en la regla de
  «toda acción del panel exige `exigirAccionAdmin`»). `acciones/cuenta.ts` no suma acciones (el código va en `crearCuentaAccion`).
- **Reglas nuevas**: en `src/lib/ingesta/` y `src/lib/borradores/` solo `descarga.ts` hace `fetch`; ninguno lee `process.env` ni
  usa `console`; el proveedor de borradores fija `authToken: null`, `webhookKey: null`, `baseURL`, `logLevel: "off"` y
  `maxRetries: 1`, y su solicitud no tiene `tools`, `tool_choice` ni `mcp_servers`; solo `alertasVisibles` llama a
  `publicas()`; ninguna migración crea columnas para el texto de una fuente (prueba de integración que compara las columnas de
  `fuente_items` y `borradores` con una lista cerrada).

### 8.5 Perfil NIST (`nist-csf.ts`)

Actualizar ID-02 (inventario de datos y conexiones: salidas a las fuentes y a Anthropic desde `otea-tareas`) y GV-04
(proveedores: espacio de trabajo de Anthropic para borradores; condiciones de cada fuente). Nuevos, como `objetivo` en F2 y con
su evidencia al implementarse: **PR-19** «Ingesta limitada al registro de fuentes», **PR-20** «Borradores con IA revisados y gasto
mensual acotado», **PR-21** «Acceso anticipado por invitación», **DE-05** «Vigilancia de la ingesta y del gasto» (≤ 280
caracteres cada descripción).

### 8.6 Rutina diaria de la dueña (estimación, a medir en el lanzamiento privado)

| Cuándo | Qué | Tiempo estimado |
|---|---|---|
| Al empezar el día, en `/admin` | Tablero: última corrida «ok», feeds en pausa, gasto del mes | 2 min |
| Cola de `/admin/eventos` | Por borrador: abrir las fuentes, comprobar hechos y cifras, editar, aceptar → revisión → aprobar → publicar (3–5 min); descartar lo irrelevante (segundos) | 20–40 min con 5–8 borradores |
| Una vez por semana | Consola de Anthropic (gasto), alertas de Cloud Monitoring, invitaciones por vencer, feeds sin novedades | 10 min |

Si un día no hay tiempo, no pasa nada: los borradores esperan (se marcan «viejos» a las 72 h) y nada se publica solo.

## 9. Riesgos y cumplimiento

| Riesgo | Mitigación | Queda |
|---|---|---|
| **Derechos de autor**: copiar texto de una fuente | Solo metadatos en la base; texto en memoria; anticopia; resumen con palabras de Otea; `lectura_ia` por fuente, apagado por omisión | El envío transitorio del texto a Anthropic y el resumen en español (¿traducción u obra derivada?) los evalúa el abogado |
| **Condiciones de cada sitio** (FMI, OPEP, BIS, OMC…) | Ingesta solo con condiciones «Verificadas»; `robots.txt`; ritmo bajo; User-Agent con contacto | Leer cada página completa (hoy, solo extractos) |
| **CMF y no asesoría** | Lenguaje sin recomendaciones (`lenguaje.ts`), filas condicionales, sin precios objetivo ni señales; aviso en cada alerta; temas, no carteras; nada sin revisión humana | Si «quién gana y quién pierde» por tema, a usuarios con cuenta, roza la asesoría de inversión de la Ley 21.521 (Fintec) |
| **Errores de la IA** (cifras, hechos) | Cifras comprobadas contra la fuente; dudas visibles; revisión humana obligatoria; correcciones y retractaciones públicas (`rules.ts`) | Una revisión apurada puede dejar pasar un error |
| **Inyección de instrucciones** | §4.4 | Texto engañoso que no parezca instrucción: lo ve la dueña |
| **Gasto** | Reserva del peor caso, tope mensual en la base, llamadas por mes y por corrida, límite en la consola | El total del proyecto (§4.1): decisión pendiente |
| **Datos personales** (cuentas, preferencias, correos) | Lo de `docs/cuentas.md`: correo cifrado, mínimos datos; el texto enviado a Anthropic es de documentos oficiales | Transferencias internacionales (Google, Neon, Resend, Anthropic) y la Ley 21.719 |
| **Fuentes que cambian o caen** | Estado por feed, pausas, avisos; la cola sin IA sigue sirviendo | Silencios largos de un organismo |

### Lista de verificación para el abogado

- [ ] **Metadatos**: ¿se pueden guardar y mostrar a usuarios con cuenta el título, el enlace, la fecha y el organismo de
      documentos oficiales (Ley 17.336 y condiciones de cada sitio)? ¿Hace falta algo más que citar la fuente?
- [ ] **Lectura transitoria y envío a un proveedor de IA** (Anthropic, EE. UU.) para escribir un resumen propio: ¿es
      reproducción? ¿cabe en alguna excepción (cita, art. 71 B y siguientes)? Revisar fuente por fuente: FMI (prohíbe uso con
      modelos de lenguaje y descarga automatizada sin permiso), OPEP (prohíbe copiar y traducir salvo usos acotados), BIS
      (extractos de hasta 400 palabras), OMC y BCCh (uso comercial y sin alteración), INE (CC BY-SA: ¿alcanza a los resúmenes?),
      AIE (CC BY 4.0 con aviso de no respaldo), BCE (cita y exactitud).
- [ ] **Uso comercial futuro**: si Otea cobra, ¿qué cambia en lo anterior?
- [ ] **Nombres y marcas** de organismos: uso solo para citar, sin logos ni sellos; texto de no afiliación.
- [ ] **Ley 21.521 (Fintec) y normas de la CMF**: ¿alertas por tema con efectos posibles («quién gana y quién pierde, bajo qué
      condición») para personas que eligen temas constituyen asesoría de inversión o recomendación? ¿Registro? Textos de
      advertencia en la alerta, el correo y las condiciones.
- [ ] **Contenido asistido por IA**: cómo informarlo, responsabilidad por errores, política de correcciones visible.
- [ ] **Datos personales**: Ley 19.628 y Ley 21.719 (confirmar fecha de vigencia y obligaciones): base de licitud de cuentas,
      preferencias y resumen por correo; derechos de las personas; transferencias a Google Cloud, Neon, Resend y Anthropic;
      registro de actividades.
- [ ] **Acceso anticipado por invitación**: condiciones propias (versión de prueba, sin garantía de continuidad).
- [ ] **Resumen por correo**: consentimiento explícito (casilla separada) y forma de darse de baja.
- [ ] **Textos legales**: aprobar condiciones de uso, privacidad y aviso legal; subir `VERSION_CONSENTIMIENTO` y
      `VERSION_TEXTOS` a la vez.
- [ ] **Condiciones de Anthropic**: retención, uso de los datos y región de procesamiento de la API.
- [ ] **APIs con credenciales** (BCCh, CMF, EIA): a nombre de quién se registran y si sus términos permiten este uso.

## 10. Plan de implementación

Cada fase: commits pequeños, `npm run lint`, `npm run typecheck`, `npm test` y la e2e que toque, en verde. Ninguna alerta real
se publica antes de cerrar F4.

### F2 · Ingesta de metadatos (hecha el 2026-10-25, apagada; ver §2.4)

- **Entrada**: al menos una fuente con feed verificado y condiciones «Verificadas» (`docs/fuentes-pendientes.md`). **Sigue
  pendiente**: el código quedó listo antes, apagado y sin feeds que leer (una corrida responde `sin_feeds`).
- **Archivos**: `src/lib/ingesta/{descarga,robots,feeds,canonica,servicio,almacen-postgres,turno}.ts`,
  `src/app/api/tareas/ingesta/route.ts`, `src/lib/tareas/exigir.ts`, `db/migraciones/0007_ingesta.sql`, `env.ts`
  (`TAREAS_*`, `INGESTA_*`), `.env.example`, `scripts/lib/canarios.mjs`, `scripts/fuentes-falsas.mjs` (servidor de pruebas),
  `e2e/fixtures/fuentes/` (feeds y `robots.txt` de muestra, fuera de `src/` para que Tailwind no los lea),
  `registry.test.ts` (rss/api ⇒ condiciones «Verificadas»), `docs/despliegue.md` (servicio `otea-tareas` y Scheduler).
- **Pruebas**: lector RSS/Atom (fixtures, DOCTYPE y entidades rechazados, sin `description`); `robots.ts` (tabla de casos);
  `descarga.ts` contra un servidor local (tiempo, tamaño, tipo, redirecciones fuera del dominio, `Retry-After`, 304);
  canonicalización y deduplicación; integración con Postgres (solo agregar, RLS, turno con dos corridas a la vez);
  `exigirTarea` (404 sin modo, sin secreto o con GET); `arquitectura.test.ts` (endpoint nuevo, único `fetch`); canarios.
- **Aceptación**: una corrida contra el servidor falso guarda solo metadatos, sin duplicados en la segunda corrida; un enlace
  fuera del dominio o un `Disallow` no se lee; el servicio público responde 404 en `/api/tareas/ingesta`; costo US$ 0.

### F3 · Eventos candidatos y cola manual (hecha el 2026-10-25; ver §3.1)

- **Archivos**: `src/lib/ingesta/{agrupar,lexico}.ts`, `db/migraciones/0008_eventos.sql`, `src/app/admin/eventos/page.tsx`,
  `[id]/page.tsx`, `acciones.ts` (`descartarEventoAccion`, `crearAlertaDesdeEventoAccion`), tablero en `src/app/admin/page.tsx`.
- **Pruebas**: `agrupar.test.ts` (tabla: mismo tema y ventana, agenda, títulos parecidos y distintos, cierre a 72 h, puntaje);
  integración (evento asignado una sola vez, estado que solo avanza); `arquitectura.test.ts` (acciones nuevas con
  `exigirAccionAdmin`); e2e del panel (cola, crear alerta desde un evento con fuentes precargadas).
- **Aceptación**: con los fixtures, los ítems de una misma decisión de tasas forman un evento; la dueña crea una alerta
  borrador con sus fuentes desde la cola; nada llama a la IA.

### F4 · Acceso privado por invitación (hecha el 2026-10-25, apagada; ver §6.1)

- **Archivos**: `db/migraciones/0009_invitaciones.sql`, `src/lib/cuentas/{invitaciones,acceso}.ts`, `servicio.ts`,
  `almacen-*.ts`, `src/app/cuenta/crear/page.tsx` y su formulario, `src/app/admin/invitaciones/{page,acciones}.ts(x)`,
  `src/app/alertas/page.tsx` (`alertasVisibles`), `env.ts` (`invitacion`), `docs/cuentas.md`.
- **Pruebas**: código de un solo uso con dos activaciones simultáneas (solo una gana), vencido y revocado; el código no vuelve
  en `valores` ni se guarda en claro; misma respuesta exista o no el correo; `/alertas` sin sesión muestra solo ejemplos y con
  sesión solo `es_ejemplo = false`; `Cache-Control` privado; e2e de punta a punta (emitir en el panel → crear cuenta → ver).
- **Aceptación**: sin invitación no se crea ninguna cuenta; una alerta real publicada no aparece sin sesión (HTML, sitemap,
  imagen OG); el modo `abiertas` sigue igual.

### F5 · Borradores con IA y su revisión

- **Archivos**: `src/lib/ia/gasto.ts`, `src/lib/borradores/{lectura,prompt,proveedor-borrador,revision,anticopia,presupuesto-postgres,servicio}.ts`,
  `db/migraciones/0010_borradores.sql`, `schemas.ts` (`lectura_ia` en `Source`), `env.ts` (`BORRADORES_*`, `IA_TOPE_TOTAL_USD`),
  `scripts/lib/anthropic-falso.mjs` (salida estructurada), `scripts/lib/canarios.mjs`, `src/app/admin/eventos/*` (aceptar,
  descartar, pedir), `src/lib/borradores/real.test.ts` + `npm run borradores:probar`, `docs/asistente-ia.md` (gasto común).
- **Pruebas**: revisión de la salida (tabla: recomendación, URL, cifra que no está en la fuente, sin condición); anticopia
  (copia literal, paráfrasis, nombres propios); inyección (marcas en el texto ⇒ no se llama al modelo); `refusal` y
  `max_tokens`; presupuesto mensual con 60 reservas simultáneas en Postgres; sin `lectura_ia` no se lee el texto; e2e con el
  servidor falso de Anthropic (qué recibe y qué **no**: ningún texto de una fuente sin `lectura_ia`); aceptar crea alerta y
  fuentes en una transacción; `arquitectura.test.ts` (proveedor sin herramientas, configuración explícita).
- **Aceptación**: `npm run borradores:probar` (con la clave de la dueña) mide costo real ≤ US$ 0,004 por borrador y el
  estimador por encima de `countTokens`; con el tope agotado no hay llamadas; ningún texto de fuente queda en la base ni en
  los registros; ninguna alerta nace sin la acción de la dueña.

### F6 · Preferencias, resumen diario y operación

- **Archivos**: `src/app/alertas/page.tsx` («Solo mis temas»), `src/lib/resumen/{seleccion,correo,servicio}.ts`,
  `src/app/api/tareas/resumen/route.ts`, `db/migraciones/0011_resumen.sql`, `env.ts` (`RESUMEN_*`, suma de cupos),
  `nist-csf.ts` (PR-19…21, DE-05 con evidencia), `docs/despliegue.md` (Scheduler, alertas de Monitoring),
  `docs/seguridad/programa.md` (riesgos nuevos), `docs/plan.md`.
- **Pruebas**: selección por temas y 24 h; un correo por cuenta y día aunque la tarea corra dos veces; respeto del cupo;
  plantilla sin texto de fuentes; `arquitectura.test.ts` (segundo endpoint); `nist-csf.test.ts`.
- **Aceptación**: con `RESUMEN_MODO=activo` contra el Resend falso, cada cuenta con resumen recibe uno y solo uno; la suma de
  cupos > 100 no arranca; tablero y avisos de operación visibles; la rutina de §8.6 medida una semana.

## 11. Decisiones pendientes de la dueña

1. Permitir los dominios de las fuentes en el entorno (o comprobarlas a mano) para cerrar la verificación (entrada de F2).
2. `IA_TOPE_TOTAL_USD`: tope acumulado de toda la IA para no pasar del presupuesto del proyecto (§4.1). Sugerencia: US$ 15.
3. Qué fuentes reciben `lectura_ia: true`, después de leer sus condiciones completas y la opinión del abogado.
4. Crear el espacio de trabajo y la clave de Anthropic para borradores, con límite mensual de US$ 5 y dos pasos en la cuenta.
5. Correo de rol para `INGESTA_CONTACTO` (aparece en las solicitudes a las fuentes).
6. Reparto de la cuota de Resend (§7).
7. Pasar a `CUENTAS_MODO=invitacion` en producción (con la revisión legal de los textos) y emitir los códigos del acceso anticipado.
