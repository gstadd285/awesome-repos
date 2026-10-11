import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearCifradorCorreo } from "./cifrado";
import { crearServicioLista, sha256Hex } from "./service";
import { crearStorePostgres } from "./store-postgres";
import type { WaitlistStore } from "./store";

const T0 = new Date("2026-10-09T12:00:00Z");
const en = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const MINUTO = 60_000;
const SECRETO = "t".repeat(43);

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("lista de espera en Postgres", () => {
  let base: BaseDePrueba;
  let store: WaitlistStore;
  const cifrador = crearCifradorCorreo(SECRETO);
  const indice = (correo: string) => cifrador.indice(correo);

  beforeAll(async () => {
    base = await crearBaseDePrueba();
    store = crearStorePostgres(base.app, cifrador);
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
      "select token_hash, creado from lista_espera where correo_indice = $1",
      [indice(correo)],
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
    const [fila] = await base.app.consulta("select token_hash, confirmado from lista_espera where correo_indice = $1", [
      indice(correo),
    ]);
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
    const indices = (await base.app.consulta<{ correo_indice: string }>("select correo_indice from lista_espera")).map(
      (f) => f.correo_indice,
    );
    expect(indices).not.toContain(indice("vieja@example.org"));
    expect(indices).toContain(indice("confirma@example.org"));
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
    // El dueño ve la fila completa; la aplicación no puede leer `correo_cifrado`.
    const [fila] = await base.propietario.consulta<Record<string, unknown>>(
      "select * from lista_espera where correo_indice = $1",
      [indice("hash@example.org")],
    );
    expect(fila.token_hash).toBe(await sha256Hex(enviado));
    expect(JSON.stringify(fila)).not.toContain(enviado);
    expect(Object.keys(fila).sort()).toEqual(
      ["confirmado", "correo_cifrado", "correo_indice", "creado", "token_emitido", "token_hash", "version_consentimiento"].sort(),
    );
    expect(await servicio.confirmar(enviado)).toBe("confirmada");
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

  describe("el correo está cifrado en reposo (control 5)", () => {
    const correo = "cifrado.reposo@example.org";

    it("no queda en claro en ninguna columna de la fila", async () => {
      await store.guardar(inscripcion(correo, "3".repeat(64), 5 * MINUTO), en(0));
      const [fila] = await base.propietario.consulta<Record<string, unknown>>(
        "select * from lista_espera where correo_indice = $1",
        [indice(correo)],
      );
      const texto = JSON.stringify(fila);
      for (const parte of ["cifrado.reposo", "example.org", "@"]) expect(texto, parte).not.toContain(parte);
      expect(fila.correo_cifrado).toMatch(/^v1\.[A-Za-z0-9_-]{39,397}$/);
      expect(fila.correo_indice).toMatch(/^[0-9a-f]{64}$/);
    });

    it("el dueño, con la clave, lo descifra; con otra clave o desde otra fila, no", async () => {
      const [fila] = await base.propietario.consulta<{ correo_indice: string; correo_cifrado: string }>(
        "select correo_indice, correo_cifrado from lista_espera where correo_indice = $1",
        [indice(correo)],
      );
      expect(cifrador.descifrar(fila.correo_cifrado, fila.correo_indice)).toBe(correo);
      expect(() => crearCifradorCorreo("o".repeat(43)).descifrar(fila.correo_cifrado, fila.correo_indice)).toThrow();
      // El texto cifrado copiado a otra fila no se descifra: el índice de la fila es parte de lo autenticado.
      expect(() => cifrador.descifrar(fila.correo_cifrado, indice("otra@example.org"))).toThrow();
    });

    it("renovar el enlace no cambia el texto cifrado ni el índice de la inscripción", async () => {
      const leer = async () =>
        (await base.propietario.consulta<{ correo_cifrado: string }>(
          "select correo_cifrado from lista_espera where correo_indice = $1",
          [indice(correo)],
        ))[0].correo_cifrado;
      const antes = await leer();
      expect(await store.guardar(inscripcion(correo, "4".repeat(64), 60 * MINUTO), en(59 * MINUTO))).toBe("renovado");
      expect(await leer()).toBe(antes);
    });

    it("la aplicación escribe correos cifrados pero no puede leerlos ni cambiarlos", async () => {
      for (const sql of [
        "select correo_cifrado from lista_espera",
        "select * from lista_espera",
        "select correo_cifrado from lista_espera where correo_indice = 'x'",
        "update lista_espera set correo_cifrado = 'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'",
        "update lista_espera set correo_indice = repeat('0', 64)",
      ]) {
        await expect(base.app.consulta(sql), sql).rejects.toMatchObject({ code: "42501" });
      }
      // Lo que sí puede: contar, buscar por índice y manejar los tokens.
      expect(await base.app.consulta("select correo_indice, confirmado from lista_espera where correo_indice = $1", [indice(correo)])).toHaveLength(1);
    });

    it("la base rechaza guardar algo que no tenga forma de correo cifrado (nunca un correo en claro por error)", async () => {
      const insertar = (cifrado: string, idx = indice("forma@example.org")) =>
        base.propietario.consulta(
          `insert into lista_espera (correo_indice, correo_cifrado, token_hash, token_emitido, creado, version_consentimiento)
           values ($1, $2, $3, now(), now(), 'v')`,
          [idx, cifrado, "9".repeat(64)],
        );
      await expect(insertar("persona@example.org")).rejects.toMatchObject({ code: "23514" });
      await expect(insertar("v1.corto")).rejects.toMatchObject({ code: "23514" });
      await expect(insertar("v2." + "A".repeat(50))).rejects.toMatchObject({ code: "23514" });
      await expect(insertar("v1." + "A".repeat(50), "persona@example.org")).rejects.toMatchObject({ code: "23514" });
    });
  });
});
