import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearServicioLista, sha256Hex } from "./service";
import { crearStorePostgres } from "./store-postgres";
import type { WaitlistStore } from "./store";

const T0 = new Date("2026-10-09T12:00:00Z");
const en = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const MINUTO = 60_000;

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("lista de espera en Postgres", () => {
  let base: BaseDePrueba;
  let store: WaitlistStore;

  beforeAll(async () => {
    base = await crearBaseDePrueba();
    store = crearStorePostgres(base.app);
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  const inscripcion = (correo: string, tokenHash: string, ms = 0) => ({
    correo,
    tokenHash,
    ahora: en(ms),
    versionConsentimiento: "v-prueba",
  });

  it("inserta, no repite y renueva el enlace después de la espera", async () => {
    const correo = "renueva@example.org";
    expect(await store.guardar(inscripcion(correo, "a".repeat(64)), en(-10 * MINUTO))).toBe("nuevo");
    expect(await store.guardar(inscripcion(correo, "b".repeat(64), MINUTO), en(-9 * MINUTO))).toBe("existente");
    expect(await store.guardar(inscripcion(correo, "c".repeat(64), 11 * MINUTO), en(MINUTO))).toBe("renovado");

    const [fila] = await base.app.consulta<{ token_hash: string; creado: Date }>(
      "select token_hash, creado from lista_espera where correo = $1",
      [correo],
    );
    expect(fila.token_hash).toBe("c".repeat(64));
    expect(fila.creado.toISOString()).toBe(en(0));
  });

  it("confirma una vez, dentro del plazo, y descarta el token", async () => {
    const correo = "confirma@example.org";
    await store.guardar(inscripcion(correo, "d".repeat(64)), en(0));
    expect(await store.confirmar("d".repeat(64), en(MINUTO), en(MINUTO))).toBe(false); // vencido
    expect(await store.confirmar("d".repeat(64), en(MINUTO), en(-MINUTO))).toBe(true);
    expect(await store.confirmar("d".repeat(64), en(MINUTO), en(-MINUTO))).toBe(false);
    const [fila] = await base.app.consulta("select token_hash, confirmado from lista_espera where correo = $1", [correo]);
    expect(fila.token_hash).toBeNull();
    expect(fila.confirmado).not.toBeNull();
    // Una confirmada no se renueva.
    expect(await store.guardar(inscripcion(correo, "e".repeat(64), 60 * MINUTO), en(59 * MINUTO))).toBe("existente");
  });

  it("tras un envío fallido permite renovar enseguida y el enlace anterior no vale", async () => {
    const correo = "falla@example.org";
    await store.guardar(inscripcion(correo, "f".repeat(64)), en(-10 * MINUTO));
    await store.liberarReenvio(correo);
    expect(await store.confirmar("f".repeat(64), en(0), en(-MINUTO))).toBe(false);
    expect(await store.guardar(inscripcion(correo, "1".repeat(64), 1000), en(-10 * MINUTO))).toBe("renovado");
  });

  it("purga solo las pendientes vencidas", async () => {
    await store.guardar(inscripcion("vieja@example.org", "2".repeat(64), -40 * 24 * 60 * MINUTO), en(0));
    const borradas = await store.purgarPendientes(en(-30 * 24 * 60 * MINUTO));
    expect(borradas).toBe(1);
    const correos = (await base.app.consulta<{ correo: string }>("select correo from lista_espera")).map((f) => f.correo);
    expect(correos).not.toContain("vieja@example.org");
    expect(correos).toContain("confirma@example.org");
  });

  it("con el servicio completo guarda el hash, nunca el token", async () => {
    let enviado = "";
    const servicio = crearServicioLista({
      modo: "abierta",
      store,
      enviarConfirmacion: async (_correo, token) => {
        enviado = token;
      },
      duracionMinimaMs: 0,
    });
    await servicio.registrar({ correo: "Hash@Example.org", acepta: "on", sitio_web: "" }, "cliente");
    const [fila] = await base.app.consulta<Record<string, unknown>>(
      "select * from lista_espera where correo = 'hash@example.org'",
    );
    expect(fila.token_hash).toBe(await sha256Hex(enviado));
    expect(JSON.stringify(fila)).not.toContain(enviado);
    expect(Object.keys(fila).sort()).toEqual(
      ["confirmado", "correo", "creado", "token_emitido", "token_hash", "version_consentimiento"].sort(),
    );
    expect(await servicio.confirmar(enviado)).toBe(true);
  });

  it("cuenta los enlaces enviados desde un instante, sin los liberados", async () => {
    // Fechas lejanas: otras pruebas de este archivo usan la hora real.
    const LEJOS = 100 * 24 * 60 * MINUTO;
    await store.guardar(inscripcion("cuenta1@example.org", "7".repeat(64), LEJOS), en(LEJOS - MINUTO));
    await store.guardar(inscripcion("cuenta2@example.org", "8".repeat(64), LEJOS + MINUTO), en(LEJOS - MINUTO));
    expect(await store.enviosDesde(en(LEJOS))).toBe(2);
    expect(await store.enviosDesde(en(LEJOS + 1))).toBe(1);
    expect(await store.enviosDesde(en(LEJOS + 2 * MINUTO))).toBe(0);
    await store.liberarReenvio("cuenta2@example.org");
    expect(await store.enviosDesde(en(LEJOS))).toBe(1);
  });
});
