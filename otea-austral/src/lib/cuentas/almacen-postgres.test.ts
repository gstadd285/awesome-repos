import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearAlmacenPostgres } from "./almacen-postgres";
import { pruebasDelContrato } from "./contrato-almacen";

let base: BaseDePrueba | undefined;

const hex = () => randomBytes(32).toString("hex");
const cifrado = () => `v1.${randomBytes(40).toString("base64url")}`;
const cifradoTotp = () => `v1.${randomBytes(60).toString("base64url")}`;
const claveHash = () => `scrypt$32768$8$3$${randomBytes(16).toString("base64url")}$${randomBytes(32).toString("base64url")}`;

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("almacén de cuentas en Postgres", () => {
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  // Las mismas pruebas del contrato que corre el almacén en memoria, con la aplicación entrando con sus permisos mínimos.
  pruebasDelContrato("Postgres", async () => ({ almacen: crearAlmacenPostgres(base!.app) }));

  describe("lo que la base impide aunque la aplicación se equivoque (migración 0006)", () => {
    const app = (sql: string, parametros: unknown[] = []) => base!.app.consulta(sql, parametros);
    const dueño = (sql: string, parametros: unknown[] = []) => base!.propietario.consulta(sql, parametros);

    /** Una cuenta creada por la aplicación, con la forma mínima que exige la base. */
    async function cuenta(): Promise<string> {
      const [f] = await app(
        `insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado)
         values ($1, $2, $3, 'v-prueba', now()) returning id`,
        [hex(), cifrado(), claveHash()],
      );
      return f.id as string;
    }

    const sesion = (cuentaId: string, extra = "") =>
      app(
        `insert into cuenta_sesiones (token_hash, cuenta_id, fase, creada, ultimo_uso, expira${extra ? ", " + extra.split("=")[0] : ""})
         values ($1, $2, 'activa', now(), now(), now() + interval '1 day'${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
        [hex(), cuentaId],
      );

    describe("cuentas", () => {
      it("la aplicación no puede cambiar el correo de una cuenta, cuándo se creó ni qué aceptó", async () => {
        const id = await cuenta();
        const cambios: [string, unknown[]][] = [
          ["correo_indice = $2", [id, hex()]],
          ["correo_cifrado = $2", [id, cifrado()]],
          ["creada = now()", [id]],
          ["aceptado = now()", [id]],
          ["version_textos = 'otra'", [id]],
          ["id = gen_random_uuid()", [id]],
        ];
        for (const [asignacion, parametros] of cambios) {
          await expect(app(`update cuentas set ${asignacion} where id = $1`, parametros), asignacion).rejects.toMatchObject({ code: "42501" });
        }
      });

      it("una cuenta no nace con la verificación en dos pasos ya activada ni con intentos fallidos", async () => {
        await expect(
          app(
            `insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado, totp_activado)
             values ($1, $2, $3, 'v', now(), now())`,
            [hex(), cifrado(), claveHash()],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          app(`insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado, fallos) values ($1, $2, $3, 'v', now(), 5)`, [hex(), cifrado(), claveHash()]),
        ).rejects.toMatchObject({ code: "42501" });
      });

      it("rechaza datos con forma inválida: índice, correo cifrado, contraseña, nombre y temas", async () => {
        const insertar = (columnas: string, valores: unknown[], marcas: string) =>
          app(`insert into cuentas (${columnas}) values (${marcas})`, valores);
        const base_ = { indice: hex(), cifrado: cifrado(), hash: claveHash() };
        await expect(insertar("correo_indice, correo_cifrado, clave_hash, version_textos, aceptado", ["no-es-hex", base_.cifrado, base_.hash], "$1, $2, $3, 'v', now()")).rejects.toMatchObject({ code: "23514" });
        await expect(insertar("correo_indice, correo_cifrado, clave_hash, version_textos, aceptado", [base_.indice, "persona@correo.cl", base_.hash], "$1, $2, $3, 'v', now()")).rejects.toMatchObject({ code: "23514" });
        await expect(insertar("correo_indice, correo_cifrado, clave_hash, version_textos, aceptado", [base_.indice, base_.cifrado, "pbkdf2$1$2"], "$1, $2, $3, 'v', now()")).rejects.toMatchObject({ code: "23514" });
        await expect(insertar("correo_indice, correo_cifrado, clave_hash, version_textos, aceptado, nombre", [base_.indice, base_.cifrado, base_.hash, "x".repeat(61)], "$1, $2, $3, 'v', now(), $4")).rejects.toMatchObject({ code: "23514" });
        await expect(insertar("correo_indice, correo_cifrado, clave_hash, version_textos, aceptado, temas", [base_.indice, base_.cifrado, base_.hash, ["inventado"]], "$1, $2, $3, 'v', now(), $4")).rejects.toMatchObject({ code: "23514" });
      });

      it("un correo no se repite: el índice es único", async () => {
        const indice = hex();
        const nueva = () =>
          app(`insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado) values ($1, $2, $3, 'v', now())`, [indice, cifrado(), claveHash()]);
        await nueva();
        await expect(nueva()).rejects.toMatchObject({ code: "23505" });
      });

      it("el secreto de la verificación en dos pasos y su fecha de activación van juntos", async () => {
        const id = await cuenta();
        await expect(app("update cuentas set totp_activado = now() where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
        await expect(app("update cuentas set totp_secreto_cifrado = $2 where id = $1", [id, cifradoTotp()])).rejects.toMatchObject({ code: "23514" });
        expect(await app("update cuentas set totp_secreto_cifrado = $2, totp_activado = now() where id = $1 returning 1", [id, cifradoTotp()])).toHaveLength(1);
      });

      it("la aplicación puede borrar una cuenta, y con ella se va todo lo que depende de ella", async () => {
        const id = await cuenta();
        await sesion(id);
        await app("insert into cuenta_eventos (cuenta_id, tipo) values ($1, 'acceso')", [id]);
        await app("insert into cuenta_codigos (cuenta_id, codigo_hash) values ($1, $2)", [id, hex()]);
        await app("insert into cuenta_tokens (token_hash, proposito, cuenta_id) values ($1, 'restablecer', $2)", [hex(), id]);
        expect(await app("delete from cuentas where id = $1 returning 1", [id])).toHaveLength(1);
        for (const tabla of ["cuenta_sesiones", "cuenta_eventos", "cuenta_codigos", "cuenta_tokens"]) {
          expect(await dueño(`select count(*)::int as n from ${tabla} where cuenta_id = $1`, [id]), tabla).toEqual([{ n: 0 }]);
        }
      });
    });

    describe("enlaces de los correos", () => {
      it("un alta lleva correo y textos aceptados; un restablecimiento, una cuenta y nada más", async () => {
        const id = await cuenta();
        // Alta sin correo.
        await expect(app("insert into cuenta_tokens (token_hash, proposito) values ($1, 'alta')", [hex()])).rejects.toMatchObject({ code: "23514" });
        // Alta con cuenta.
        await expect(
          app(
            `insert into cuenta_tokens (token_hash, proposito, cuenta_id, correo_indice, correo_cifrado, version_textos, aceptado)
             values ($1, 'alta', $2, $3, $4, 'v', now())`,
            [hex(), id, hex(), cifrado()],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        // Restablecer sin cuenta, y con correo.
        await expect(app("insert into cuenta_tokens (token_hash, proposito) values ($1, 'restablecer')", [hex()])).rejects.toMatchObject({ code: "23514" });
        await expect(
          app("insert into cuenta_tokens (token_hash, proposito, cuenta_id, correo_indice, correo_cifrado) values ($1, 'restablecer', $2, $3, $4)", [hex(), id, hex(), cifrado()]),
        ).rejects.toMatchObject({ code: "23514" });
        // Un propósito desconocido.
        await expect(app("insert into cuenta_tokens (token_hash, proposito, cuenta_id) values ($1, 'otro', $2)", [hex(), id])).rejects.toMatchObject({ code: "23514" });
      });

      it("solo puede haber un enlace pendiente por correo y por cuenta", async () => {
        const id = await cuenta();
        const indice = hex();
        const alta = () =>
          app(
            `insert into cuenta_tokens (token_hash, proposito, correo_indice, correo_cifrado, version_textos, aceptado)
             values ($1, 'alta', $2, $3, 'v', now())`,
            [hex(), indice, cifrado()],
          );
        await alta();
        await expect(alta()).rejects.toMatchObject({ code: "23505" });
        const restablecer = () => app("insert into cuenta_tokens (token_hash, proposito, cuenta_id) values ($1, 'restablecer', $2)", [hex(), id]);
        await restablecer();
        await expect(restablecer()).rejects.toMatchObject({ code: "23505" });
      });

      it("un enlace usado queda fuera del alcance de la aplicación: no se puede reabrir (0 filas, sin error)", async () => {
        const id = await cuenta();
        const token = hex();
        await app("insert into cuenta_tokens (token_hash, proposito, cuenta_id) values ($1, 'restablecer', $2)", [token, id]);
        expect(await app("update cuenta_tokens set usado = now() where token_hash = $1 and usado is null returning 1", [token])).toHaveLength(1);
        expect(await app("update cuenta_tokens set usado = null where token_hash = $1 returning 1", [token])).toEqual([]);
        expect(await app("update cuenta_tokens set emitido = now() where token_hash = $1 returning 1", [token])).toEqual([]);
      });

      it("la aplicación no puede cambiar a quién pertenece un enlace ni su propósito", async () => {
        const id = await cuenta();
        const token = hex();
        await app("insert into cuenta_tokens (token_hash, proposito, cuenta_id) values ($1, 'restablecer', $2)", [token, id]);
        await expect(app("update cuenta_tokens set cuenta_id = $2 where token_hash = $1", [token, await cuenta()])).rejects.toMatchObject({ code: "42501" });
        await expect(app("update cuenta_tokens set proposito = 'alta' where token_hash = $1", [token])).rejects.toMatchObject({ code: "42501" });
      });
    });

    describe("sesiones", () => {
      it("no admite vigencias de más de 31 días ni fases desconocidas", async () => {
        const id = await cuenta();
        await expect(
          app(`insert into cuenta_sesiones (token_hash, cuenta_id, fase, creada, ultimo_uso, expira) values ($1, $2, 'activa', now(), now(), now() + interval '32 days')`, [hex(), id]),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          app(`insert into cuenta_sesiones (token_hash, cuenta_id, fase, creada, ultimo_uso, expira) values ($1, $2, 'admin', now(), now(), now() + interval '1 day')`, [hex(), id]),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          app(`insert into cuenta_sesiones (token_hash, cuenta_id, fase, creada, ultimo_uso, expira) values ($1, $2, 'activa', now(), now(), now() - interval '1 day')`, [hex(), id]),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("una sesión revocada no se reactiva: sale del alcance de la aplicación", async () => {
        const id = await cuenta();
        const [{ id: sid }] = await sesion(id);
        expect(await app("update cuenta_sesiones set revocada = now() where id = $1 and revocada is null returning 1", [sid])).toHaveLength(1);
        expect(await app("update cuenta_sesiones set revocada = null where id = $1 returning 1", [sid])).toEqual([]);
        expect(await app("update cuenta_sesiones set ultimo_uso = now() where id = $1 returning 1", [sid])).toEqual([]);
        expect(await dueño("select revocada is not null as revocada from cuenta_sesiones where id = $1", [sid])).toEqual([{ revocada: true }]);
      });

      it("no nace ya revocada y la aplicación no puede cambiar su cuenta, fase ni vencimiento", async () => {
        const id = await cuenta();
        await expect(sesion(id, "revocada=now()")).rejects.toMatchObject({ code: "42501" });
        const [{ id: sid }] = await sesion(id);
        for (const columna of ["fase = 'pendiente'", "expira = now() + interval '2 days'", "cuenta_id = gen_random_uuid()", "creada = now()"]) {
          await expect(app(`update cuenta_sesiones set ${columna} where id = $1`, [sid]), columna).rejects.toMatchObject({ code: "42501" });
        }
      });
    });

    describe("códigos de recuperación", () => {
      it("un código gastado no se puede volver a poner como nuevo", async () => {
        const id = await cuenta();
        const codigo = hex();
        await app("insert into cuenta_codigos (cuenta_id, codigo_hash) values ($1, $2)", [id, codigo]);
        expect(await app("update cuenta_codigos set usado = now() where cuenta_id = $1 and codigo_hash = $2 and usado is null returning 1", [id, codigo])).toHaveLength(1);
        expect(await app("update cuenta_codigos set usado = null where cuenta_id = $1 and codigo_hash = $2 returning 1", [id, codigo])).toEqual([]);
        await expect(app("insert into cuenta_codigos (cuenta_id, codigo_hash, usado) values ($1, $2, now())", [id, hex()])).rejects.toMatchObject({ code: "42501" });
      });
    });

    describe("actividad y cuota de correos", () => {
      it("un evento no se edita, y solo se pueden borrar los de más de 30 días", async () => {
        const id = await cuenta();
        await app("insert into cuenta_eventos (cuenta_id, tipo, fecha) values ($1, 'acceso', now())", [id]);
        await app("insert into cuenta_eventos (cuenta_id, tipo, fecha) values ($1, 'alta', now() - interval '40 days')", [id]);
        await expect(app("update cuenta_eventos set tipo = 'alta' where cuenta_id = $1", [id])).rejects.toMatchObject({ code: "42501" });
        // Ni el dueño: el disparador rechaza cualquier cambio.
        await expect(dueño("update cuenta_eventos set tipo = 'alta' where cuenta_id = $1", [id])).rejects.toMatchObject({ code: "OT001" });
        expect(await app("delete from cuenta_eventos where cuenta_id = $1 returning tipo", [id])).toEqual([{ tipo: "alta" }]);
        expect(await dueño("select tipo from cuenta_eventos where cuenta_id = $1", [id])).toEqual([{ tipo: "acceso" }]);
      });

      it("no admite tipos de evento desconocidos", async () => {
        const id = await cuenta();
        await expect(app("insert into cuenta_eventos (cuenta_id, tipo) values ($1, 'contraseña_en_claro')", [id])).rejects.toMatchObject({ code: "23514" });
      });

      it("la cuota diaria solo sube, no se borra ni se vacía, y nace en uno", async () => {
        const dia = `2041-03-${String(10 + Math.floor(Math.random() * 15))}`;
        await expect(app("insert into cuentas_envios_diarios (dia, cantidad) values ($1, 50)", [dia])).rejects.toMatchObject({ code: "42501" });
        await app("insert into cuentas_envios_diarios (dia, cantidad) values ($1, 1)", [dia]);
        await app("update cuentas_envios_diarios set cantidad = 5 where dia = $1", [dia]);
        await expect(app("update cuentas_envios_diarios set cantidad = 2 where dia = $1", [dia])).rejects.toMatchObject({ code: "OT010" });
        await expect(app("update cuentas_envios_diarios set dia = '2041-04-01' where dia = $1", [dia])).rejects.toMatchObject({ code: "42501" });
        await expect(app("delete from cuentas_envios_diarios where dia = $1", [dia])).rejects.toMatchObject({ code: "42501" });
        await expect(dueño("delete from cuentas_envios_diarios where dia = $1", [dia])).rejects.toMatchObject({ code: "OT001" });
        await expect(dueño("truncate cuentas_envios_diarios")).rejects.toMatchObject({ code: "OT001" });
      });
    });

    it("la aplicación no puede vaciar ninguna de las tablas nuevas", async () => {
      for (const tabla of ["cuentas", "cuenta_tokens", "cuenta_sesiones", "cuenta_codigos", "cuenta_eventos", "cuentas_envios_diarios"]) {
        await expect(app(`truncate ${tabla}`), tabla).rejects.toMatchObject({ code: "42501" });
      }
    });
  });

  describe("invitaciones: lo que la base impide aunque la aplicación se equivoque (migración 0009)", () => {
    const app = (sql: string, parametros: unknown[] = []) => base!.app.consulta(sql, parametros);
    const dueño = (sql: string, parametros: unknown[] = []) => base!.propietario.consulta(sql, parametros);

    async function invitacion(): Promise<string> {
      const [f] = await app(
        "insert into invitaciones (codigo_hash, alias, emitida, vence) values ($1, 'prueba', now(), now() + interval '14 days') returning id",
        [hex()],
      );
      return f.id as string;
    }

    it("dos altas a la vez con la misma invitación: se crea una sola cuenta (cinco rondas)", async () => {
      const almacen = crearAlmacenPostgres(base!.app);
      const ahora = new Date();
      const T = (s: number) => new Date(ahora.getTime() + s * 1000).toISOString();
      for (let ronda = 0; ronda < 5; ronda++) {
        const id = await invitacion();
        const altas = [hex(), hex()].map((correoIndice) => ({ correoIndice, tokenHash: hex() }));
        for (const { correoIndice, tokenHash } of altas) {
          await almacen.emitirAlta({ correoIndice, correoCifrado: cifrado(), tokenHash, versionTextos: "v1", ahora: T(0), reenviarSiAnteriorA: T(-600), invitacionId: id });
        }
        const resultados = await Promise.all(
          altas.map(({ tokenHash }) =>
            almacen.activarAlta({
              tokenHash,
              vigenteDesde: T(-60),
              claveHash: claveHash(),
              ahora: T(1),
              sesion: { tokenHash: hex(), expira: T(3600), dispositivo: null },
              exigirInvitacion: true,
            }),
          ),
        );
        expect(resultados.filter((r) => typeof r === "object"), `ronda ${ronda}`).toHaveLength(1);
        expect(resultados.filter((r) => r === "invitacion"), `ronda ${ronda}`).toHaveLength(1);
        const [{ n }] = await dueño("select count(*)::int as n from cuentas where correo_indice = any($1::text[])", [altas.map((x) => x.correoIndice)]);
        expect(n).toBe(1);
        const [{ usos }] = await dueño("select count(*)::int as usos from invitacion_auditoria where invitacion_id = $1 and accion = 'usada'", [id]);
        expect(usos).toBe(1);
      }
    });

    it("el código no se guarda: solo su huella, con la forma de un HMAC", async () => {
      const columnas = await dueño(
        "select column_name from information_schema.columns where table_name = 'invitaciones' order by ordinal_position",
      );
      expect(columnas.map((c) => c.column_name)).toEqual([
        "id",
        "codigo_hash",
        "alias",
        "emitida",
        "vence",
        "envios",
        "usada",
        "revocada",
        "cuenta_id",
        "registrada",
      ]);
      await expect(
        app("insert into invitaciones (codigo_hash, alias, emitida, vence) values ('ABCDE-FGHIJ-KLMNO-PQRST', 'a', now(), now() + interval '1 day')"),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        app("insert into invitaciones (codigo_hash, alias, emitida, vence) values ($1, 'Ana Pérez', now(), now() + interval '1 day')", [hex()]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("nace vigente, no vale más de 30 días y la aplicación no cambia lo que la identifica ni la borra", async () => {
      const otro = hex();
      await expect(
        app("insert into invitaciones (codigo_hash, alias, emitida, vence, usada) values ($1, 'a', now(), now() + interval '1 day', now())", [otro]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        app("insert into invitaciones (codigo_hash, alias, emitida, vence) values ($1, 'a', now(), now() + interval '31 days')", [otro]),
      ).rejects.toMatchObject({ code: "23514" });
      const id = await invitacion();
      for (const asignacion of ["alias = 'otro'", "vence = now() + interval '20 days'", "codigo_hash = md5('x') || md5('y')", "emitida = now()"]) {
        await expect(app(`update invitaciones set ${asignacion} where id = $1`, [id]), asignacion).rejects.toMatchObject({ code: "42501" });
      }
      await expect(app("delete from invitaciones where id = $1", [id])).rejects.toMatchObject({ code: "42501" });
      await expect(app("truncate invitaciones")).rejects.toMatchObject({ code: "42501" });
    });

    it("usada y revocada se fijan una sola vez, los correos solo suben y ni el dueño la borra", async () => {
      const id = await invitacion();
      await app("update invitaciones set envios = envios + 1 where id = $1", [id]);
      await expect(dueño("update invitaciones set envios = 0 where id = $1", [id])).rejects.toMatchObject({ code: "OT013" });
      await app("update invitaciones set revocada = now() where id = $1", [id]);
      // Revocada: fuera del alcance de la aplicación (0 filas, sin error) y el dueño tampoco la reabre ni la gasta.
      expect(await app("update invitaciones set usada = now() where id = $1 returning 1 as ok", [id])).toEqual([]);
      await expect(dueño("update invitaciones set revocada = null where id = $1", [id])).rejects.toMatchObject({ code: "OT013" });
      await expect(dueño("update invitaciones set usada = now() where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
      await expect(dueño("update invitaciones set envios = envios + 1 where id = $1", [id])).rejects.toMatchObject({ code: "OT013" });
      await expect(dueño("delete from invitaciones where id = $1", [id])).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("truncate invitaciones cascade")).rejects.toMatchObject({ code: "OT001" });
    });

    it("la auditoría es de solo agregar, también para el dueño, y su actor no lleva datos personales", async () => {
      const id = await invitacion();
      await app("insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'emitida', 'panel', now())", [id]);
      await expect(app("update invitacion_auditoria set actor = 'otro' where invitacion_id = $1", [id])).rejects.toMatchObject({ code: "42501" });
      await expect(app("delete from invitacion_auditoria where invitacion_id = $1", [id])).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("update invitacion_auditoria set actor = 'otro' where invitacion_id = $1", [id])).rejects.toMatchObject({ code: "OT001" });
      await expect(dueño("delete from invitacion_auditoria where invitacion_id = $1", [id])).rejects.toMatchObject({ code: "OT001" });
      await expect(
        app("insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'emitida', 'ana@correo.cl', now())", [id]),
      ).rejects.toMatchObject({ code: "23514" });
      // Quien usa la invitación no queda nombrado; quien emite o revoca, sí (con el alias del panel).
      await expect(app("insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'usada', 'panel', now())", [id])).rejects.toMatchObject({
        code: "23514",
      });
      await expect(app("insert into invitacion_auditoria (invitacion_id, accion, actor, fecha) values ($1, 'revocada', null, now())", [id])).rejects.toMatchObject({
        code: "23514",
      });
    });

    it("solo un enlace de alta lleva invitación", async () => {
      const id = await invitacion();
      const [cuenta] = await app(
        "insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado) values ($1, $2, $3, 'v', now()) returning id",
        [hex(), cifrado(), claveHash()],
      );
      await expect(
        app("insert into cuenta_tokens (token_hash, proposito, cuenta_id, invitacion_id) values ($1, 'restablecer', $2, $3)", [hex(), cuenta.id, id]),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});
