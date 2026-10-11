import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aCsv, leerCorreos, recifrar } from "../../../scripts/lib/lista.mjs";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearCifradorCorreo } from "./cifrado";
import { crearStorePostgres } from "./store-postgres";

const VIEJO = "v".repeat(43);
const NUEVO = "n".repeat(43);
const T0 = new Date("2026-10-09T12:00:00Z").toISOString();
const LEJOS = new Date("2036-01-01T00:00:00Z").toISOString();

describe("exportación a CSV", () => {
  it("encabezado, comillas y fecha", () => {
    const csv = aCsv([
      { correo: "persona@correo.cl", confirmado: new Date("2026-10-09T12:00:00Z") },
      { correo: 'raro,"nombre"@correo.cl', confirmado: null },
    ]);
    expect(csv.split("\n")).toEqual([
      "correo,confirmado",
      "persona@correo.cl,2026-10-09T12:00:00.000Z",
      '"raro,""nombre""@correo.cl",',
    ]);
  });

  it("neutraliza las fórmulas de planilla (un correo válido puede empezar con + o -)", () => {
    const filas = ["=cmd@correo.cl", "+1@correo.cl", "-1@correo.cl", "@x@correo.cl"].map((correo) => ({ correo, confirmado: null }));
    for (const linea of aCsv(filas).split("\n").slice(1)) expect(linea).toMatch(/^'[=+\-@]/);
    expect(aCsv([{ correo: "normal@correo.cl", confirmado: null }])).toContain("\nnormal@correo.cl,");
  });
});

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("exportar y rotar el secreto de la lista (Postgres)", () => {
  let base: BaseDePrueba;
  let dueño: pg.Client;
  const cifradorViejo = crearCifradorCorreo(VIEJO);
  const hash = (n: number) => String(n).padStart(64, "a");

  beforeAll(async () => {
    base = await crearBaseDePrueba();
    dueño = new pg.Client({ connectionString: base.urlPropietario });
    await dueño.connect();
    const store = crearStorePostgres(base.app, cifradorViejo);
    const alta = (correo: string, n: number) =>
      store.guardar({ correo, tokenHash: hash(n), ahora: T0, versionConsentimiento: "v-prueba" }, LEJOS);
    await alta("uno@example.org", 1);
    await alta("dos@example.org", 2);
    await alta("tres@example.org", 3);
    // Confirman uno y dos; tres queda pendiente.
    await store.confirmar(hash(1), T0, "2000-01-01T00:00:00Z");
    await store.confirmar(hash(2), T0, "2000-01-01T00:00:00Z");
  }, 60_000);

  afterAll(async () => {
    await dueño?.end();
    await base?.cerrar();
  });

  it("exporta los confirmados, descifrados y sin los pendientes", async () => {
    const filas = await leerCorreos(dueño, VIEJO);
    expect(filas.map((f: { correo: string }) => f.correo).sort()).toEqual(["dos@example.org", "uno@example.org"]);
    expect(filas.every((f: { confirmado: Date | null }) => f.confirmado instanceof Date)).toBe(true);
  });

  it("con --pendientes incluye a todos", async () => {
    const filas = await leerCorreos(dueño, VIEJO, { incluirPendientes: true });
    expect(filas).toHaveLength(3);
  });

  it("con otro secreto no entrega nada (ni una lista a medias)", async () => {
    await expect(leerCorreos(dueño, NUEVO)).rejects.toThrow(/clave equivocada o dato alterado/);
  });

  it("el ensayo de rotación comprueba el secreto anterior y no cambia nada", async () => {
    const antes = await dueño.query("select correo_indice, correo_cifrado from lista_espera order by 1");
    expect(await recifrar(dueño, VIEJO, NUEVO)).toEqual({ filas: 3, aplicado: false });
    expect((await dueño.query("select correo_indice, correo_cifrado from lista_espera order by 1")).rows).toEqual(antes.rows);
  });

  it("no rota con un secreto anterior equivocado, ni con el mismo secreto, y deja todo como estaba", async () => {
    const antes = await dueño.query("select correo_indice, correo_cifrado from lista_espera order by 1");
    await expect(recifrar(dueño, "x".repeat(43), NUEVO, { aplicar: true })).rejects.toThrow(/clave equivocada/);
    await expect(recifrar(dueño, VIEJO, VIEJO, { aplicar: true })).rejects.toThrow(/igual al anterior/);
    expect((await dueño.query("select correo_indice, correo_cifrado from lista_espera order by 1")).rows).toEqual(antes.rows);
    // La conexión quedó usable (la transacción se deshizo).
    expect((await dueño.query("select 1 as ok")).rows).toEqual([{ ok: 1 }]);
  });

  it("al aplicar, todo queda cifrado con el secreto nuevo y el anterior ya no sirve", async () => {
    expect(await recifrar(dueño, VIEJO, NUEVO, { aplicar: true })).toEqual({ filas: 3, aplicado: true });
    const nuevo = crearCifradorCorreo(NUEVO);
    // Los índices cambiaron: cada fila se identifica ahora con el índice del secreto nuevo.
    const { rows } = await dueño.query("select correo_indice from lista_espera");
    expect(rows.map((r) => r.correo_indice).sort()).toEqual(
      ["uno@example.org", "dos@example.org", "tres@example.org"].map((c) => nuevo.indice(c)).sort(),
    );
    expect((await leerCorreos(dueño, NUEVO, { incluirPendientes: true })).map((f: { correo: string }) => f.correo).sort()).toEqual([
      "dos@example.org",
      "tres@example.org",
      "uno@example.org",
    ]);
    await expect(leerCorreos(dueño, VIEJO)).rejects.toThrow();
  });

  it("la aplicación con el secreto nuevo reconoce a quien ya estaba inscrito (no duplica)", async () => {
    const store = crearStorePostgres(base.app, crearCifradorCorreo(NUEVO));
    const r = await store.guardar({ correo: "uno@example.org", tokenHash: hash(9), ahora: T0, versionConsentimiento: "v" }, LEJOS);
    expect(r).toBe("existente"); // ya confirmado
    const pendiente = await store.guardar({ correo: "tres@example.org", tokenHash: hash(8), ahora: LEJOS, versionConsentimiento: "v" }, LEJOS);
    expect(pendiente).toBe("renovado"); // el pendiente se reconoce y se renueva, no se duplica
    expect((await dueño.query("select count(*)::int as n from lista_espera")).rows).toEqual([{ n: 3 }]);
  });
});

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("migración 0004 sobre datos que ya existían", () => {
  it("se detiene si hay correos en claro, y migra cuando la tabla está vacía", async () => {
    // Hasta la 0003: la tabla todavía guarda el correo en claro.
    const base = await crearBaseDePrueba({ migraciones: 3 });
    try {
      await base.propietario.consulta(
        `insert into lista_espera (correo, token_hash, token_emitido, creado, version_consentimiento)
         values ('enclaro@example.org', $1, now(), now(), 'v')`,
        ["c".repeat(64)],
      );
      await expect(base.migrarTodo()).rejects.toMatchObject({ code: "OT008", message: expect.stringContaining("en claro") });
      // La transacción se deshizo: nada cambió y la migración no quedó registrada.
      expect(await base.propietario.consulta("select correo from lista_espera")).toEqual([{ correo: "enclaro@example.org" }]);
      expect(await base.propietario.consulta("select nombre from otea_migraciones where nombre like '0004%'")).toEqual([]);

      await base.propietario.consulta("delete from lista_espera");
      expect(await base.migrarTodo()).toEqual(["0004_correos_cifrados.sql"]);
      const columnas = await base.propietario.consulta<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'lista_espera' order by 1",
      );
      expect(columnas.map((c) => c.column_name)).toEqual(
        ["confirmado", "correo_cifrado", "correo_indice", "creado", "token_emitido", "token_hash", "version_consentimiento"],
      );
    } finally {
      await base.cerrar();
    }
  }, 60_000);
});
