-- 0004 · Correos de la lista de espera cifrados (control 5 del plan de seguridad).
--
-- Antes: `lista_espera.correo` en claro (el proveedor cifra el disco, pero quien viera la base o una copia
-- leía todos los correos). Ahora la aplicación cifra el correo con AES-256-GCM antes de guardarlo y lo
-- identifica por un índice ciego (HMAC-SHA256): no puede leerlo de vuelta. Solo el dueño, con
-- `WAITLIST_SECRETO`, los descifra (`npm run lista:exportar`).
--
--   correo_indice   HMAC-SHA256 del correo normalizado (hex). Clave primaria: detecta repetidos.
--   correo_cifrado  `v1.` + base64url(iv ‖ texto cifrado ‖ etiqueta). La aplicación lo escribe y NO lo lee.
--
-- Si la tabla ya tiene filas esta migración se detiene: esos correos están en claro y no se pueden cifrar
-- desde SQL (la clave no está en la base). Exporta lo que necesites (`\copy`), vacía la tabla y migra; ver
-- docs/despliegue.md, «Cifrado de correos». En un despliegue nuevo la tabla está vacía.
--
-- Una migración aplicada no se edita: los cambios van en un archivo nuevo.

do $$
declare
  n bigint;
begin
  select count(*) into n from lista_espera;
  if n > 0 then
    raise exception 'lista_espera tiene % inscripciones con el correo en claro: expórtalas y vacía la tabla antes de migrar (docs/despliegue.md)', n
      using errcode = 'OT008';
  end if;
end
$$;

alter table lista_espera drop constraint lista_espera_pkey;
alter table lista_espera drop column correo;

alter table lista_espera
  add column correo_indice text not null check (correo_indice ~ '^[0-9a-f]{64}$'),
  -- 29 bytes como mínimo (iv + 1 + etiqueta) y 282 como máximo (iv + 254 + etiqueta), en base64url: 42 a 379
  -- caracteres con el prefijo `v1.` (400 de holgura). El límite de repeticiones de las expresiones regulares
  -- de Postgres es 255, por eso el largo se comprueba aparte.
  add column correo_cifrado text not null check (
    correo_cifrado ~ '^v1\.[A-Za-z0-9_-]+$' and char_length(correo_cifrado) between 42 and 400
  );
alter table lista_espera add primary key (correo_indice);

-- ── Permisos mínimos ───────────────────────────────────────────────────────
-- La aplicación escribe el correo cifrado, pero no tiene permiso para leerlo (ni para cambiarlo).

revoke all on lista_espera from otea_app;
grant select (correo_indice, token_hash, token_emitido, creado, version_consentimiento, confirmado)
  on lista_espera to otea_app;
grant insert (correo_indice, correo_cifrado, token_hash, token_emitido, creado, version_consentimiento)
  on lista_espera to otea_app;
grant update (token_hash, token_emitido, version_consentimiento, confirmado) on lista_espera to otea_app;
grant delete on lista_espera to otea_app;
