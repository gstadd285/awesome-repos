import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Correo } from "@/lib/correo/resend";
import { crearCifradorCuentas } from "@/lib/cuentas/cifrado";
import { generarToken, hashToken } from "@/lib/cuentas/tokens";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearTurnoPostgres } from "@/lib/ingesta/turno";
import { crearAlmacenResumenPostgres } from "./almacen-postgres";
import { darDeBaja } from "./baja";
import { correrResumen } from "./servicio";

/**
 * El resumen diario con Postgres de verdad (migración 0011), entrando con los permisos mínimos de la aplicación.
 *
 * DATOS DE PRUEBA: cuentas con correos de example.org y alertas ficticias («(prueba)», enlaces de example.org) en una base
 * desechable. Nada de esto es un dato real.
 */

let base: BaseDePrueba | undefined;
const cifrador = crearCifradorCuentas(randomBytes(32).toString("base64url"));
const claveHash = () => `scrypt$32768$8$3$${randomBytes(16).toString("base64url")}$${randomBytes(32).toString("base64url")}`;

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("resumen diario en Postgres", () => {
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  const app = (sql: string, p: unknown[] = []) => base!.app.consulta(sql, p);
  const dueño = (sql: string, p: unknown[] = []) => base!.propietario.consulta(sql, p);

  /** Una cuenta creada como la crea la aplicación; con `resumen`, lo pidió (con fecha) y sigue esos temas. */
  async function cuenta(correo: string, { resumen = true, temas = [] as string[], pedido = "now() - interval '2 days'" } = {}) {
    const { indice, cifrado } = cifrador.cifrarCorreo(correo);
    const [f] = await app(
      `insert into cuentas (correo_indice, correo_cifrado, clave_hash, version_textos, aceptado, temas)
       values ($1, $2, $3, 'v-prueba', now(), $4::text[]) returning id`,
      [indice, cifrado, claveHash(), temas],
    );
    // El dueño fija la fecha del consentimiento en el pasado (la aplicación siempre usa «ahora»).
    if (resumen) await dueño(`update cuentas set resumen_previo = true, resumen_alta = ${pedido} where id = $1`, [f.id]);
    return f.id as string;
  }

  /** Una alerta publicada como si la hubiera aprobado la dueña (el dueño de la base la inserta ya publicada). */
  async function alerta(tema: string, { horas = 2, estado = "publicada", ejemplo = false, fuente = "bcch" } = {}) {
    const id = `prueba-${randomUUID().slice(0, 8)}`;
    await dueño(
      `insert into alertas (id, tema, evento, resumen, filas, fecha, revisor, impacto, estado, es_ejemplo)
       values ($1, $2, $3, 'Escenario ficticio de las pruebas (prueba).', $4::jsonb, now() - make_interval(hours => $5), 'dueña', 'medio', $6, $7)`,
      [
        id,
        tema,
        `Evento ${id} (prueba)`,
        JSON.stringify([{ sector: "Sector (prueba)", direccion: "gana", condicion: "Si se sostiene (prueba)", confianza: "media" }]),
        horas,
        estado,
        ejemplo,
      ],
    );
    await dueño(
      `insert into alerta_fuentes (id, alert_id, source_id, organismo, nombre_fuente, tipo, titulo_documento, url, fecha_publicacion, fecha_consulta)
       values ($1, $2, $3, '', '', 'prensa', 'Documento (prueba)', 'https://example.org/prueba', current_date - 1, current_date)`,
      [`f-${id}`, id, fuente],
    );
    return id;
  }

  describe("lo que la base impide aunque la aplicación se equivoque", () => {
    it("el resumen va con su fecha de consentimiento: una cosa sin la otra no se puede guardar", async () => {
      const id = await cuenta(`a.${randomUUID()}@example.org`, { resumen: false });
      await expect(app("update cuentas set resumen_previo = true where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
      await expect(app("update cuentas set resumen_alta = now() where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
      await app("update cuentas set resumen_previo = true, resumen_alta = now() where id = $1", [id]);
      await app("insert into cuenta_eventos (cuenta_id, tipo) values ($1, 'resumen_activado'), ($1, 'resumen_desactivado')", [id]);
      await expect(app("insert into cuenta_eventos (cuenta_id, tipo) values ($1, 'otro')", [id])).rejects.toMatchObject({ code: "23514" });
    });

    it("un resumen nace reservado, se resuelve una sola vez y lo enviado no cambia; uno por cuenta y día", async () => {
      const id = await cuenta(`b.${randomUUID()}@example.org`);
      await expect(
        app("insert into resumen_envios (cuenta_id, dia, estado, desde, hasta, alertas) values ($1, '2040-01-01', 'enviado', now() - interval '1 day', now(), 1)", [id]),
      ).rejects.toMatchObject({ code: "42501" });
      await app("insert into resumen_envios (cuenta_id, dia, desde, hasta, alertas) values ($1, '2040-01-01', now() - interval '1 day', now(), 2)", [id]);
      await expect(
        app("insert into resumen_envios (cuenta_id, dia, desde, hasta, alertas) values ($1, '2040-01-01', now() - interval '1 day', now(), 2)", [id]),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(app("update resumen_envios set alertas = 9 where cuenta_id = $1", [id])).rejects.toMatchObject({ code: "42501" });
      await expect(app("update resumen_envios set estado = 'enviado' where cuenta_id = $1", [id])).rejects.toMatchObject({ code: "42501" });
      await app("update resumen_envios set estado = 'enviado', resuelto = now() where cuenta_id = $1", [id]);
      // Ya resuelto: la aplicación no lo ve para cambiarlo (0 filas) y el dueño choca con el disparador.
      await app("update resumen_envios set estado = 'fallido', resuelto = now() where cuenta_id = $1", [id]);
      expect((await app("select estado from resumen_envios where cuenta_id = $1", [id]))[0].estado).toBe("enviado");
      await expect(dueño("update resumen_envios set estado = 'fallido' where cuenta_id = $1", [id])).rejects.toMatchObject({ code: "OT015" });
      // Solo se purgan los de más de 90 días.
      await app("delete from resumen_envios where cuenta_id = $1", [id]);
      expect(await app("select 1 from resumen_envios where cuenta_id = $1", [id])).toHaveLength(1);
      // Ventanas imposibles.
      await expect(
        app("insert into resumen_envios (cuenta_id, dia, desde, hasta, alertas) values ($1, '2040-01-02', now(), now() - interval '1 hour', 1)", [id]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("el cupo del día solo sube; los tokens de baja tienen vigencia acotada y no se editan", async () => {
      await expect(app("insert into resumen_envios_diarios (dia, cantidad) values ('2040-02-01', 7)")).rejects.toMatchObject({ code: "42501" });
      await app("insert into resumen_envios_diarios (dia, cantidad) values ('2040-02-01', 1)");
      await app("update resumen_envios_diarios set cantidad = 4 where dia = '2040-02-01'");
      await expect(app("update resumen_envios_diarios set cantidad = 2 where dia = '2040-02-01'")).rejects.toMatchObject({ code: "OT010" });
      await expect(app("delete from resumen_envios_diarios where dia = '2040-02-01'")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("delete from resumen_envios_diarios where dia = '2040-02-01'")).rejects.toMatchObject({ code: "OT001" });
      const id = await cuenta(`c.${randomUUID()}@example.org`);
      await expect(
        app("insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ($1, $2, now(), now() + interval '90 days')", [hashToken(generarToken()), id]),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|23514)$/) });
      await expect(
        app("insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ('no-es-un-hash', $1, now(), now() + interval '1 day')", [id]),
      ).rejects.toMatchObject({ code: "23514" });
      const h = hashToken(generarToken());
      await app("insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ($1, $2, now(), now() + interval '60 days')", [h, id]);
      await expect(app("update resumen_bajas set vence = now() + interval '1 day' where token_hash = $1", [h])).rejects.toMatchObject({ code: "42501" });
    });

    it("ninguna tabla del resumen guarda el contenido del correo, el correo de la cuenta ni el token", async () => {
      const columnas = await dueño(
        `select table_name as tabla, column_name as columna from information_schema.columns
          where table_schema = 'public' and table_name in ('resumen_envios', 'resumen_envios_diarios', 'resumen_bajas')
          order by table_name, ordinal_position`,
      );
      expect(columnas.map((c) => `${c.tabla}.${c.columna}`)).toEqual([
        "resumen_bajas.token_hash",
        "resumen_bajas.cuenta_id",
        "resumen_bajas.emitido",
        "resumen_bajas.vence",
        "resumen_envios.cuenta_id",
        "resumen_envios.dia",
        "resumen_envios.estado",
        "resumen_envios.desde",
        "resumen_envios.hasta",
        "resumen_envios.alertas",
        "resumen_envios.reservado",
        "resumen_envios.resuelto",
        "resumen_envios_diarios.dia",
        "resumen_envios_diarios.cantidad",
        "resumen_envios_diarios.actualizado",
      ]);
    });
  });

  describe("la corrida, de punta a punta", () => {
    const correos: Correo[] = [];
    const correr = (tope = 30) =>
      correrResumen({
        almacen: crearAlmacenResumenPostgres(base!.app),
        turno: crearTurnoPostgres(base!.app, "resumen"),
        enviar: async (c) => {
          correos.push(c);
        },
        descifrarCorreo: (s) => cifrador.descifrarCorreo(s.correoCifrado, s.correoIndice),
        urlSitio: "https://oteaustral.com",
        topeDiario: tope,
        registrar: () => {},
      });

    it("cada cuenta que lo pidió recibe uno con las alertas reales publicadas en sus temas, una sola vez al día aunque corra dos veces a la vez", async () => {
      const sufijo = randomUUID().slice(0, 8);
      const ana = `ana.${sufijo}@example.org`;
      const beto = `beto.${sufijo}@example.org`;
      const caro = `caro.${sufijo}@example.org`;
      await cuenta(ana, { temas: ["cobre"] });
      await cuenta(beto, { temas: [] });
      await cuenta(caro, { resumen: false, temas: ["cobre"] });
      const cobre = await alerta("cobre");
      const energia = await alerta("energia", { horas: 5 });
      const deEjemplo = await alerta("cobre", { ejemplo: true });
      const borrador = await alerta("cobre", { estado: "borrador" });
      const retractada = await alerta("cobre", { estado: "retractada" });
      const vieja = await alerta("cobre", { horas: 24 * 10 });

      const [r1, r2] = await Promise.all([correr(), correr()]);
      // Dos corridas a la vez: una toma el turno y la otra sale «omitida».
      expect([r1.resultado, r2.resultado].sort()).toEqual(["ok", "omitida"]);
      const para = (c: string) => correos.filter((x) => x.para === c);
      expect(para(ana)).toHaveLength(1);
      expect(para(beto)).toHaveLength(1);
      expect(para(caro)).toHaveLength(0);
      expect(para(ana)[0].texto).toContain(`Evento ${cobre} (prueba)`);
      expect(para(ana)[0].texto).not.toContain(energia);
      // `bcch` es primaria en el registro: la confianza la calcula el código, desde las fuentes de la base.
      expect(para(ana)[0].texto).toContain(`Cobre · confianza alta · Evento ${cobre}`);
      expect(para(beto)[0].texto).toMatch(new RegExp(`${cobre}[\\s\\S]*${energia}`));
      for (const c of [...para(ana), ...para(beto)]) {
        for (const nunca of [deEjemplo, borrador, retractada, vieja, "Escenario ficticio", "example.org/prueba"]) expect(c.texto).not.toContain(nunca);
      }

      // Otra corrida el mismo día no envía nada.
      const antes = correos.length;
      expect((await correr()).enviados).toBe(0);
      expect(correos).toHaveLength(antes);

      // Lo que queda en la base: el resumen enviado, el cupo, la corrida y solo el hash de cada token de baja.
      const enviados = await dueño(
        "select e.estado, e.alertas from resumen_envios e join cuentas c on c.id = e.cuenta_id where c.correo_indice = any($1::text[]) order by e.alertas",
        [[ana, beto].map((c) => cifrador.indiceCorreo(c))],
      );
      expect(enviados).toEqual([
        { estado: "enviado", alertas: 1 },
        { estado: "enviado", alertas: 2 },
      ]);
      const token = /\/api\/resumen\/baja\?t=([A-Za-z0-9_-]{43})/.exec(para(ana)[0].texto)![1];
      expect(await dueño("select 1 from resumen_bajas where token_hash = $1", [hashToken(token)])).toHaveLength(1);
      expect(await dueño("select 1 from resumen_bajas where token_hash = $1", [token])).toHaveLength(0);
      // (Las cuentas de las pruebas de arriba también lo pidieron y siguen todos los temas: también recibieron el suyo.)
      const ok = [r1, r2].find((r) => r.resultado === "ok")!;
      expect(ok.enviados).toBeGreaterThanOrEqual(2);
      const [corrida] = await dueño("select feeds, nuevos, fallos, resultado from ingesta_corridas where tarea = 'resumen' and resultado = 'ok' order by orden limit 1");
      expect(corrida).toEqual({ feeds: ok.cuentas, nuevos: ok.enviados, fallos: 0, resultado: "ok" });
    });

    it("la reserva es atómica: con el cupo justo, diez a la vez dan exactamente el cupo, y repetir el día no lo gasta", async () => {
      const almacen = crearAlmacenResumenPostgres(base!.app);
      const ahora = new Date("2041-03-10T12:00:00.000Z");
      const ids = await Promise.all(Array.from({ length: 10 }, (_, i) => cuenta(`cupo.${i}.${randomUUID()}@example.org`)));
      const reserva = (cuentaId: string, tope = 3) =>
        almacen.reservar({
          cuentaId,
          desde: new Date(ahora.getTime() - 3_600_000),
          hasta: ahora,
          alertas: 1,
          tokenHash: hashToken(generarToken()),
          vence: new Date(ahora.getTime() + 30 * 86_400_000),
          tope,
          ahora,
        });
      const resultados = await Promise.all(ids.map((id) => reserva(id)));
      expect(resultados.filter((r) => r === "ok")).toHaveLength(3);
      expect(resultados.filter((r) => r === "sin_cupo")).toHaveLength(7);
      const [dia] = await dueño("select cantidad from resumen_envios_diarios where dia = '2041-03-10'");
      expect(dia.cantidad).toBe(3);
      // La misma cuenta otra vez ese día: «ya enviado», y el cupo no se toca (la transacción se deshace).
      const conCupo = ids[resultados.indexOf("ok")];
      expect(await reserva(conCupo, 99)).toBe("ya_enviado");
      expect((await dueño("select cantidad from resumen_envios_diarios where dia = '2041-03-10'"))[0].cantidad).toBe(3);
    });

    it("la baja de un clic apaga el resumen, deja la actividad, borra todos los tokens de la cuenta y no sirve dos veces", async () => {
      const almacen = crearAlmacenResumenPostgres(base!.app);
      const id = await cuenta(`baja.${randomUUID()}@example.org`, { temas: ["cobre"] });
      const tokens = [generarToken(), generarToken()];
      for (const t of tokens) {
        await app("insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ($1, $2, now(), now() + interval '60 days')", [hashToken(t), id]);
      }
      const vencido = generarToken();
      await dueño("insert into resumen_bajas (token_hash, cuenta_id, emitido, vence) values ($1, $2, now() - interval '61 days', now() - interval '1 day')", [
        hashToken(vencido),
        id,
      ]);
      expect(await darDeBaja(vencido, almacen)).toBe("enlace_invalido");
      expect(await darDeBaja(tokens[0], almacen)).toBe("baja");
      const [c] = await dueño("select resumen_previo, resumen_alta, temas from cuentas where id = $1", [id]);
      expect(c).toEqual({ resumen_previo: false, resumen_alta: null, temas: ["cobre"] });
      expect((await dueño("select tipo from cuenta_eventos where cuenta_id = $1", [id])).map((e) => e.tipo)).toEqual(["resumen_desactivado"]);
      expect(await dueño("select 1 from resumen_bajas where cuenta_id = $1", [id])).toHaveLength(0);
      expect(await darDeBaja(tokens[0], almacen)).toBe("enlace_invalido");
      expect(await darDeBaja(tokens[1], almacen)).toBe("enlace_invalido");
    });
  });
});
