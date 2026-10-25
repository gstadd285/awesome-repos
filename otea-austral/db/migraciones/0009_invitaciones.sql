-- 0009 · Acceso privado por invitación (docs/alertas-reales.md §6).
--
-- Con `CUENTAS_MODO=invitacion` una cuenta solo se crea con un código de invitación de un solo uso que la dueña emite en
-- /admin/invitaciones. El código (100 bits al azar) se muestra una sola vez; aquí se guarda solo su HMAC-SHA256 con una
-- clave derivada de CUENTAS_SECRETO, así que una copia de la base no sirve para crear cuentas. Sin datos personales: el
-- alias es una etiqueta interna con la forma del actor de la auditoría.
--
--   invitaciones           Una fila por código: cuándo se emitió y cuándo vence, cuántos correos de alta provocó, y si se
--                          usó (con qué cuenta) o se revocó. No se borra; `usada` y `revocada` se fijan una sola vez.
--   invitacion_auditoria   Qué pasó con cada invitación (emitida, revocada, usada) y quién (el alias del panel; nadie
--                          cuando la usa la persona invitada). Solo agregar.
--   cuenta_tokens          + `invitacion_id`: el enlace de alta recuerda con qué invitación se pidió. La invitación se
--                          gasta en la misma transacción que crea la cuenta (src/lib/cuentas/almacen-postgres.ts).
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Invitaciones ───────────────────────────────────────────────────────────

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  -- HMAC-SHA256 del código normalizado (src/lib/cuentas/invitaciones.ts). El código nunca se guarda.
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  alias text not null check (alias ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  emitida timestamptz not null,
  vence timestamptz not null,
  -- Correos de alta que provocó el código; la aplicación corta en 5 (un código filtrado no manda correos sin fin).
  envios smallint not null default 0 check (envios between 0 and 100),
  usada timestamptz,
  revocada timestamptz,
  -- La cuenta que se creó con ella. Al eliminar la cuenta queda en nulo: la invitación sigue en la auditoría.
  cuenta_id uuid references cuentas (id) on delete set null,
  registrada timestamptz not null default now(),
  -- La aplicación da 14 días por omisión; la base no admite más de 30.
  constraint invitaciones_vigencia check (vence > emitida and vence <= emitida + interval '30 days'),
  constraint invitaciones_uso check (usada is null or usada >= emitida),
  constraint invitaciones_revocacion check (revocada is null or revocada >= emitida),
  -- Termina de una sola forma: usada o revocada.
  constraint invitaciones_final check (usada is null or revocada is null),
  -- Solo una invitación usada apunta a una cuenta.
  constraint invitaciones_cuenta check (cuenta_id is null or usada is not null)
);

create index invitaciones_vigentes on invitaciones (vence) where usada is null and revocada is null;
create index invitaciones_por_emision on invitaciones (emitida desc);

-- Lo que identifica a una invitación no cambia; `usada` y `revocada` se fijan una vez; los correos solo suben; la cuenta
-- se fija al usarla (y solo puede volver a nulo cuando se elimina la cuenta, `on delete set null`).
create function otea_invitaciones_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.id, new.codigo_hash, new.alias, new.emitida, new.vence, new.registrada)
       is distinct from (old.id, old.codigo_hash, old.alias, old.emitida, old.vence, old.registrada)
     or new.envios < old.envios
     or (new.envios <> old.envios and (old.usada is not null or old.revocada is not null))
     or (old.usada is not null and new.usada is distinct from old.usada)
     or (old.revocada is not null and new.revocada is distinct from old.revocada)
     or (new.cuenta_id is not null and new.cuenta_id is distinct from old.cuenta_id and old.usada is not null) then
    raise exception 'Una invitación solo se gasta o se revoca, una vez' using errcode = 'OT013';
  end if;
  return new;
end
$$;

create trigger invitaciones_una_vez before update on invitaciones
  for each row execute function otea_invitaciones_al_actualizar();
create trigger invitaciones_sin_borrar before delete on invitaciones
  for each row execute function otea_rechazar();
create trigger invitaciones_sin_vaciar before truncate on invitaciones
  for each statement execute function otea_rechazar();

revoke all on function otea_invitaciones_al_actualizar() from public;

-- ── Auditoría (solo agregar) ───────────────────────────────────────────────

create table invitacion_auditoria (
  orden bigint generated always as identity primary key,
  invitacion_id uuid not null references invitaciones (id),
  accion text not null check (accion in ('emitida', 'revocada', 'usada')),
  -- Alias del panel; nulo cuando la usa la persona invitada (nada que la identifique).
  actor text check (actor is null or actor ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  fecha timestamptz not null,
  registrada timestamptz not null default now(),
  constraint invitacion_auditoria_actor check ((accion = 'usada') = (actor is null))
);

create index invitacion_auditoria_por_invitacion on invitacion_auditoria (invitacion_id, orden);

create trigger invitacion_auditoria_solo_agregar before update or delete on invitacion_auditoria
  for each row execute function otea_rechazar();
create trigger invitacion_auditoria_sin_vaciar before truncate on invitacion_auditoria
  for each statement execute function otea_rechazar();

-- ── El enlace de alta recuerda su invitación ───────────────────────────────

alter table cuenta_tokens add column invitacion_id uuid references invitaciones (id);
alter table cuenta_tokens add constraint cuenta_tokens_invitacion check (invitacion_id is null or proposito = 'alta');
create index cuenta_tokens_por_invitacion on cuenta_tokens (invitacion_id) where invitacion_id is not null;

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────

grant select on invitaciones to otea_app;
grant insert (codigo_hash, alias, emitida, vence) on invitaciones to otea_app;
grant update (envios, usada, revocada, cuenta_id) on invitaciones to otea_app;

grant select on invitacion_auditoria to otea_app;
grant insert (invitacion_id, accion, actor, fecha) on invitacion_auditoria to otea_app;

grant insert (invitacion_id) on cuenta_tokens to otea_app;
grant update (invitacion_id) on cuenta_tokens to otea_app;

alter table invitaciones enable row level security;
alter table invitacion_auditoria enable row level security;

create policy invitaciones_lectura on invitaciones for select to otea_app using (true);
-- Nace vigente: sin usar, sin revocar, sin cuenta y sin correos.
create policy invitaciones_alta on invitaciones for insert to otea_app
  with check (usada is null and revocada is null and cuenta_id is null and envios = 0);
-- Solo una vigente cambia (se gasta, se revoca o suma un correo); el disparador acota qué cambia.
create policy invitaciones_cambio on invitaciones for update to otea_app
  using (usada is null and revocada is null) with check (true);

create policy invitacion_auditoria_lectura on invitacion_auditoria for select to otea_app using (true);
create policy invitacion_auditoria_alta on invitacion_auditoria for insert to otea_app with check (true);
