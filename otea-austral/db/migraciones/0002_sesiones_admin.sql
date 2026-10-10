-- 0002 · Sesiones del panel y códigos TOTP gastados.
--
-- La cookie del panel va firmada, pero su validez se decide aquí: cerrar
-- sesión la revoca de verdad (una cookie copiada deja de servir al instante)
-- y un código TOTP solo se acepta una vez aunque haya varias instancias del
-- servidor. Sin datos personales: solo identificadores aleatorios y fechas.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Sesiones ───────────────────────────────────────────────────────────────

create table admin_sesiones (
  sid text primary key check (sid ~ '^[A-Za-z0-9_-]{22}$'),
  creada timestamptz not null default now(),
  expira timestamptz not null,
  revocada timestamptz,
  -- La sesión de la aplicación dura 8 horas; la base no admite más de 12.
  constraint admin_sesiones_vigencia check (expira > creada and expira <= creada + interval '12 hours'),
  constraint admin_sesiones_revocacion check (revocada is null or revocada >= creada)
);

create index admin_sesiones_por_expiracion on admin_sesiones (expira);

-- Una sesión solo cambia para revocarse, una vez. No se borra.
create function otea_admin_sesiones_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.revocada is not null
     or new.revocada is null
     or (new.sid, new.creada, new.expira) is distinct from (old.sid, old.creada, old.expira) then
    raise exception 'Una sesión solo puede revocarse, una vez' using errcode = 'OT007';
  end if;
  return new;
end
$$;

create trigger admin_sesiones_solo_revocar before update on admin_sesiones
  for each row execute function otea_admin_sesiones_al_actualizar();
create trigger admin_sesiones_sin_borrar before delete on admin_sesiones
  for each row execute function otea_rechazar();
create trigger admin_sesiones_sin_vaciar before truncate on admin_sesiones
  for each statement execute function otea_rechazar();

-- ── Códigos TOTP gastados ──────────────────────────────────────────────────
-- Un paso de 30 segundos se acepta una sola vez (RFC 6238, sección 5.2),
-- incluso si el intento falló por la frase: el código queda gastado.

create table admin_codigos_usados (
  paso bigint primary key check (paso >= 0),
  usado timestamptz not null default now()
);

create trigger admin_codigos_solo_agregar before update or delete on admin_codigos_usados
  for each row execute function otea_rechazar();
create trigger admin_codigos_sin_vaciar before truncate on admin_codigos_usados
  for each statement execute function otea_rechazar();

revoke all on function otea_admin_sesiones_al_actualizar() from public;

-- ── Permisos mínimos de la aplicación ──────────────────────────────────────

grant select on admin_sesiones to otea_app;
grant insert (sid, expira) on admin_sesiones to otea_app;
grant update (revocada) on admin_sesiones to otea_app;

grant insert (paso) on admin_codigos_usados to otea_app;
