import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "./prueba-postgres";

/**
 * Seguridad por fila (migración 0003, controles 4 y 7 del plan de seguridad). Las pruebas entran con el
 * mismo usuario de mínimos privilegios que la aplicación; el dueño solo prepara datos y concede permisos
 * «de más» para comprobar que las políticas siguen negando.
 */
describe.skipIf(!HAY_BASE_DE_PRUEBAS)("Row-Level Security (Postgres)", () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  const dueño = (sql: string, parametros: unknown[] = []) => base.propietario.consulta(sql, parametros);
  const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);

  describe("invariantes del esquema", () => {
    it("toda tabla del esquema público tiene RLS activada: una tabla nueva sin RLS rompe esta prueba", async () => {
      const filas = await dueño(
        `select c.relname as tabla, c.relrowsecurity as rls
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p')
          order by 1`,
      );
      expect(filas.map((f) => f.tabla)).toEqual(
        expect.arrayContaining([
          "admin_codigos_usados",
          "admin_sesiones",
          "alerta_auditoria",
          "alerta_fuentes",
          "alertas",
          "correcciones",
          "fuentes",
          "lista_espera",
          "otea_migraciones",
        ]),
      );
      expect(filas.filter((f) => !f.rls).map((f) => f.tabla)).toEqual([]);
    });

    it("todo permiso de la aplicación tiene su política: un grant sin política no serviría y esconde un error", async () => {
      const filas = await dueño(
        `select c.relname as tabla, cmd.nombre as operacion
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           cross join (values ('select', 'r'), ('insert', 'a'), ('update', 'w'), ('delete', 'd')) as cmd(nombre, codigo)
          where n.nspname = 'public' and c.relkind = 'r'
            and (has_table_privilege('otea_app', c.oid, upper(cmd.nombre))
                 or (cmd.nombre <> 'delete' and has_any_column_privilege('otea_app', c.oid, upper(cmd.nombre))))
            and not exists (
              select 1 from pg_policy p
               where p.polrelid = c.oid
                 and p.polcmd in (cmd.codigo, '*')
                 and (p.polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'otea_app') = any (p.polroles)))
          order by 1, 2`,
      );
      expect(filas).toEqual([]);
    });

    it("las políticas se dirigen a otea_app, nunca a PUBLIC", async () => {
      const filas = await dueño(
        `select tablename, policyname, roles from pg_policies where schemaname = 'public' order by 1, 2`,
      );
      expect(filas.length).toBeGreaterThan(15);
      for (const f of filas) expect(String(f.roles), `${f.tablename}.${f.policyname}`).toBe("{otea_app}");
    });

    it("el usuario de la aplicación no es superusuario, no salta RLS y no es dueño de ninguna tabla", async () => {
      const [rol] = await app(
        `select current_user as usuario, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
           from pg_roles where rolname = current_user`,
      );
      expect(rol).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      });
      const [grupo] = await dueño(
        "select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = 'otea_app'",
      );
      expect(grupo).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
      const [propias] = await dueño("select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = $1", [
        rol.usuario,
      ]);
      expect(propias.n).toBe(0);
    });

    it("la aplicación no ve ni toca el control interno de las migraciones", async () => {
      await expect(app("select * from otea_migraciones")).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from otea_migraciones")).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("las políticas niegan aunque un grant diera permiso de más", () => {
    it("el registro de fuentes es de solo lectura para la aplicación", async () => {
      await dueño("grant insert, update, delete on fuentes to otea_app");
      try {
        await expect(
          app(
            `insert into fuentes (id, nombre, organismo, url_base, tipo, temas, acceso, condiciones_reutilizacion, prioridad)
             values ('intruso', 'x', 'x', '', 'primaria', '{}', 'manual', 'x', 'A')`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        expect(await app("update fuentes set activa = false where id = 'bcch' returning 1")).toEqual([]);
        expect(await app("delete from fuentes where id = 'bcch' returning 1")).toEqual([]);
        expect(await dueño("select activa from fuentes where id = 'bcch'")).toEqual([{ activa: true }]);
      } finally {
        await dueño("revoke insert, update, delete on fuentes from otea_app");
      }
    });

    it("las alertas no se borran y solo nacen como borrador, versión 1", async () => {
      await dueño("grant delete on alertas to otea_app");
      await dueño("grant insert (estado, version) on alertas to otea_app");
      try {
        const nueva = (estado: string, version: number, id: string) =>
          app(
            `insert into alertas (id, tema, evento, resumen, filas, fecha, revisor, impacto, estado, version)
             values ($1, 'cobre', 'e', 'r', '[{"sector":"s"}]', now(), 'r', 'bajo', $2, $3)`,
            [id, estado, version],
          );
        await expect(nueva("publicada", 1, "rls-a")).rejects.toMatchObject({ code: "42501" });
        await expect(nueva("borrador", 7, "rls-b")).rejects.toMatchObject({ code: "42501" });
        await nueva("borrador", 1, "rls-c");
        expect(await app("delete from alertas where id = 'rls-c' returning 1")).toEqual([]);
        expect(await dueño("select count(*)::int as n from alertas where id = 'rls-c'")).toEqual([{ n: 1 }]);
      } finally {
        await dueño("revoke delete on alertas from otea_app");
        await dueño("revoke insert (estado, version) on alertas from otea_app");
      }
    });

    it("la auditoría y las correcciones solo admiten altas, no cambios ni borrados", async () => {
      await dueño("grant update, delete on alerta_auditoria, correcciones to otea_app");
      try {
        expect(await app("update alerta_auditoria set nota = 'x' where true returning 1")).toEqual([]);
        expect(await app("delete from alerta_auditoria where true returning 1")).toEqual([]);
        expect(await app("update correcciones set texto_publico = 'x' where true returning 1")).toEqual([]);
        expect(await app("delete from correcciones where true returning 1")).toEqual([]);
      } finally {
        await dueño("revoke update, delete on alerta_auditoria, correcciones from otea_app");
      }
    });

    it("una sesión del panel nace vigente y solo se revoca, una vez", async () => {
      await dueño("grant insert (revocada) on admin_sesiones to otea_app");
      try {
        const sid = "A".repeat(22);
        await expect(
          app("insert into admin_sesiones (sid, expira, revocada) values ($1, now() + interval '1 hour', now())", [sid]),
        ).rejects.toMatchObject({ code: "42501" });
        await app("insert into admin_sesiones (sid, expira) values ($1, now() + interval '1 hour')", [sid]);
        expect(await app("update admin_sesiones set revocada = now() where sid = $1 and revocada is null returning 1", [sid])).toHaveLength(1);
        // Ya revocada: la fila sale del alcance de la aplicación (0 filas, sin error).
        expect(await app("update admin_sesiones set revocada = now() where sid = $1 returning 1", [sid])).toEqual([]);
      } finally {
        await dueño("revoke insert (revocada) on admin_sesiones from otea_app");
      }
    });
  });

  describe("lista de espera: la aplicación solo toca inscripciones pendientes", () => {
    const pendiente = (correo: string) =>
      app(
        `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento)
         values ($1, $2, now(), now(), 'v1') returning 1`,
        [correo, createHash("sha256").update(correo).digest("hex")],
      );

    it("no puede crear una inscripción ya confirmada", async () => {
      await expect(
        app(
          `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento, confirmado)
           values ('colada@correo.cl', null, now(), now(), 'v1', now())`,
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("cambia y borra las pendientes", async () => {
      await pendiente("pendiente@correo.cl");
      expect(await app("update lista_espera set version_consentimiento = 'v2' where correo = 'pendiente@correo.cl' returning 1")).toHaveLength(1);
      expect(await app("delete from lista_espera where correo = 'pendiente@correo.cl' returning 1")).toHaveLength(1);
    });

    it("una confirmada queda fuera de su alcance: ni cambiarla ni borrarla (0 filas, sin error)", async () => {
      await dueño(
        `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento, confirmado)
         values ('confirmada@correo.cl', null, now(), now(), 'v1', now())`,
      );
      expect(await app("update lista_espera set version_consentimiento = 'v2' where correo = 'confirmada@correo.cl' returning 1")).toEqual([]);
      expect(await app("delete from lista_espera where correo = 'confirmada@correo.cl' returning 1")).toEqual([]);
      expect(await app("delete from lista_espera returning 1")).not.toContainEqual(expect.objectContaining({ correo: "confirmada@correo.cl" }));
      expect(await dueño("select version_consentimiento from lista_espera where correo = 'confirmada@correo.cl'")).toEqual([
        { version_consentimiento: "v1" },
      ]);
    });

    it("reinscribir un correo ya confirmado no cambia nada ni falla (ON CONFLICT respeta la política)", async () => {
      const filas = await app(
        `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento)
         values ('confirmada@correo.cl', $1, now(), now(), 'v9')
         on conflict (correo) do update set token_hash = excluded.token_hash, version_consentimiento = excluded.version_consentimiento
         where lista_espera.confirmado is null
         returning 1`,
        ["b".repeat(64)],
      );
      expect(filas).toEqual([]);
      expect(await dueño("select version_consentimiento, token_hash from lista_espera where correo = 'confirmada@correo.cl'")).toEqual([
        { version_consentimiento: "v1", token_hash: null },
      ]);
    });
  });
});
