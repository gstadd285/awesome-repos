import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { crearPresupuestoPostgres } from "@/lib/asistente/presupuesto-postgres";
import type { BaseDeDatos, Consultor, Fila } from "@/lib/db/cliente";
import { HAY_BASE_DE_PRUEBAS, crearBaseDePrueba, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearPresupuestoBorradoresPostgres, TECHO_MENSUAL_MICROS } from "./presupuesto-postgres";

/**
 * Tope mensual de los borradores (migración 0010) y tope acumulado de toda la IA con Postgres real. Las reservas son las
 * mismas que haría la redacción; nada llama a un modelo.
 */
describe.skipIf(!HAY_BASE_DE_PRUEBAS)("presupuesto de los borradores en Postgres (migración 0010)", () => {
  let base: BaseDePrueba;
  const dueño = (sql: string, parametros: unknown[] = []) => base.propietario.consulta(sql, parametros);
  const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);

  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 60_000);
  afterAll(async () => {
    await base?.cerrar();
  });
  afterEach(async () => {
    for (const tabla of ["borradores_uso", "asistente_uso"]) {
      await dueño(`alter table ${tabla} disable trigger ${tabla}_sin_borrar`);
      await dueño(`delete from ${tabla}`);
      await dueño(`alter table ${tabla} enable trigger ${tabla}_sin_borrar`);
    }
  });

  const mes = async () =>
    (await dueño("select mes::text as mes, llamadas, costo_micros::text as costo, tope_micros::text as tope from borradores_uso"))[0];
  const presupuesto = (micros = 1_000, llamadas = 100, totalMicros?: number) =>
    crearPresupuestoBorradoresPostgres(base.app, { micros, llamadas, totalMicros });

  it("reserva hasta el tope del mes de Chile y rechaza lo que ya no alcanza", async () => {
    const p = presupuesto();
    expect([await p.reservar(400), await p.reservar(400), await p.reservar(400), await p.reservar(200), await p.reservar(1)]).toEqual([
      true,
      true,
      false,
      true,
      false,
    ]);
    const fila = await mes();
    expect(fila).toMatchObject({ llamadas: 3, costo: "1000", tope: "1000" });
    expect(fila.mes).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("también cuenta las llamadas del mes", async () => {
    const p = presupuesto(1_000_000, 2);
    expect([await p.reservar(1), await p.reservar(1), await p.reservar(1)]).toEqual([true, true, false]);
  });

  it("ajusta la reserva al uso real, sin pasar de cero", async () => {
    const p = presupuesto();
    await p.reservar(900);
    await p.ajustar(900, 120);
    expect(await mes()).toMatchObject({ costo: "120" });
    await p.ajustar(120, -5_000);
    expect(await mes()).toMatchObject({ costo: "0" });
  });

  it("60 reservas simultáneas (de tres instancias) no pasan el tope", async () => {
    const instancias = [0, 1, 2].map(() => presupuesto(1_000, 1_000));
    const r = await Promise.all(Array.from({ length: 60 }, (_, i) => instancias[i % 3].reservar(100)));
    expect(r.filter(Boolean)).toHaveLength(10);
    expect(await mes()).toMatchObject({ llamadas: 10, costo: "1000" });
  });

  it("el techo de US$ 5 vale aunque se configure un tope mayor (y la base tampoco lo admite)", async () => {
    const p = presupuesto(9_000_000, 1_000);
    expect(await p.reservar(TECHO_MENSUAL_MICROS + 1)).toBe(false);
    expect(await p.reservar(TECHO_MENSUAL_MICROS)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
    expect(await mes()).toMatchObject({ tope: "5000000" });
    await expect(
      app("insert into borradores_uso (mes, llamadas, costo_micros, tope_micros) values ('2020-01-01', 1, 0, 9000000)"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("con el tope agotado no hay reserva: la redacción no llama", async () => {
    const p = presupuesto(500);
    expect(await p.reservar(500)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
    expect(await p.reservar(0)).toBe(true); // una reserva de cero no gasta, pero sí cuenta la llamada
  });

  it("el mes siguiente empieza de cero y el anterior queda como historial", async () => {
    await dueño(
      `insert into borradores_uso (mes, llamadas, costo_micros, tope_micros)
       values (date_trunc('month', now() at time zone 'America/Santiago')::date - interval '1 month', 1, 999999, 1000000)`,
    );
    expect(await presupuesto().reservar(1_000)).toBe(true);
    expect((await dueño("select count(*)::int as n from borradores_uso"))[0].n).toBe(2);
  });

  describe("tope acumulado de toda la IA (IA_TOPE_TOTAL_USD)", () => {
    it("suma lo del asistente y lo de los borradores, desde el primer día", async () => {
      await dueño("insert into asistente_uso (dia, llamadas, costo_micros) values ('2026-01-05', 3, 600), ('2026-02-05', 1, 200)");
      await dueño("insert into borradores_uso (mes, llamadas, costo_micros, tope_micros) values ('2026-03-01', 2, 100, 5000000)");
      const p = presupuesto(10_000, 100, 1_000);
      expect(await p.reservar(101)).toBe(false); // 900 + 101 > 1000
      expect(await p.reservar(100)).toBe(true);
      expect(await p.reservar(1)).toBe(false);
    });

    it("el asistente también lo respeta, y los dos a la vez no pasan el tope", async () => {
      const borradores = presupuesto(100_000, 1_000, 2_000);
      const asistente = crearPresupuestoPostgres(base.app, { micros: 100_000, llamadas: 1_000 }, { totalMicros: 2_000 });
      const r = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? borradores : asistente).reservar(100)));
      expect(r.filter(Boolean)).toHaveLength(20);
      const [{ total }] = await dueño(
        "select (select coalesce(sum(costo_micros), 0) from asistente_uso) + (select coalesce(sum(costo_micros), 0) from borradores_uso) as total",
      );
      expect(Number(total)).toBe(2_000);
    });

    it("sin tope total, el asistente reserva como siempre (una sentencia, sin candado)", async () => {
      const consultas: string[] = [];
      const espia: Consultor = {
        consulta: <T extends Fila>(t: string, p?: readonly unknown[]) => {
          consultas.push(t);
          return base.app.consulta<T>(t, p);
        },
      };
      expect(await crearPresupuestoPostgres(espia, { micros: 1_000, llamadas: 10 }).reservar(10)).toBe(true);
      expect(consultas).toHaveLength(1);
      expect(consultas[0]).not.toMatch(/pg_advisory/);
    });

    it("con tope total y sin transacciones (o un tope inválido), no se reserva", async () => {
      const sinTx = { consulta: base.app.consulta.bind(base.app) };
      expect(await crearPresupuestoPostgres(sinTx, { micros: 1_000, llamadas: 10 }, { totalMicros: 5_000 }).reservar(10)).toBe(false);
      expect(await presupuesto(1_000, 10, 0).reservar(1)).toBe(false);
    });
  });

  it("si la base falla no se reserva (y por tanto no se llama) y queda un aviso sin detalles", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fallar = async () => {
        throw Object.assign(new Error("connection refused: postgres://usuario:clave@host/bd"), { code: "ECONNREFUSED" });
      };
      const caida: BaseDeDatos = { consulta: fallar, transaccion: fallar, cerrar: async () => {} };
      const p = crearPresupuestoBorradoresPostgres(caida, { micros: 1_000, llamadas: 10 });
      expect(await p.reservar(10)).toBe(false);
      await expect(p.ajustar(10, 5)).resolves.toBeUndefined();
      const lineas = aviso.mock.calls.map((c) => String(c[0])).join("\n");
      expect(lineas).toContain('"tipo":"fallo_servicio"');
      expect(lineas).not.toMatch(/clave|postgres:\/\//);
    } finally {
      aviso.mockRestore();
    }
  });

  it("no acepta cifras raras", async () => {
    const p = presupuesto();
    for (const m of [Number.NaN, -1, 1.5, Infinity]) expect(await p.reservar(m), String(m)).toBe(false);
    expect(await mes()).toBeUndefined();
  });

  describe("la aplicación no puede deshacer el historial", () => {
    it("no borra ni vacía, no cambia el mes ni baja las llamadas, y un mes nace con su primera llamada", async () => {
      await presupuesto().reservar(1);
      await expect(app("delete from borradores_uso")).rejects.toMatchObject({ code: "42501" });
      await expect(app("truncate borradores_uso")).rejects.toMatchObject({ code: "42501" });
      await expect(dueño("delete from borradores_uso")).rejects.toMatchObject({ code: "OT001" });
      await expect(app("update borradores_uso set mes = '2020-01-01'")).rejects.toMatchObject({ code: "42501" });
      await expect(app("update borradores_uso set llamadas = 0")).rejects.toMatchObject({ code: "OT014" });
      await expect(
        app("insert into borradores_uso (mes, llamadas, costo_micros, tope_micros) values ('2020-02-01', 7, 0, 100)"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        app("insert into borradores_uso (mes, llamadas, costo_micros, tope_micros) values ('2020-02-15', 1, 0, 100)"),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});
