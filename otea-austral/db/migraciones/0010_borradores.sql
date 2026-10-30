-- 0010 · Borradores con IA y su revisión (docs/alertas-reales.md §4 y §5).
--
-- Desde el servicio privado `otea-tareas` (BORRADORES_MODO=ia, apagado por omisión), Claude redacta UN borrador por
-- evento candidato con los metadatos y, de forma transitoria, el texto de las fuentes que lo permiten (`lectura_ia`). El
-- texto de una fuente NUNCA se guarda: ninguna columna lo admite (una prueba compara las columnas). La dueña acepta el
-- borrador en /admin/eventos (la alerta nace en borrador por `rules.ts`, con sus fuentes, en una transacción) o lo
-- descarta con un motivo. Nada se publica sin su aprobación.
--
--   borradores_uso     Gasto de los borradores por mes de Chile: el tope mensual (como mucho US$ 5) vale para todas las
--                      instancias y sobrevive a los reinicios. Mismo patrón que `asistente_uso` (0005).
--   borradores         El borrador revisado (lo que escribió el modelo, ya validado: ≤ 8 KB), su costo, las dos cifras de
--                      la comprobación anticopia y sus banderas. El contenido no cambia; el estado pasa una sola vez de
--                      `pendiente` a `aceptado` o `descartado`. Uno por evento. Sin borrados.
--   borrador_intentos  Cada intento de redactar, con su resultado y un código (nunca un texto): evita volver a gastar en un
--                      evento que la IA no pudo redactar y le explica a la dueña por qué. Solo agregar.
--   evento_auditoria   + acciones `solicitado` (la dueña pide un borrador bajo el umbral) y `borrador_descartado`.
--
-- El tope acumulado de toda la IA (IA_TOPE_TOTAL_USD, opcional) no necesita tabla: es la suma de `asistente_uso` y
-- `borradores_uso`, comprobada con un candado de transacción al reservar (src/lib/ia/gasto-postgres.ts).
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Gasto mensual ──────────────────────────────────────────────────────────

create table borradores_uso (
  mes date primary key check (extract(day from mes) = 1),
  llamadas integer not null default 0 check (llamadas >= 0),
  costo_micros bigint not null default 0 check (costo_micros >= 0),
  -- El tope vigente al reservar (para que el panel, que no tiene la configuración de las tareas, lo muestre). El techo
  -- autorizado por la dueña, US$ 5 al mes, vive también aquí.
  tope_micros bigint not null check (tope_micros between 1 and 5000000),
  actualizado timestamptz not null default now()
);

create function otea_borradores_uso_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.mes is distinct from old.mes or new.llamadas < old.llamadas then
    raise exception 'El uso de los borradores solo puede subir' using errcode = 'OT014';
  end if;
  return new;
end
$$;

create trigger borradores_uso_solo_sube before update on borradores_uso
  for each row execute function otea_borradores_uso_al_actualizar();
create trigger borradores_uso_sin_borrar before delete on borradores_uso
  for each row execute function otea_rechazar();
create trigger borradores_uso_sin_vaciar before truncate on borradores_uso
  for each statement execute function otea_rechazar();

-- ── Borradores ─────────────────────────────────────────────────────────────

create table borradores (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique references eventos_candidatos (id),
  -- Lo que escribió el modelo, ya revisado (`BorradorModeloSchema`): evento, resumen, filas, impacto sugerido y dudas.
  -- Nunca texto de una fuente. Tema, fuentes, confianza y estado los pone el código al aceptarlo.
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object' and octet_length(contenido::text) <= 8192),
  modelo text not null check (modelo in ('claude-haiku-5-5')),
  entrada_tokens integer not null check (entrada_tokens between 0 and 200000),
  salida_tokens integer not null check (salida_tokens between 0 and 20000),
  cache_tokens integer not null default 0 check (cache_tokens between 0 and 200000),
  costo_micros bigint not null check (costo_micros between 0 and 1000000),
  -- Comprobación anticopia contra el texto leído (solo las dos cifras): parte de los 5-gramas del borrador que están en
  -- la fuente y la secuencia común más larga, en palabras.
  copia_proporcion numeric(4, 3) not null check (copia_proporcion between 0 and 1),
  copia_tramo smallint not null check (copia_tramo between 0 and 10000),
  documentos smallint not null check (documentos between 0 and 3),
  banderas text[] not null default '{}' check (
    banderas <@ array['lectura_parcial', 'lectura_manual', 'sin_condicion', 'fuentes_sin_lectura', 'reintento']::text[]
  ),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'descartado')),
  motivo_descarte text check (
    motivo_descarte is null or motivo_descarte in ('irrelevante', 'duplicado', 'impreciso', 'copia', 'otro')
  ),
  alert_id text references alertas (id),
  creado timestamptz not null default now(),
  resuelto timestamptz,
  -- Pendiente: sin resolución. Aceptado: con su alerta. Descartado: con su motivo.
  constraint borradores_resolucion check (
    (estado = 'pendiente' and resuelto is null and alert_id is null and motivo_descarte is null)
    or (estado = 'aceptado' and resuelto is not null and alert_id is not null and motivo_descarte is null)
    or (estado = 'descartado' and resuelto is not null and alert_id is null and motivo_descarte is not null)
  )
);

create index borradores_pendientes on borradores (creado desc) where estado = 'pendiente';

create function otea_borradores_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.id, new.evento_id, new.contenido, new.modelo, new.entrada_tokens, new.salida_tokens, new.cache_tokens,
      new.costo_micros, new.copia_proporcion, new.copia_tramo, new.documentos, new.banderas, new.creado)
     is distinct from
     (old.id, old.evento_id, old.contenido, old.modelo, old.entrada_tokens, old.salida_tokens, old.cache_tokens,
      old.costo_micros, old.copia_proporcion, old.copia_tramo, old.documentos, old.banderas, old.creado) then
    raise exception 'El contenido de un borrador no cambia' using errcode = 'OT015';
  end if;
  if old.estado <> 'pendiente' then
    raise exception 'Un borrador se resuelve una sola vez' using errcode = 'OT015';
  end if;
  return new;
end
$$;

create trigger borradores_se_resuelve_una_vez before update on borradores
  for each row execute function otea_borradores_al_actualizar();
create trigger borradores_sin_borrar before delete on borradores
  for each row execute function otea_rechazar();
create trigger borradores_sin_vaciar before truncate on borradores
  for each statement execute function otea_rechazar();

-- ── Intentos (solo agregar) ────────────────────────────────────────────────

create table borrador_intentos (
  orden bigint generated always as identity primary key,
  evento_id uuid not null references eventos_candidatos (id),
  -- borrador: quedó en la cola · lectura_manual: no se llamó al modelo (p. ej. posible inyección) · rechazo: el modelo se
  -- negó · revision: la salida no pasó la revisión (no se guarda) · error: falló el servicio o se acabó el tiempo.
  resultado text not null check (resultado in ('borrador', 'lectura_manual', 'rechazo', 'revision', 'error')),
  motivo text check (motivo is null or motivo ~ '^[a-z_]{1,40}$'),
  banderas text[] not null default '{}' check (
    banderas <@ array['lectura_parcial', 'lectura_manual', 'sin_condicion', 'fuentes_sin_lectura', 'reintento',
                      'posible_inyeccion']::text[]
  ),
  llamadas smallint not null check (llamadas between 0 and 2),
  costo_micros bigint not null default 0 check (costo_micros between 0 and 1000000),
  creado timestamptz not null default now()
);

create index borrador_intentos_por_evento on borrador_intentos (evento_id, orden);

create trigger borrador_intentos_solo_agregar before update or delete on borrador_intentos
  for each row execute function otea_rechazar();
create trigger borrador_intentos_sin_vaciar before truncate on borrador_intentos
  for each statement execute function otea_rechazar();

-- ── Auditoría de la cola: dos acciones nuevas ──────────────────────────────

alter table evento_auditoria drop constraint evento_auditoria_accion_check;
alter table evento_auditoria add constraint evento_auditoria_accion_check
  check (accion in ('descartado', 'convertido', 'solicitado', 'borrador_descartado'));

revoke all on function otea_borradores_uso_al_actualizar(), otea_borradores_al_actualizar() from public;

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────
-- `INSERT … ON CONFLICT DO UPDATE` lee las columnas de la fila existente: necesita `select` sobre ellas.

grant select (mes, llamadas, costo_micros, tope_micros, actualizado) on borradores_uso to otea_app;
grant insert (mes, llamadas, costo_micros, tope_micros) on borradores_uso to otea_app;
grant update (llamadas, costo_micros, tope_micros, actualizado) on borradores_uso to otea_app;

grant select on borradores to otea_app;
grant insert (evento_id, contenido, modelo, entrada_tokens, salida_tokens, cache_tokens, costo_micros, copia_proporcion,
  copia_tramo, documentos, banderas) on borradores to otea_app;
grant update (estado, motivo_descarte, alert_id, resuelto) on borradores to otea_app;

grant select on borrador_intentos to otea_app;
grant insert (evento_id, resultado, motivo, banderas, llamadas, costo_micros) on borrador_intentos to otea_app;

alter table borradores_uso enable row level security;
alter table borradores enable row level security;
alter table borrador_intentos enable row level security;

create policy borradores_uso_lectura on borradores_uso for select to otea_app using (true);
-- Un mes nace con su primera llamada.
create policy borradores_uso_alta on borradores_uso for insert to otea_app with check (llamadas = 1);
create policy borradores_uso_cambio on borradores_uso for update to otea_app using (true) with check (true);

create policy borradores_lectura on borradores for select to otea_app using (true);
-- Un borrador nace pendiente.
create policy borradores_alta on borradores for insert to otea_app with check (estado = 'pendiente');
-- Solo uno pendiente se resuelve (el disparador acota qué columnas cambian).
create policy borradores_resolucion on borradores for update to otea_app
  using (estado = 'pendiente') with check (estado in ('aceptado', 'descartado'));

create policy borrador_intentos_lectura on borrador_intentos for select to otea_app using (true);
create policy borrador_intentos_alta on borrador_intentos for insert to otea_app with check (true);
