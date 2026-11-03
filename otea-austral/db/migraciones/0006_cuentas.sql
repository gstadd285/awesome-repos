-- 0006 · Cuentas de personas usuarias.
--
-- Qué guarda (y por qué es lo mínimo):
--   cuentas              Una fila por cuenta. El correo va CIFRADO (AES-256-GCM) y se busca por un índice ciego (HMAC);
--                        la contraseña, como hash scrypt; el secreto de la verificación en dos pasos, cifrado. Sin IP ni
--                        agente de usuario. Los textos que aceptó la persona se guardan con su versión y su fecha.
--   cuenta_tokens        Enlaces de los correos (crear la cuenta, restablecer la contraseña): solo el hash del token,
--                        de un solo uso. Una cuenta NO existe hasta que se confirma el correo y se elige la contraseña:
--                        mientras tanto solo hay aquí el correo cifrado (se borra a los 7 días).
--   cuenta_sesiones      Sesiones: solo el hash del token de la cookie. Cerrar sesión la revoca de verdad.
--   cuenta_codigos       Códigos de recuperación de la verificación en dos pasos (solo su hash; cada uno vale una vez).
--   cuenta_eventos       Actividad de seguridad que ve la persona (acceso, cambios de contraseña…): tipo y fecha, nada más.
--   cuentas_envios_diarios  Cuántos correos de cuentas se enviaron cada día (cuota del proveedor de correo).
--
-- Quién puede qué: la aplicación (rol `otea_app`) tiene permisos por columna y una política de seguridad por fila por
-- cada operación (ver 0003). Lo que no se puede cambiar (el correo de una cuenta, cuándo se creó, qué aceptó) no tiene
-- permiso de escritura. Los borrados en cascada al eliminar una cuenta los hace la base como dueña de las tablas.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Cuentas ────────────────────────────────────────────────────────────────

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  -- HMAC-SHA256 del correo normalizado: sirve para buscar y para impedir repetidos sin guardar el correo en claro.
  correo_indice text not null unique check (correo_indice ~ '^[0-9a-f]{64}$'),
  -- `v1.` + base64url (iv ‖ texto cifrado ‖ etiqueta). Largo máximo: iv 12 + 254 + etiqueta 16 = 282 bytes.
  correo_cifrado text not null check (correo_cifrado ~ '^v1\.[A-Za-z0-9_-]+$' and char_length(correo_cifrado) between 42 and 400),
  nombre text check (nombre is null or char_length(nombre) between 1 and 60),
  -- scrypt$N$r$p$sal$hash (ver src/lib/cuentas/clave.ts).
  clave_hash text not null check (
    char_length(clave_hash) between 60 and 200 and clave_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
  ),
  clave_cambiada timestamptz not null default now(),
  -- Intentos fallidos de entrar (contraseña y segundo paso) dentro de la ventana que empieza en `fallos_desde`.
  fallos integer not null default 0 check (fallos >= 0),
  fallos_desde timestamptz,
  -- Verificación en dos pasos. El secreto activo y el pendiente (mientras la persona lo agrega a su app y confirma
  -- con un código) van cifrados, ligados a la cuenta. `totp_ultimo_paso` impide reusar un código.
  totp_secreto_cifrado text check (
    totp_secreto_cifrado is null or (totp_secreto_cifrado ~ '^v1\.[A-Za-z0-9_-]+$' and char_length(totp_secreto_cifrado) between 60 and 130)
  ),
  totp_pendiente_cifrado text check (
    totp_pendiente_cifrado is null or (totp_pendiente_cifrado ~ '^v1\.[A-Za-z0-9_-]+$' and char_length(totp_pendiente_cifrado) between 60 and 130)
  ),
  totp_activado timestamptz,
  totp_ultimo_paso bigint check (totp_ultimo_paso is null or totp_ultimo_paso >= 0),
  constraint cuentas_totp_coherente check ((totp_activado is null) = (totp_secreto_cifrado is null)),
  -- Qué aceptó al crear la cuenta (condiciones de uso y política de privacidad) y cuándo.
  version_textos text not null check (char_length(version_textos) between 1 and 40),
  aceptado timestamptz not null,
  -- Preferencias.
  temas text[] not null default '{}' check (
    temas <@ array['energia', 'chips', 'cobre', 'comercio_eeuu_china', 'divisas', 'geopolitica']
  ),
  resumen_previo boolean not null default false,
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now()
);

-- ── Enlaces de los correos ─────────────────────────────────────────────────

create table cuenta_tokens (
  -- SHA-256 del token (el token solo viaja en el correo).
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  proposito text not null check (proposito in ('alta', 'restablecer')),
  cuenta_id uuid references cuentas (id) on delete cascade,
  -- Solo para `alta`: el correo (cifrado) y lo que aceptó la persona al dejarlo.
  correo_indice text check (correo_indice is null or correo_indice ~ '^[0-9a-f]{64}$'),
  correo_cifrado text check (
    correo_cifrado is null or (correo_cifrado ~ '^v1\.[A-Za-z0-9_-]+$' and char_length(correo_cifrado) between 42 and 400)
  ),
  version_textos text check (version_textos is null or char_length(version_textos) between 1 and 40),
  aceptado timestamptz,
  emitido timestamptz not null default now(),
  usado timestamptz,
  constraint cuenta_tokens_forma check (
    (proposito = 'alta' and cuenta_id is null and correo_indice is not null and correo_cifrado is not null
       and version_textos is not null and aceptado is not null)
    or
    (proposito = 'restablecer' and cuenta_id is not null and correo_indice is null and correo_cifrado is null
       and version_textos is null and aceptado is null)
  ),
  constraint cuenta_tokens_uso check (usado is null or usado >= emitido)
);

-- Un solo enlace pendiente por correo (alta) y por cuenta (restablecer): pedir otro reemplaza al anterior.
create unique index cuenta_tokens_alta_pendiente on cuenta_tokens (correo_indice)
  where proposito = 'alta' and usado is null;
create unique index cuenta_tokens_restablecer_pendiente on cuenta_tokens (cuenta_id)
  where proposito = 'restablecer' and usado is null;
create index cuenta_tokens_por_emision on cuenta_tokens (emitido);

-- ── Sesiones ───────────────────────────────────────────────────────────────

create table cuenta_sesiones (
  -- SHA-256 del token de la cookie. El token nunca se guarda.
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Identificador público (para «cerrar esta sesión» en la lista); no sirve para entrar.
  id uuid not null unique default gen_random_uuid(),
  cuenta_id uuid not null references cuentas (id) on delete cascade,
  -- `pendiente`: la contraseña fue correcta y falta el código de la verificación en dos pasos.
  fase text not null check (fase in ('pendiente', 'activa')),
  creada timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  expira timestamptz not null,
  revocada timestamptz,
  -- Solo una etiqueta aproximada («Chrome en Windows»); nunca el agente de usuario completo ni la IP.
  dispositivo text check (dispositivo is null or char_length(dispositivo) between 1 and 60),
  -- La aplicación da 30 días como máximo; la base no admite más de 31.
  constraint cuenta_sesiones_vigencia check (expira > creada and expira <= creada + interval '31 days'),
  constraint cuenta_sesiones_revocacion check (revocada is null or revocada >= creada)
);

create index cuenta_sesiones_por_cuenta on cuenta_sesiones (cuenta_id, creada desc);
create index cuenta_sesiones_por_expiracion on cuenta_sesiones (expira);

-- ── Códigos de recuperación ────────────────────────────────────────────────

create table cuenta_codigos (
  cuenta_id uuid not null references cuentas (id) on delete cascade,
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  usado timestamptz,
  primary key (cuenta_id, codigo_hash)
);

-- ── Actividad de seguridad ─────────────────────────────────────────────────

create table cuenta_eventos (
  id bigint generated always as identity primary key,
  cuenta_id uuid not null references cuentas (id) on delete cascade,
  tipo text not null check (tipo in (
    'alta', 'acceso', 'clave_cambiada', 'clave_restablecida', 'dos_pasos_activados', 'dos_pasos_desactivados',
    'codigos_regenerados', 'codigo_recuperacion', 'sesiones_cerradas', 'alta_repetida'
  )),
  fecha timestamptz not null default now()
);

create index cuenta_eventos_por_cuenta on cuenta_eventos (cuenta_id, id desc);
create index cuenta_eventos_por_fecha on cuenta_eventos (fecha);

-- Un evento no se edita.
create trigger cuenta_eventos_solo_agregar before update on cuenta_eventos
  for each row execute function otea_rechazar();

-- ── Cuota diaria de correos ────────────────────────────────────────────────
-- El plan gratuito del proveedor de correo permite 100 al día entre la lista de espera y las cuentas. El día es el de
-- Chile y lo decide el reloj de la base (como en 0005). Solo sube.

create table cuentas_envios_diarios (
  dia date primary key,
  cantidad integer not null default 0 check (cantidad >= 0),
  actualizado timestamptz not null default now()
);

create function otea_cuentas_envios_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.dia is distinct from old.dia or new.cantidad < old.cantidad then
    raise exception 'La cuota diaria de correos solo puede subir' using errcode = 'OT010';
  end if;
  return new;
end
$$;

create trigger cuentas_envios_solo_sube before update on cuentas_envios_diarios
  for each row execute function otea_cuentas_envios_al_actualizar();
create trigger cuentas_envios_sin_borrar before delete on cuentas_envios_diarios
  for each row execute function otea_rechazar();
create trigger cuentas_envios_sin_vaciar before truncate on cuentas_envios_diarios
  for each statement execute function otea_rechazar();

revoke all on function otea_cuentas_envios_al_actualizar() from public;

-- ── Permisos mínimos de la aplicación ──────────────────────────────────────
-- Lo que no está aquí no se puede hacer: ni cambiar el correo de una cuenta, ni cuándo se creó, ni qué aceptó.

grant select on cuentas to otea_app;
grant insert (correo_indice, correo_cifrado, nombre, clave_hash, clave_cambiada, version_textos, aceptado, temas,
              resumen_previo, creada)
  on cuentas to otea_app;
grant update (nombre, clave_hash, clave_cambiada, fallos, fallos_desde, totp_secreto_cifrado, totp_pendiente_cifrado,
              totp_activado, totp_ultimo_paso, temas, resumen_previo, actualizada)
  on cuentas to otea_app;
grant delete on cuentas to otea_app;

grant select on cuenta_tokens to otea_app;
grant insert (token_hash, proposito, cuenta_id, correo_indice, correo_cifrado, version_textos, aceptado, emitido)
  on cuenta_tokens to otea_app;
grant update (token_hash, version_textos, aceptado, emitido, usado) on cuenta_tokens to otea_app;
grant delete on cuenta_tokens to otea_app;

grant select on cuenta_sesiones to otea_app;
grant insert (token_hash, cuenta_id, fase, creada, ultimo_uso, expira, dispositivo) on cuenta_sesiones to otea_app;
grant update (ultimo_uso, revocada) on cuenta_sesiones to otea_app;
grant delete on cuenta_sesiones to otea_app;

grant select on cuenta_codigos to otea_app;
grant insert (cuenta_id, codigo_hash) on cuenta_codigos to otea_app;
grant update (usado) on cuenta_codigos to otea_app;
grant delete on cuenta_codigos to otea_app;

grant select on cuenta_eventos to otea_app;
grant insert (cuenta_id, tipo, fecha) on cuenta_eventos to otea_app;
grant delete on cuenta_eventos to otea_app;

grant select (dia, cantidad) on cuentas_envios_diarios to otea_app;
grant insert (dia, cantidad) on cuentas_envios_diarios to otea_app;
grant update (cantidad, actualizado) on cuentas_envios_diarios to otea_app;

-- ── Seguridad por fila ─────────────────────────────────────────────────────
-- Una política por operación permitida (0003): sin política, denegado aunque un grant se agregara por error.

alter table cuentas enable row level security;
alter table cuenta_tokens enable row level security;
alter table cuenta_sesiones enable row level security;
alter table cuenta_codigos enable row level security;
alter table cuenta_eventos enable row level security;
alter table cuentas_envios_diarios enable row level security;

-- Una cuenta nace sin verificación en dos pasos y sin intentos fallidos.
create policy cuentas_lectura on cuentas for select to otea_app using (true);
create policy cuentas_alta on cuentas for insert to otea_app
  with check (fallos = 0 and totp_activado is null and totp_secreto_cifrado is null and totp_pendiente_cifrado is null);
create policy cuentas_cambio on cuentas for update to otea_app using (true) with check (true);
create policy cuentas_baja on cuentas for delete to otea_app using (true);

-- Un enlace nace sin usar y solo se puede marcar como usado (o renovar mientras está pendiente); los usados no se tocan.
create policy cuenta_tokens_lectura on cuenta_tokens for select to otea_app using (true);
create policy cuenta_tokens_alta on cuenta_tokens for insert to otea_app with check (usado is null);
create policy cuenta_tokens_cambio on cuenta_tokens for update to otea_app using (usado is null) with check (true);
create policy cuenta_tokens_purga on cuenta_tokens for delete to otea_app using (true);

-- Una sesión nace vigente; una revocada sale del alcance de la aplicación (no se reactiva).
create policy cuenta_sesiones_lectura on cuenta_sesiones for select to otea_app using (true);
create policy cuenta_sesiones_alta on cuenta_sesiones for insert to otea_app with check (revocada is null);
create policy cuenta_sesiones_cambio on cuenta_sesiones for update to otea_app using (revocada is null) with check (true);
create policy cuenta_sesiones_purga on cuenta_sesiones for delete to otea_app using (true);

-- Un código nace sin usar y se gasta una sola vez.
create policy cuenta_codigos_lectura on cuenta_codigos for select to otea_app using (true);
create policy cuenta_codigos_alta on cuenta_codigos for insert to otea_app with check (usado is null);
create policy cuenta_codigos_gasto on cuenta_codigos for update to otea_app
  using (usado is null) with check (usado is not null);
create policy cuenta_codigos_baja on cuenta_codigos for delete to otea_app using (true);

-- Los eventos se agregan y se purgan los viejos (la base solo deja borrar los de más de 30 días).
create policy cuenta_eventos_lectura on cuenta_eventos for select to otea_app using (true);
create policy cuenta_eventos_alta on cuenta_eventos for insert to otea_app with check (true);
create policy cuenta_eventos_purga on cuenta_eventos for delete to otea_app using (fecha < now() - interval '30 days');

create policy cuentas_envios_lectura on cuentas_envios_diarios for select to otea_app using (true);
create policy cuentas_envios_alta on cuentas_envios_diarios for insert to otea_app with check (cantidad = 1);
create policy cuentas_envios_cambio on cuentas_envios_diarios for update to otea_app using (true) with check (true);
