-- 0008 · Eventos candidatos y su cola manual (docs/alertas-reales.md §3 y §5).
--
-- La ingesta agrupa los ítems de `fuente_items` (solo metadatos) en eventos candidatos por tema, ventana de tiempo y
-- señales simples (`src/lib/ingesta/agrupar.ts`). En `/admin/eventos` la dueña descarta un evento o crea con él, a mano,
-- una alerta en borrador con las fuentes ya enlazadas (el flujo de siempre de `rules.ts`). Nada llama a una IA y nada
-- se publica solo. Ninguna columna guarda texto de una fuente: `titulo_referencia` es el título del primer ítem
-- (un metadato, como en `fuente_items`).
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Eventos candidatos ─────────────────────────────────────────────────────

create table eventos_candidatos (
  id uuid primary key,
  tema text not null check (
    tema in ('energia', 'chips', 'cobre', 'comercio_eeuu_china', 'divisas', 'geopolitica', 'sin_tema')
  ),
  -- `fomc`, `rpm`, `ipom`, `ipc`, `cpi`, `employment_situation`, `opep_reunion`, `weo` (lista en `lexico.ts`).
  clave_agenda text check (clave_agenda is null or clave_agenda ~ '^[a-z0-9_]{1,40}$'),
  titulo_referencia text not null check (char_length(titulo_referencia) between 1 and 300),
  primero timestamptz not null,
  ultimo timestamptz not null,
  puntaje smallint not null check (puntaje between 0 and 100),
  estado text not null default 'abierto' check (
    estado in ('abierto', 'solicitado', 'con_borrador', 'descartado', 'convertido')
  ),
  alert_id text references alertas (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  constraint eventos_candidatos_fechas check (ultimo >= primero),
  -- Solo un evento convertido apunta a su alerta, y siempre lo hace.
  constraint eventos_candidatos_alerta check ((estado = 'convertido') = (alert_id is not null))
);

create index eventos_candidatos_cola on eventos_candidatos (puntaje desc, ultimo desc)
  where estado in ('abierto', 'solicitado', 'con_borrador');
create index eventos_candidatos_por_inicio on eventos_candidatos (primero);

-- El estado solo avanza (abierto → solicitado → con_borrador → descartado | convertido; los dos últimos son finales),
-- la alerta se fija una vez, la ventana solo se ensancha y lo que identifica al evento no cambia.
create function otea_eventos_candidatos_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  rango_viejo integer := case old.estado when 'abierto' then 0 when 'solicitado' then 1 when 'con_borrador' then 2 else 3 end;
  rango_nuevo integer := case new.estado when 'abierto' then 0 when 'solicitado' then 1 when 'con_borrador' then 2 else 3 end;
begin
  if (new.id, new.tema, new.titulo_referencia, new.creado) is distinct from (old.id, old.tema, old.titulo_referencia, old.creado)
     or (old.clave_agenda is not null and new.clave_agenda is distinct from old.clave_agenda)
     or (old.alert_id is not null and new.alert_id is distinct from old.alert_id)
     or new.primero > old.primero
     or new.ultimo < old.ultimo then
    raise exception 'Campo inmutable del evento candidato' using errcode = 'OT011';
  end if;
  if new.estado is distinct from old.estado and (rango_viejo = 3 or rango_nuevo <= rango_viejo) then
    raise exception 'El estado de un evento solo avanza: % → %', old.estado, new.estado using errcode = 'OT012';
  end if;
  new.actualizado := now();
  return new;
end
$$;

create trigger eventos_candidatos_solo_avanza before update on eventos_candidatos
  for each row execute function otea_eventos_candidatos_al_actualizar();
create trigger eventos_candidatos_sin_borrar before delete on eventos_candidatos
  for each row execute function otea_rechazar();
create trigger eventos_candidatos_sin_vaciar before truncate on eventos_candidatos
  for each statement execute function otea_rechazar();

-- ── Cada ítem recibe su evento una sola vez ────────────────────────────────
-- `fuente_items` sigue siendo de solo agregar (0007) salvo por `evento_id`: de nulo a un valor, una vez, sin tocar nada
-- más. El disparador de 0007 rechazaba todo cambio; se reemplaza por uno que admite solo eso.

alter table fuente_items add column evento_id uuid references eventos_candidatos (id);

create index fuente_items_por_evento on fuente_items (evento_id);
create index fuente_items_sin_evento on fuente_items (visto) where evento_id is null;

create function otea_fuente_items_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.evento_id is not null or new.evento_id is null
     or (new.id, new.source_id, new.feed_url, new.clave, new.titulo, new.url, new.identificador, new.publicado, new.visto)
        is distinct from
        (old.id, old.source_id, old.feed_url, old.clave, old.titulo, old.url, old.identificador, old.publicado, old.visto) then
    raise exception 'Un ítem de una fuente solo recibe su evento, una vez' using errcode = 'OT001';
  end if;
  return new;
end
$$;

drop trigger fuente_items_solo_agregar on fuente_items;
create trigger fuente_items_sin_borrar before delete on fuente_items
  for each row execute function otea_rechazar();
create trigger fuente_items_solo_evento before update on fuente_items
  for each row execute function otea_fuente_items_al_actualizar();

-- ── Auditoría de la cola (solo agregar) ────────────────────────────────────
-- Lo que hace la dueña con un evento: descartarlo o convertirlo en una alerta (la alerta lleva, además, su propia
-- auditoría con la nota «Desde el evento candidato …»). Sin datos personales: el actor es el alias del panel.

create table evento_auditoria (
  orden bigint generated always as identity primary key,
  evento_id uuid not null references eventos_candidatos (id),
  accion text not null check (accion in ('descartado', 'convertido')),
  actor text not null check (actor ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  fecha timestamptz not null,
  nota text not null default '' check (char_length(nota) <= 500),
  alert_id text references alertas (id),
  registrada timestamptz not null default now(),
  constraint evento_auditoria_alerta check ((accion = 'convertido') = (alert_id is not null))
);

create index evento_auditoria_por_evento on evento_auditoria (evento_id, orden);

create trigger evento_auditoria_solo_agregar before update or delete on evento_auditoria
  for each row execute function otea_rechazar();
create trigger evento_auditoria_sin_vaciar before truncate on evento_auditoria
  for each statement execute function otea_rechazar();

revoke all on function otea_eventos_candidatos_al_actualizar(), otea_fuente_items_al_actualizar() from public;

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────

grant select on eventos_candidatos to otea_app;
grant insert (id, tema, clave_agenda, titulo_referencia, primero, ultimo, puntaje) on eventos_candidatos to otea_app;
grant update (clave_agenda, primero, ultimo, puntaje, estado, alert_id) on eventos_candidatos to otea_app;

grant update (evento_id) on fuente_items to otea_app;

grant select on evento_auditoria to otea_app;
grant insert (evento_id, accion, actor, fecha, nota, alert_id) on evento_auditoria to otea_app;

alter table eventos_candidatos enable row level security;
alter table evento_auditoria enable row level security;

create policy eventos_candidatos_lectura on eventos_candidatos for select to otea_app using (true);
-- Un evento nace abierto y sin alerta.
create policy eventos_candidatos_alta on eventos_candidatos for insert to otea_app
  with check (estado = 'abierto' and alert_id is null);
-- Los cambios los acota el disparador `eventos_candidatos_solo_avanza`.
create policy eventos_candidatos_cambio on eventos_candidatos for update to otea_app using (true) with check (true);

-- Un ítem sin evento recibe uno; uno que ya lo tiene queda fuera del alcance de la aplicación.
create policy fuente_items_asignacion on fuente_items for update to otea_app
  using (evento_id is null) with check (evento_id is not null);

create policy evento_auditoria_lectura on evento_auditoria for select to otea_app using (true);
create policy evento_auditoria_alta on evento_auditoria for insert to otea_app with check (true);
