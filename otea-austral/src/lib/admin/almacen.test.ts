import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import { crearAlmacenSesiones, type AlmacenSesiones } from "./almacen";

const HORA = 3_600_000;
const sid = (n: number) => `${String(n).padStart(2, "0")}${"A".repeat(20)}`;

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("sesiones del panel en Postgres", () => {
  let base: BaseDePrueba;
  let almacen: AlmacenSesiones;

  beforeAll(async () => {
    base = await crearBaseDePrueba();
    almacen = crearAlmacenSesiones(base.app);
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  it("una sesión nueva está vigente; una desconocida, no", async () => {
    await almacen.crear(sid(1), new Date(Date.now() + HORA));
    expect(await almacen.vigente(sid(1))).toBe(true);
    expect(await almacen.vigente(sid(99))).toBe(false);
  });

  it("revocar la deja sin efecto de inmediato, y repetirlo no falla", async () => {
    await almacen.crear(sid(2), new Date(Date.now() + HORA));
    await almacen.revocar(sid(2));
    expect(await almacen.vigente(sid(2))).toBe(false);
    await expect(almacen.revocar(sid(2))).resolves.toBeUndefined();
    await expect(almacen.revocar(sid(98))).resolves.toBeUndefined();
  });

  it("una sesión vencida deja de valer", async () => {
    // La base exige expira > creada: se crea por el dueño con fechas pasadas.
    await base.propietario.consulta(
      "insert into admin_sesiones (sid, creada, expira) values ($1, now() - interval '9 hours', now() - interval '1 hour')",
      [sid(3)],
    );
    expect(await almacen.vigente(sid(3))).toBe(false);
  });

  it("la base rechaza sesiones de más de 12 horas o con identificador inválido", async () => {
    await expect(almacen.crear(sid(4), new Date(Date.now() + 13 * HORA))).rejects.toMatchObject({ code: "23514" });
    await expect(almacen.crear("corto", new Date(Date.now() + HORA))).rejects.toMatchObject({ code: "23514" });
  });

  it("un código TOTP solo se gasta una vez", async () => {
    expect(await almacen.gastarCodigo(59_000_001)).toBe(true);
    expect(await almacen.gastarCodigo(59_000_001)).toBe(false);
    expect(await almacen.gastarCodigo(59_000_002)).toBe(true);
  });

  it("dos intentos simultáneos con el mismo código: solo uno entra", async () => {
    const resultados = await Promise.all(Array.from({ length: 8 }, () => almacen.gastarCodigo(59_000_100)));
    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it("la aplicación no puede borrar, reabrir ni alargar sesiones, ni tocar los códigos gastados", async () => {
    await almacen.crear(sid(5), new Date(Date.now() + HORA));
    await almacen.revocar(sid(5));
    // Sin permiso de DELETE ni de UPDATE sobre las demás columnas.
    await expect(base.app.consulta("delete from admin_sesiones where sid = $1", [sid(5)])).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      base.app.consulta("update admin_sesiones set expira = expira + interval '1 hour' where sid = $1", [sid(5)]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(base.app.consulta("update admin_codigos_usados set paso = 1")).rejects.toMatchObject({ code: "42501" });
    await expect(base.app.consulta("delete from admin_codigos_usados")).rejects.toMatchObject({ code: "42501" });
    // Aun con permisos (el dueño), un disparador impide reabrir una sesión revocada o borrarla.
    await expect(
      base.propietario.consulta("update admin_sesiones set revocada = null where sid = $1", [sid(5)]),
    ).rejects.toMatchObject({ code: "OT007" });
    await expect(base.propietario.consulta("delete from admin_sesiones where sid = $1", [sid(5)])).rejects.toMatchObject({
      code: "OT001",
    });
    await expect(base.propietario.consulta("delete from admin_codigos_usados")).rejects.toMatchObject({ code: "OT001" });
    expect(await almacen.vigente(sid(5))).toBe(false);
  });
});
