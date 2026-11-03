-- 0001 · Esquema inicial de Otea Austral.
--
-- Lo aplica `npm run db:migrar` con el rol dueño de la base, nunca con el de
-- la aplicación. La aplicación entra con un usuario miembro de `otea_app`
-- (`npm run db:rol-app`), que solo tiene los permisos del final de este
-- archivo. Las reglas de negocio viven en `src/lib/domain/rules.ts`; aquí se
-- repiten las que protegen la integridad aunque la aplicación falle.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Rol de la aplicación (sin LOGIN) ───────────────────────────────────────

do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'otea_app') then
    create role otea_app nologin;
  end if;
end
$$;

-- Nadie más que el dueño crea objetos en el esquema (ya es así desde Postgres 15).
revoke create on schema public from public;

-- ── Registro de fuentes ────────────────────────────────────────────────────
-- Se llena desde data/sources.seed.json en cada migración.

create table fuentes (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  nombre text not null check (char_length(nombre) between 1 and 120),
  organismo text not null check (char_length(organismo) between 1 and 120),
  -- Vacía mientras no se verifique la dirección oficial: nunca se inventa.
  url_base text not null check (
    url_base = '' or (url_base ~ '^https://[^[:space:]]+$' and char_length(url_base) <= 2048)
  ),
  tipo text not null check (tipo in ('primaria', 'secundaria', 'prensa')),
  temas text[] not null default '{}' check (
    temas <@ array['energia', 'chips', 'cobre', 'comercio_eeuu_china', 'divisas', 'geopolitica']
  ),
  acceso text not null check (acceso in ('rss', 'api', 'manual')),
  condiciones_reutilizacion text not null check (char_length(condiciones_reutilizacion) between 1 and 500),
  prioridad text not null check (prioridad in ('A', 'B', 'C')),
  activa boolean not null default true
);

-- ── Alertas ────────────────────────────────────────────────────────────────
-- Sin columnas de confianza ni nivel de verificación: se calculan desde las
-- fuentes al leer (regla 6).

create table alertas (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  tema text not null check (
    tema in ('energia', 'chips', 'cobre', 'comercio_eeuu_china', 'divisas', 'geopolitica')
  ),
  evento text not null check (char_length(evento) between 1 and 160),
  resumen text not null check (char_length(resumen) between 1 and 600),
  filas jsonb not null check (
    case when jsonb_typeof(filas) = 'array' then jsonb_array_length(filas) between 1 and 8 else false end
  ),
  fecha timestamptz not null,
  revisor text not null check (char_length(revisor) between 1 and 80),
  impacto text not null check (impacto in ('bajo', 'medio', 'alto')),
  estado text not null default 'borrador' check (
    estado in ('borrador', 'en_revision', 'publicada', 'corregida', 'retractada')
  ),
  es_ejemplo boolean not null default false,
  -- Bloqueo optimista: cada cambio suma uno.
  version integer not null default 1 check (version >= 1),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now()
);

create index alertas_publicas_por_fecha on alertas (fecha desc)
  where estado in ('publicada', 'corregida', 'retractada');

-- ── Fuentes de cada alerta ─────────────────────────────────────────────────
-- Se guarda la referencia (título, enlace, fecha), nunca el texto. El
-- organismo, el nombre y el tipo se copian del registro al enlazar, para que
-- un cambio posterior del registro no altere en silencio la confianza de una
-- alerta publicada. Un enlace no se edita ni se borra: se retira.

create table alerta_fuentes (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  alert_id text not null references alertas (id),
  source_id text not null references fuentes (id),
  organismo text not null,
  nombre_fuente text not null,
  tipo text not null check (tipo in ('primaria', 'secundaria', 'prensa')),
  titulo_documento text not null check (char_length(titulo_documento) between 1 and 300),
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 2048),
  fecha_publicacion date not null,
  fecha_consulta date not null,
  identificador text check (identificador is null or char_length(identificador) between 1 and 120),
  agregada timestamptz not null default now(),
  retirada timestamptz,
  constraint alerta_fuentes_fechas check (fecha_consulta >= fecha_publicacion),
  constraint alerta_fuentes_retiro check (retirada is null or retirada >= agregada)
);

create index alerta_fuentes_por_alerta on alerta_fuentes (alert_id);
-- El mismo documento no se enlaza dos veces a la vez en una alerta.
create unique index alerta_fuentes_sin_duplicados on alerta_fuentes (alert_id, url)
  where retirada is null;

-- ── Auditoría y correcciones (solo agregar) ────────────────────────────────
-- `orden` conserva el orden de inserción; `registrada` la pone la base.
-- Sin datos personales: el actor es un alias interno.

create table alerta_auditoria (
  orden bigint generated always as identity primary key,
  id text not null unique check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  alert_id text not null references alertas (id),
  accion text not null check (
    accion in ('creada', 'editada', 'aprobada', 'publicada', 'corregida', 'retractada')
  ),
  actor text not null check (actor ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  fecha timestamptz not null,
  nota text not null default '' check (char_length(nota) <= 500),
  registrada timestamptz not null default now()
);

create index alerta_auditoria_por_alerta on alerta_auditoria (alert_id, orden);

create table correcciones (
  orden bigint generated always as identity primary key,
  id text not null unique check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  alert_id text not null references alertas (id),
  fecha timestamptz not null,
  texto_publico text not null check (char_length(texto_publico) between 1 and 600),
  tipo text not null check (tipo in ('correccion', 'retractacion')),
  registrada timestamptz not null default now()
);

create index correcciones_por_alerta on correcciones (alert_id, orden);

-- ── Lista de espera ────────────────────────────────────────────────────────
-- Lo mínimo: correo, hash del token (nunca el token), fechas y versión del
-- consentimiento. Sin IP ni agente de usuario. Las inscripciones sin
-- confirmar se borran a los 30 días.

create table lista_espera (
  correo text primary key check (
    char_length(correo) between 3 and 254 and correo = lower(correo) and position('@' in correo) > 1
  ),
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_emitido timestamptz not null,
  creado timestamptz not null,
  version_consentimiento text not null check (char_length(version_consentimiento) between 1 and 40),
  confirmado timestamptz,
  -- Pendiente ⇔ tiene token. Al confirmar, el token se descarta.
  constraint lista_espera_estado check ((confirmado is null) = (token_hash is not null))
);

create index lista_espera_pendientes on lista_espera (token_emitido) where confirmado is null;

-- ── Disparadores de integridad ─────────────────────────────────────────────

-- Rechaza la operación (tablas de solo agregar y borrado de alertas).
create function otea_rechazar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'La tabla % no admite %', tg_table_name, tg_op using errcode = 'OT001';
end
$$;

create trigger alertas_sin_borrar before delete on alertas
  for each row execute function otea_rechazar();
create trigger alertas_sin_vaciar before truncate on alertas
  for each statement execute function otea_rechazar();

create trigger alerta_fuentes_sin_borrar before delete on alerta_fuentes
  for each row execute function otea_rechazar();
create trigger alerta_fuentes_sin_vaciar before truncate on alerta_fuentes
  for each statement execute function otea_rechazar();

create trigger alerta_auditoria_solo_agregar before update or delete on alerta_auditoria
  for each row execute function otea_rechazar();
create trigger alerta_auditoria_sin_vaciar before truncate on alerta_auditoria
  for each statement execute function otea_rechazar();

create trigger correcciones_solo_agregar before update or delete on correcciones
  for each row execute function otea_rechazar();
create trigger correcciones_sin_vaciar before truncate on correcciones
  for each statement execute function otea_rechazar();

-- Ciclo de vida de una alerta: transiciones permitidas, campos inmutables y
-- versión que avanza de a uno.
create function otea_alertas_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.estado = 'retractada' then
    raise exception 'Una alerta retractada no se modifica' using errcode = 'OT002';
  end if;
  if (new.id, new.revisor, new.es_ejemplo, new.creada)
     is distinct from (old.id, old.revisor, old.es_ejemplo, old.creada)
     -- La fecha pública solo cambia al publicar: pasa a ser la de publicación.
     or (new.fecha is distinct from old.fecha and not (new.estado = 'publicada' and old.estado <> 'publicada')) then
    raise exception 'Campo inmutable de la alerta' using errcode = 'OT003';
  end if;
  if new.version is distinct from old.version + 1 then
    raise exception 'Cada cambio debe aumentar la versión en uno' using errcode = 'OT004';
  end if;
  if not (
    (new.estado = old.estado and old.estado in ('borrador', 'en_revision', 'corregida'))
    or (old.estado = 'borrador' and new.estado in ('en_revision', 'publicada'))
    or (old.estado = 'en_revision' and new.estado = 'publicada')
    or (old.estado in ('publicada', 'corregida') and new.estado in ('corregida', 'retractada'))
  ) then
    raise exception 'Transición no permitida: % → %', old.estado, new.estado using errcode = 'OT002';
  end if;
  if new.estado in ('publicada', 'retractada')
     and (new.tema, new.evento, new.resumen, new.filas, new.impacto)
         is distinct from (old.tema, old.evento, old.resumen, old.filas, old.impacto) then
    raise exception 'Publicar o retractar no cambia el contenido' using errcode = 'OT002';
  end if;
  new.actualizada := now();
  return new;
end
$$;

create trigger alertas_ciclo_de_vida before update on alertas
  for each row execute function otea_alertas_al_actualizar();

-- Al enlazar una fuente se copian sus datos del registro; la aplicación no
-- puede declararlos.
create function otea_alerta_fuentes_al_insertar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  f record;
begin
  select organismo, nombre, tipo, activa into f from public.fuentes where id = new.source_id;
  if not found or not f.activa then
    raise exception 'La fuente % no está activa en el registro', new.source_id using errcode = 'OT006';
  end if;
  new.organismo := f.organismo;
  new.nombre_fuente := f.nombre;
  new.tipo := f.tipo;
  new.agregada := now();
  new.retirada := null;
  return new;
end
$$;

create trigger alerta_fuentes_copiar_registro before insert on alerta_fuentes
  for each row execute function otea_alerta_fuentes_al_insertar();

-- Un enlace solo cambia para retirarse, una vez.
create function otea_alerta_fuentes_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.retirada is not null or new.retirada is null
     or (new.id, new.alert_id, new.source_id, new.organismo, new.nombre_fuente, new.tipo,
         new.titulo_documento, new.url, new.fecha_publicacion, new.fecha_consulta,
         new.identificador, new.agregada)
        is distinct from
        (old.id, old.alert_id, old.source_id, old.organismo, old.nombre_fuente, old.tipo,
         old.titulo_documento, old.url, old.fecha_publicacion, old.fecha_consulta,
         old.identificador, old.agregada) then
    raise exception 'Un enlace a una fuente solo puede retirarse, una vez' using errcode = 'OT005';
  end if;
  return new;
end
$$;

create trigger alerta_fuentes_solo_retirar before update on alerta_fuentes
  for each row execute function otea_alerta_fuentes_al_actualizar();

revoke all on function otea_rechazar(), otea_alertas_al_actualizar(),
  otea_alerta_fuentes_al_insertar(), otea_alerta_fuentes_al_actualizar() from public;

-- ── Permisos mínimos de la aplicación ──────────────────────────────────────
-- Sin DELETE salvo en la lista de espera; UPDATE e INSERT solo en las
-- columnas que la aplicación escribe.

grant usage on schema public to otea_app;

grant select on fuentes to otea_app;

grant select on alertas to otea_app;
grant insert (id, tema, evento, resumen, filas, fecha, revisor, impacto, es_ejemplo) on alertas to otea_app;
grant update (tema, evento, resumen, filas, fecha, impacto, estado, version) on alertas to otea_app;

grant select on alerta_fuentes to otea_app;
grant insert (id, alert_id, source_id, titulo_documento, url, fecha_publicacion, fecha_consulta, identificador)
  on alerta_fuentes to otea_app;
grant update (retirada) on alerta_fuentes to otea_app;

grant select on alerta_auditoria to otea_app;
grant insert (id, alert_id, accion, actor, fecha, nota) on alerta_auditoria to otea_app;

grant select on correcciones to otea_app;
grant insert (id, alert_id, fecha, texto_publico, tipo) on correcciones to otea_app;

grant select, insert, update, delete on lista_espera to otea_app;
