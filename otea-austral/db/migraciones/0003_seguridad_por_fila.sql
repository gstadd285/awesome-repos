-- 0003 · Seguridad por fila (Row-Level Security).
--
-- Hasta aquí la aplicación estaba limitada por permisos de tabla y de columna (`grant`) y por
-- disparadores. Esta migración agrega una segunda pared que decide FILA por fila: cada tabla activa RLS y
-- el rol `otea_app` solo puede hacer lo que una política le permite expresamente. Sin política = denegado,
-- aunque un `grant` agregado por error se lo ofreciera (por ejemplo, un `DELETE` sobre `alertas`).
--
-- Cómo leer esto:
--   · El dueño de la base (el rol de las migraciones) es el dueño de las tablas y no está sujeto a RLS
--     (no se usa FORCE): lo necesita para migrar y sembrar el registro de fuentes. Por eso la aplicación
--     nunca debe entrar con el dueño (ver `npm run db:rol-app`).
--   · Un `UPDATE` o `DELETE` sobre filas que la política no deja ver NO falla: afecta 0 filas. Un
--     `INSERT` que no cumple la política sí falla (error 42501).
--   · `UPDATE … RETURNING` exige además que la fila nueva pase la política de lectura: por eso las
--     políticas de `select` son abiertas (`using (true)`); lo que se restringe es escribir.
--   · `admin_codigos_usados` tiene política de lectura aunque la aplicación no tenga `select`: la necesita
--     `INSERT … RETURNING` (el permiso de columna sigue sin dárselo).
--   · Una tabla nueva debe activar RLS y declarar sus políticas en su propia migración: una prueba
--     (`src/lib/db/rls.test.ts`) falla si no lo hace.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

-- ── Activar RLS en todas las tablas ────────────────────────────────────────

alter table fuentes enable row level security;
alter table alertas enable row level security;
alter table alerta_fuentes enable row level security;
alter table alerta_auditoria enable row level security;
alter table correcciones enable row level security;
alter table lista_espera enable row level security;
alter table admin_sesiones enable row level security;
alter table admin_codigos_usados enable row level security;
-- Control interno de las migraciones: la aplicación no tiene acceso alguno (ni permisos ni políticas).
alter table otea_migraciones enable row level security;

-- ── Registro de fuentes: solo lectura ──────────────────────────────────────
-- Lo escribe la migración (rol dueño). La aplicación no puede crear, cambiar ni borrar fuentes.

create policy fuentes_lectura on fuentes for select to otea_app using (true);

-- ── Alertas ────────────────────────────────────────────────────────────────
-- Nunca se borran. Una alerta nueva nace siempre como borrador, versión 1. Los cambios de estado, los
-- campos inmutables y la versión los controla el disparador `alertas_ciclo_de_vida`.

create policy alertas_lectura on alertas for select to otea_app using (true);
create policy alertas_alta on alertas for insert to otea_app
  with check (estado = 'borrador' and version = 1);
create policy alertas_cambio on alertas for update to otea_app using (true) with check (true);

-- ── Enlaces a las fuentes ──────────────────────────────────────────────────
-- Se crean activos y solo se pueden retirar, una vez; no se borran.

create policy alerta_fuentes_lectura on alerta_fuentes for select to otea_app using (true);
create policy alerta_fuentes_alta on alerta_fuentes for insert to otea_app
  with check (retirada is null);
create policy alerta_fuentes_retiro on alerta_fuentes for update to otea_app
  using (retirada is null) with check (retirada is not null);

-- ── Auditoría y correcciones: solo agregar ─────────────────────────────────

create policy alerta_auditoria_lectura on alerta_auditoria for select to otea_app using (true);
create policy alerta_auditoria_alta on alerta_auditoria for insert to otea_app with check (true);

create policy correcciones_lectura on correcciones for select to otea_app using (true);
create policy correcciones_alta on correcciones for insert to otea_app with check (true);

-- ── Lista de espera ────────────────────────────────────────────────────────
-- Una inscripción nace pendiente. La aplicación solo cambia y borra inscripciones PENDIENTES: una vez
-- confirmada, la fila queda fuera de su alcance (no puede alterarla ni borrarla).

create policy lista_espera_lectura on lista_espera for select to otea_app using (true);
create policy lista_espera_alta on lista_espera for insert to otea_app with check (confirmado is null);
create policy lista_espera_cambio on lista_espera for update to otea_app
  using (confirmado is null) with check (true);
create policy lista_espera_purga on lista_espera for delete to otea_app using (confirmado is null);

-- ── Sesiones del panel y códigos TOTP gastados ─────────────────────────────
-- Una sesión nace vigente y solo se puede revocar, una vez; no se borra. Un código gastado no se toca.

create policy admin_sesiones_lectura on admin_sesiones for select to otea_app using (true);
create policy admin_sesiones_alta on admin_sesiones for insert to otea_app with check (revocada is null);
create policy admin_sesiones_revocacion on admin_sesiones for update to otea_app
  using (revocada is null) with check (revocada is not null);

create policy admin_codigos_lectura on admin_codigos_usados for select to otea_app using (true);
create policy admin_codigos_alta on admin_codigos_usados for insert to otea_app with check (true);
