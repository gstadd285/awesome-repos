-- 0005 · Uso diario del asistente de IA.
--
-- El tope de gasto de la IA tiene que valer para todas las instancias del servidor a la vez (Cloud Run puede
-- levantar varias) y sobrevivir a un reinicio, así que se cuenta aquí y no en memoria. Una fila por día de Chile:
-- cuántas llamadas se hicieron y cuánto se calcula que costaron, en micros (millonésimas de dólar). Sin datos
-- personales: ni preguntas, ni respuestas, ni direcciones IP.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

create table asistente_uso (
  dia date primary key,
  llamadas integer not null default 0 check (llamadas >= 0),
  costo_micros bigint not null default 0 check (costo_micros >= 0),
  actualizado timestamptz not null default now()
);

-- Es el historial del gasto: no se borra ni se vacía, y un día no retrocede (el costo sí puede bajar un poco
-- cuando lo usado fue menos que lo reservado).
create function otea_asistente_uso_al_actualizar() returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.dia is distinct from old.dia or new.llamadas < old.llamadas then
    raise exception 'El uso del asistente solo puede subir' using errcode = 'OT009';
  end if;
  return new;
end
$$;

create trigger asistente_uso_solo_sube before update on asistente_uso
  for each row execute function otea_asistente_uso_al_actualizar();
create trigger asistente_uso_sin_borrar before delete on asistente_uso
  for each row execute function otea_rechazar();
create trigger asistente_uso_sin_vaciar before truncate on asistente_uso
  for each statement execute function otea_rechazar();

revoke all on function otea_asistente_uso_al_actualizar() from public;

-- ── Permisos mínimos y seguridad por fila ──────────────────────────────────
-- `INSERT … ON CONFLICT DO UPDATE` lee las columnas de la fila existente: necesita `select` sobre ellas.

grant select (dia, llamadas, costo_micros) on asistente_uso to otea_app;
grant insert (dia, llamadas, costo_micros) on asistente_uso to otea_app;
grant update (llamadas, costo_micros, actualizado) on asistente_uso to otea_app;

alter table asistente_uso enable row level security;

create policy asistente_uso_lectura on asistente_uso for select to otea_app using (true);
-- Un día nace con su primera llamada.
create policy asistente_uso_alta on asistente_uso for insert to otea_app with check (llamadas = 1);
create policy asistente_uso_cambio on asistente_uso for update to otea_app using (true) with check (true);
