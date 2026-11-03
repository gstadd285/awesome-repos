-- 0007 · Ingesta de metadatos de las fuentes del registro (docs/alertas-reales.md §2).
--
-- La ingesta lee solo los feeds verificados del registro y guarda **metadatos**: título, enlace, fecha, organismo
-- (por `source_id`) e identificador. Nunca el texto de la fuente (regla 6 de CLAUDE.md): ninguna columna de estas
-- tablas puede guardarlo, y una prueba de integración compara las columnas de `fuente_items` con una lista cerrada.
-- Corre solo en el servicio privado `otea-tareas` con `TAREAS_MODO=activo`; en el sitio público no existe.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Ítems vistos en los feeds (solo agregar) ───────────────────────────────

create table fuente_items (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references fuentes (id),
  feed_url text not null check (feed_url ~ '^https://[^[:space:]]+$' and char_length(feed_url) <= 2048),
  -- sha256(source_id ‖ "\n" ‖ (guid normalizado o URL canónica)): la deduplicación no depende del título ni de la fecha.
  clave text not null check (clave ~ '^[0-9a-f]{64}$'),
  titulo text not null check (char_length(titulo) between 1 and 300),
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 2048),
  identificador text check (identificador is null or char_length(identificador) between 1 and 120),
  publicado timestamptz,                         -- lo que declara el feed (puede faltar o ser inválido: entonces nulo)
  visto timestamptz not null default now(),
  constraint fuente_items_unico unique (source_id, clave)
);

create index fuente_items_recientes on fuente_items (visto desc);

create trigger fuente_items_solo_agregar before update or delete on fuente_items
  for each row execute function otea_rechazar();
create trigger fuente_items_sin_vaciar before truncate on fuente_items
  for each statement execute function otea_rechazar();

-- ── Estado de cada feed (se actualiza) ─────────────────────────────────────

create table ingesta_feeds (
  feed_url text primary key check (feed_url ~ '^https://[^[:space:]]+$' and char_length(feed_url) <= 2048),
  source_id text not null references fuentes (id),
  etag text check (etag is null or char_length(etag) <= 200),
  ultima_modificacion text check (ultima_modificacion is null or char_length(ultima_modificacion) <= 100),
  ultimo_intento timestamptz,
  ultimo_ok timestamptz,
  fallos_seguidos integer not null default 0 check (fallos_seguidos >= 0),
  pausado_hasta timestamptz,
  robots text not null default 'sin_revisar' check (robots in ('sin_revisar', 'permitido', 'prohibido')),
  robots_revisado timestamptz,
  -- Un código (`tiempo`, `tamano`, `robots_prohibido`…), nunca un mensaje ni una URL.
  ultimo_error text check (ultimo_error is null or ultimo_error ~ '^[a-z_]{1,40}$')
);

-- ── Corridas (solo agregar) ────────────────────────────────────────────────

create table ingesta_corridas (
  orden bigint generated always as identity primary key,
  tarea text not null check (tarea in ('ingesta', 'resumen')),
  inicio timestamptz not null,
  fin timestamptz not null,
  feeds integer not null check (feeds >= 0),
  nuevos integer not null check (nuevos >= 0),
  fallos integer not null check (fallos >= 0),
  borradores integer not null default 0 check (borradores >= 0),
  costo_micros bigint not null default 0 check (costo_micros >= 0),
  resultado text not null check (resultado in ('ok', 'parcial', 'fallida', 'omitida')),
  constraint ingesta_corridas_fechas check (fin >= inicio)
);

create trigger ingesta_corridas_solo_agregar before update or delete on ingesta_corridas
  for each row execute function otea_rechazar();
create trigger ingesta_corridas_sin_vaciar before truncate on ingesta_corridas
  for each statement execute function otea_rechazar();

-- ── Turno de cada tarea ────────────────────────────────────────────────────
-- Evita dos corridas a la vez sin candados de sesión (el agrupador de Neon no los conserva): tomar el turno es un
-- `update … where ocupado_hasta < now() returning …` de una sola fila.

create table tareas_turnos (
  tarea text primary key check (tarea in ('ingesta', 'resumen')),
  ocupado_hasta timestamptz not null default '-infinity'
);

insert into tareas_turnos (tarea) values ('ingesta'), ('resumen');

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────
-- Altas y cambios solo en las columnas que escribe la ingesta. Sin borrados en ninguna tabla.

grant select on fuente_items to otea_app;
grant insert (source_id, feed_url, clave, titulo, url, identificador, publicado) on fuente_items to otea_app;

grant select on ingesta_feeds to otea_app;
grant insert (feed_url, source_id) on ingesta_feeds to otea_app;
grant update (etag, ultima_modificacion, ultimo_intento, ultimo_ok, fallos_seguidos, pausado_hasta, robots,
  robots_revisado, ultimo_error) on ingesta_feeds to otea_app;

grant select on ingesta_corridas to otea_app;
grant insert (tarea, inicio, fin, feeds, nuevos, fallos, borradores, costo_micros, resultado) on ingesta_corridas to otea_app;

grant select on tareas_turnos to otea_app;
grant update (ocupado_hasta) on tareas_turnos to otea_app;

alter table fuente_items enable row level security;
alter table ingesta_feeds enable row level security;
alter table ingesta_corridas enable row level security;
alter table tareas_turnos enable row level security;

create policy fuente_items_lectura on fuente_items for select to otea_app using (true);
create policy fuente_items_alta on fuente_items for insert to otea_app with check (true);

create policy ingesta_feeds_lectura on ingesta_feeds for select to otea_app using (true);
-- Un feed nace sin historia: ni fallos, ni pausa, ni robots revisado.
create policy ingesta_feeds_alta on ingesta_feeds for insert to otea_app
  with check (fallos_seguidos = 0 and pausado_hasta is null and robots = 'sin_revisar');
create policy ingesta_feeds_cambio on ingesta_feeds for update to otea_app using (true) with check (true);

create policy ingesta_corridas_lectura on ingesta_corridas for select to otea_app using (true);
create policy ingesta_corridas_alta on ingesta_corridas for insert to otea_app with check (true);

create policy tareas_turnos_lectura on tareas_turnos for select to otea_app using (true);
-- Un turno no se reserva por más de 15 minutos: una corrida colgada no bloquea las siguientes para siempre.
create policy tareas_turnos_cambio on tareas_turnos for update to otea_app
  using (true) with check (ocupado_hasta <= now() + interval '15 minutes');
