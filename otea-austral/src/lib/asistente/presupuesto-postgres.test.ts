import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HAY_BASE_DE_PRUEBAS, crearBaseDePrueba, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import type { Consultor } from "@/lib/db/cliente";
import { crearPresupuestoPostgres } from "./presupuesto-postgres";

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("presupuesto del asistente en Postgres (migración 0005)", () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await crearBaseDePrueba();
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  afterEach(async () => {
    await base.propietario.consulta("alter table asistente_uso disable trigger asistente_uso_sin_borrar");
    await base.propietario.consulta("delete from asistente_uso");
    await base.propietario.consulta("alter table asistente_uso enable trigger asistente_uso_sin_borrar");
  });

  const hoy = async () =>
    (await base.propietario.consulta("select dia::text as dia, llamadas, costo_micros::text as costo from asistente_uso"))[0];

  it("reserva hasta el tope del día y rechaza lo que ya no alcanza", async () => {
    const p = crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 });
    expect(await p.reservar(400)).toBe(true);
    expect(await p.reservar(400)).toBe(true);
    expect(await p.reservar(400)).toBe(false);
    expect(await p.reservar(200)).toBe(true);
    expect(await p.reservar(1)).toBe(false);
    expect(await hoy()).toMatchObject({ llamadas: 3, costo: "1000" });
  });

  it("también cuenta las llamadas", async () => {
    const p = crearPresupuestoPostgres(base.app, { micros: 1_000_000, llamadas: 2 });
    expect([await p.reservar(1), await p.reservar(1), await p.reservar(1)]).toEqual([true, true, false]);
  });

  it("ajustar cambia la reserva por lo realmente gastado, sin pasar de cero", async () => {
    const p = crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 });
    await p.reservar(900);
    await p.ajustar(900, 100);
    expect(await hoy()).toMatchObject({ costo: "100" });
    await p.ajustar(100, 450);
    expect(await hoy()).toMatchObject({ costo: "450" });
    await p.ajustar(450, -5_000);
    expect(await hoy()).toMatchObject({ costo: "0" });
    expect(await p.reservar(1_000)).toBe(true);
  });

  it("varias instancias a la vez no pueden pasarse del tope", async () => {
    const instancias = [0, 1, 2].map(() => crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 1_000 }));
    const resultados = await Promise.all(Array.from({ length: 60 }, (_, i) => instancias[i % 3].reservar(100)));
    expect(resultados.filter(Boolean)).toHaveLength(10);
    expect(await hoy()).toMatchObject({ llamadas: 10, costo: "1000" });
  });

  it("una llamada que sola pasa el tope no crea ni la fila del día", async () => {
    const p = crearPresupuestoPostgres(base.app, { micros: 500, llamadas: 100 });
    expect(await p.reservar(501)).toBe(false);
    expect(await hoy()).toBeUndefined();
  });

  it("el día siguiente empieza de cero y el anterior queda como historial", async () => {
    await base.propietario.consulta(
      "insert into asistente_uso (dia, llamadas, costo_micros) values ((now() at time zone 'America/Santiago')::date - 1, 1, 999999999)",
    );
    const p = crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 });
    expect(await p.reservar(1_000)).toBe(true);
    expect(await base.propietario.consulta("select count(*)::int as n from asistente_uso")).toEqual([{ n: 2 }]);
  });

  it("si la base falla no se reserva (y por tanto no se gasta) y queda un aviso sin detalles", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const caida: Consultor = {
        consulta: async () => {
          throw Object.assign(new Error("connection refused: postgres://usuario:clave@host/bd"), { code: "ECONNREFUSED" });
        },
      };
      const p = crearPresupuestoPostgres(caida, { micros: 1_000, llamadas: 100 });
      expect(await p.reservar(10)).toBe(false);
      await expect(p.ajustar(10, 5)).resolves.toBeUndefined();
      const lineas = aviso.mock.calls.map((c) => String(c[0]));
      expect(lineas.length).toBe(2);
      expect(lineas.join("\n")).toContain("fallo_servicio");
      expect(lineas.join("\n")).not.toMatch(/clave|postgres:\/\//);
    } finally {
      aviso.mockRestore();
    }
  });

  it("no acepta cifras raras", async () => {
    const p = crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 });
    expect(await p.reservar(Number.NaN)).toBe(false);
    expect(await p.reservar(-1)).toBe(false);
    expect(await p.reservar(1.5)).toBe(false);
    expect(await hoy()).toBeUndefined();
  });

  describe("la aplicación no puede deshacer el historial ni saltarse las reglas", () => {
    const app = (sql: string, parametros: unknown[] = []) => base.app.consulta(sql, parametros);

    it("no borra ni vacía", async () => {
      await crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 }).reservar(1);
      await expect(app("delete from asistente_uso")).rejects.toMatchObject({ code: "42501" });
      await expect(app("truncate asistente_uso")).rejects.toMatchObject({ code: "42501" });
      // Aunque un permiso de más se lo diera, la seguridad por fila no tiene política de borrado: no afecta nada…
      await base.propietario.consulta("grant delete on asistente_uso to otea_app");
      try {
        expect(await app("delete from asistente_uso returning 1")).toEqual([]);
        expect(await hoy()).toBeDefined();
      } finally {
        await base.propietario.consulta("revoke delete on asistente_uso from otea_app");
      }
      // …y ni siquiera el dueño, que no pasa por esa seguridad, puede borrar: lo rechaza el disparador.
      await expect(base.propietario.consulta("delete from asistente_uso")).rejects.toMatchObject({ code: "OT001" });
    });

    it("no cambia el día ni baja el número de llamadas", async () => {
      await crearPresupuestoPostgres(base.app, { micros: 1_000, llamadas: 100 }).reservar(1);
      await expect(app("update asistente_uso set dia = dia - 1")).rejects.toMatchObject({ code: "42501" });
      await expect(app("update asistente_uso set llamadas = 0")).rejects.toMatchObject({ code: "OT009" });
      await expect(app("update asistente_uso set costo_micros = -5")).rejects.toMatchObject({ code: "23514" });
    });

    it("solo crea el día con su primera llamada", async () => {
      await expect(
        app("insert into asistente_uso (dia, llamadas, costo_micros) values ('2020-01-01', 5, 0)"),
      ).rejects.toMatchObject({ code: "42501" });
      expect(await app("insert into asistente_uso (dia, llamadas, costo_micros) values ('2020-01-01', 1, 0) returning 1")).toHaveLength(1);
    });
  });
});
