-- 0011 · Resumen diario por correo (docs/alertas-reales.md §7).
--
-- Desde el servicio privado `otea-tareas` (RESUMEN_MODO=activo, apagado por omisión), una vez al día cada cuenta que lo
-- pidió de forma explícita (la casilla separada de su perfil) recibe los títulos de Otea de las alertas publicadas en sus
-- temas desde su último resumen. Nunca texto de una fuente, datos de pago ni nada sensible.
--
--   cuentas.resumen_alta    Cuándo pidió el resumen (su consentimiento, con fecha); nulo si no lo pidió. Va con
--                           `resumen_previo`: una restricción exige las dos cosas juntas.
--   cuenta_eventos          + tipos `resumen_activado` y `resumen_desactivado` (la persona los ve en su actividad).
--   resumen_envios          Un resumen por cuenta y día de Chile (clave primaria): aunque la tarea corra dos veces, no se
--                           repite. Guarda la ventana que cubrió y cuántas alertas llevaba, nunca su contenido. El estado
--                           pasa una sola vez de `reservado` a `enviado` o `fallido`. Se purga a los 90 días.
--   resumen_envios_diarios  Cuántos resúmenes salieron cada día: el cupo de Resend que les toca (RESUMEN_ENVIOS_DIARIOS),
--                           común a todas las instancias. Solo sube (el disparador de `cuentas_envios_diarios`).
--   resumen_bajas           La baja de un clic: solo el hash SHA-256 del token que viaja en cada correo (60 días). Darse de
--                           baja es un POST con ese token, nunca un GET; borra todos los tokens de la cuenta.
--
-- Las corridas quedan en `ingesta_corridas` (`tarea = 'resumen'`, ya prevista en 0007): `feeds` son las cuentas revisadas,
-- `nuevos` los resúmenes enviados y `fallos` los que no salieron. El turno es el de `tareas_turnos` ('resumen').
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Consentimiento con fecha ───────────────────────────────────────────────

alter table cuentas add column resumen_alta timestamptz;
-- Quien ya había marcado «Quiero recibir por correo el resumen…» lo pidió de forma explícita: su fecha es la del último
-- cambio de su perfil.
update cuentas set resumen_alta = actualizada where resumen_previo;
alter table cuentas add constraint cuentas_resumen_coherente check ((resumen_alta is not null) = resumen_previo);

grant update (resumen_alta) on cuentas to otea_app;

-- ── Actividad: activar y dejar el resumen ──────────────────────────────────

alter table cuenta_eventos drop constraint cuenta_eventos_tipo_check;
alter table cuenta_eventos add constraint cuenta_eventos_tipo_check check (tipo in (
  'alta', 'acceso', 'clave_cambiada', 'clave_restablecida', 'dos_pasos_activados', 'dos_pasos_desactivados',
  'codigos_regenerados', 'codigo_recuperacion', 'sesiones_cerradas', 'alta_repetida', 'resumen_activado',
  'resumen_desactivado'
));

-- ── Un resumen por cuenta y día ────────────────────────────────────────────

create table resumen_envios (
  cuenta_id uuid not null references cuentas (id) on delete cascade,
  -- Día de Chile, lo decide el reloj de la base al reservar.
  dia date not null,
  estado text not null default 'reservado' check (estado in ('reservado', 'enviado', 'fallido')),
  -- Las alertas publicadas en (desde, hasta]: la siguiente ventana empieza donde terminó la última enviada.
  desde timestamptz not null,
  hasta timestamptz not null,
  alertas integer not null check (alertas between 1 and 200),
  reservado timestamptz not null default now(),
  resuelto timestamptz,
  primary key (cuenta_id, dia),
  constraint resumen_envios_ventana check (hasta > desde and hasta <= desde + interval '8 days'),
  constraint resumen_envios_resolucion check ((estado = 'reservado') = (resuelto is null))
);

create index resumen_envios_por_dia on resumen_envios (dia);

-- Lo enviado no cambia: solo el estado (una vez, de `reservado` a `enviado` o `fallido`) y cuándo se resolvió.
create function otea_resumen_envios_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.cuenta_id, new.dia, new.desde, new.hasta, new.alertas, new.reservado)
       is distinct from (old.cuenta_id, old.dia, old.desde, old.hasta, old.alertas, old.reservado)
     or old.estado <> 'reservado' or new.estado not in ('enviado', 'fallido') then
    raise exception 'Un resumen reservado solo se marca una vez como enviado o fallido' using errcode = 'OT015';
  end if;
  return new;
end
$$;

create trigger resumen_envios_estado before update on resumen_envios
  for each row execute function otea_resumen_envios_al_actualizar();

revoke all on function otea_resumen_envios_al_actualizar() from public;

-- ── Cupo diario de Resend para el resumen ──────────────────────────────────

create table resumen_envios_diarios (
  dia date primary key,
  cantidad integer not null default 0 check (cantidad >= 0),
  actualizado timestamptz not null default now()
);

create trigger resumen_envios_diarios_solo_sube before update on resumen_envios_diarios
  for each row execute function otea_cuentas_envios_al_actualizar();
create trigger resumen_envios_diarios_sin_borrar before delete on resumen_envios_diarios
  for each row execute function otea_rechazar();
create trigger resumen_envios_diarios_sin_vaciar before truncate on resumen_envios_diarios
  for each statement execute function otea_rechazar();

-- ── Baja de un clic ────────────────────────────────────────────────────────

create table resumen_bajas (
  -- SHA-256 del token (el token solo viaja en el correo).
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  cuenta_id uuid not null references cuentas (id) on delete cascade,
  emitido timestamptz not null default now(),
  vence timestamptz not null,
  constraint resumen_bajas_vigencia check (vence > emitido and vence <= emitido + interval '61 days')
);

create index resumen_bajas_por_cuenta on resumen_bajas (cuenta_id);
create index resumen_bajas_por_vencimiento on resumen_bajas (vence);

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────

grant select on resumen_envios to otea_app;
grant insert (cuenta_id, dia, estado, desde, hasta, alertas, reservado) on resumen_envios to otea_app;
grant update (estado, resuelto) on resumen_envios to otea_app;
grant delete on resumen_envios to otea_app;

grant select (dia, cantidad) on resumen_envios_diarios to otea_app;
grant insert (dia, cantidad) on resumen_envios_diarios to otea_app;
grant update (cantidad, actualizado) on resumen_envios_diarios to otea_app;

grant select on resumen_bajas to otea_app;
grant insert (token_hash, cuenta_id, emitido, vence) on resumen_bajas to otea_app;
grant delete on resumen_bajas to otea_app;

alter table resumen_envios enable row level security;
alter table resumen_envios_diarios enable row level security;
alter table resumen_bajas enable row level security;

-- Un resumen nace reservado y se resuelve una vez; la aplicación solo purga los de más de 90 días.
create policy resumen_envios_lectura on resumen_envios for select to otea_app using (true);
create policy resumen_envios_alta on resumen_envios for insert to otea_app
  with check (estado = 'reservado' and resuelto is null);
create policy resumen_envios_resolucion on resumen_envios for update to otea_app
  using (estado = 'reservado') with check (estado in ('enviado', 'fallido') and resuelto is not null);
create policy resumen_envios_purga on resumen_envios for delete to otea_app
  using (dia < (now() at time zone 'America/Santiago')::date - 90);

create policy resumen_envios_diarios_lectura on resumen_envios_diarios for select to otea_app using (true);
create policy resumen_envios_diarios_alta on resumen_envios_diarios for insert to otea_app with check (cantidad = 1);
create policy resumen_envios_diarios_cambio on resumen_envios_diarios for update to otea_app using (true) with check (true);

-- Un token nace con vigencia acotada; se borra al usarlo, al dar de baja la cuenta o al vencer.
create policy resumen_bajas_lectura on resumen_bajas for select to otea_app using (true);
create policy resumen_bajas_alta on resumen_bajas for insert to otea_app
  with check (vence > emitido and vence <= emitido + interval '61 days');
create policy resumen_bajas_purga on resumen_bajas for delete to otea_app using (true);
