import { describe, expect, it } from "vitest";
import { crearAlmacenMemoria, diaDeChile } from "./almacen-memoria";
import { pruebasDelContrato } from "./contrato-almacen";

pruebasDelContrato("memoria", async () => ({ almacen: crearAlmacenMemoria() }));

describe("almacén en memoria", () => {
  it("entrega copias: cambiar lo que devuelve no altera lo guardado", async () => {
    const almacen = crearAlmacenMemoria();
    const lectura = await almacen.emitirAlta({
      correoIndice: "a".repeat(64),
      correoCifrado: "v1.x",
      tokenHash: "b".repeat(64),
      versionTextos: "v1",
      ahora: "2026-10-11T12:00:00.000Z",
      reenviarSiAnteriorA: "2026-10-11T11:50:00.000Z",
    });
    expect(lectura).toBe("nuevo");
    const r = await almacen.activarAlta({
      tokenHash: "b".repeat(64),
      vigenteDesde: "2026-10-10T12:00:00.000Z",
      claveHash: "scrypt$1$1$1$a$b",
      ahora: "2026-10-11T12:01:00.000Z",
      sesion: { tokenHash: "c".repeat(64), expira: "2026-11-10T12:00:00.000Z", dispositivo: null },
    });
    expect(typeof r).toBe("object");
    const cuenta = (await almacen.buscarPorCorreo("a".repeat(64)))!;
    cuenta.temas.push("cobre");
    cuenta.nombre = "Intruso";
    expect((await almacen.buscarPorCorreo("a".repeat(64)))).toMatchObject({ nombre: null, temas: [] });
    expect(almacen.cuentasGuardadas()).toHaveLength(1);
  });

  it("el día de la cuota es el de Chile", () => {
    expect(diaDeChile("2040-07-10T02:30:00.000Z")).toBe("2040-07-09");
    expect(diaDeChile("2040-07-10T04:30:00.000Z")).toBe("2040-07-10");
    // Con horario de verano (UTC-3) la medianoche cae a las 03:00 UTC.
    expect(diaDeChile("2026-12-15T02:59:00.000Z")).toBe("2026-12-14");
    expect(diaDeChile("2026-12-15T03:00:00.000Z")).toBe("2026-12-15");
  });
});
