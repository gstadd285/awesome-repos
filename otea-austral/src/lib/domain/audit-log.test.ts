import { describe, expect, it } from "vitest";
import { AppendOnlyAuditLog } from "./audit-log";
import type { AlertAudit } from "./schemas";

const fila: AlertAudit = {
  id: "au1",
  alert_id: "a1",
  accion: "creada",
  actor: "editor",
  fecha: "2026-10-08T10:00:00Z",
  nota: "",
};

describe("AppendOnlyAuditLog", () => {
  it("solo expone agregar y listar", () => {
    const log = new AppendOnlyAuditLog();
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(log)).filter(
      (m) => m !== "constructor",
    );
    expect(metodos.sort()).toEqual(["append", "list"]);
  });

  it("entrega filas congeladas que no se pueden editar", () => {
    const log = new AppendOnlyAuditLog();
    const guardada = log.append(fila);
    expect(Object.isFrozen(guardada)).toBe(true);
    expect(() => {
      (guardada as AlertAudit).nota = "reescrita";
    }).toThrow(TypeError);
    expect(log.list()[0].nota).toBe("");
  });

  it("no permite borrar ni reordenar filas a través de list()", () => {
    const log = new AppendOnlyAuditLog();
    log.append(fila);
    const filas = log.list() as AlertAudit[];
    expect(() => filas.pop()).toThrow(TypeError);
    expect(() => filas.splice(0, 1)).toThrow(TypeError);
    expect(log.list()).toHaveLength(1);
  });

  it("no se ve afectado si se modifica el objeto original después de agregarlo", () => {
    const log = new AppendOnlyAuditLog();
    const original = { ...fila };
    log.append(original);
    original.nota = "cambiada";
    expect(log.list()[0].nota).toBe("");
  });

  it("rechaza ids repetidos para no sobrescribir filas", () => {
    const log = new AppendOnlyAuditLog();
    log.append(fila);
    expect(() => log.append({ ...fila, accion: "aprobada" })).toThrow();
    expect(log.list()).toHaveLength(1);
  });

  it("valida cada fila (sin datos personales)", () => {
    const log = new AppendOnlyAuditLog();
    expect(() => log.append({ ...fila, actor: "persona@correo.cl" })).toThrow();
  });

  it("filtra por alerta manteniendo el orden de inserción", () => {
    const log = new AppendOnlyAuditLog();
    log.append(fila);
    log.append({ ...fila, id: "au2", alert_id: "a2" });
    log.append({ ...fila, id: "au3", accion: "aprobada" });
    expect(log.list("a1").map((f) => f.id)).toEqual(["au1", "au3"]);
  });
});
