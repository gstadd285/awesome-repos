import { AlertAuditSchema, type AlertAudit } from "./schemas";

/**
 * Registro de auditoría de solo agregar, en memoria. No expone métodos para
 * editar ni borrar, y las filas que entrega están congeladas.
 *
 * La versión persistente (tercio 3) debe mantener el mismo contrato y además
 * bloquearlo en la base de datos: permisos solo de INSERT/SELECT y un
 * disparador que rechace UPDATE y DELETE.
 */
export class AppendOnlyAuditLog {
  readonly #filas: Readonly<AlertAudit>[] = [];
  readonly #ids = new Set<string>();

  append(fila: AlertAudit): Readonly<AlertAudit> {
    const validada = AlertAuditSchema.parse(fila);
    if (this.#ids.has(validada.id)) {
      throw new Error(`Ya existe una fila de auditoría con id ${validada.id}`);
    }
    const congelada = Object.freeze({ ...validada });
    this.#ids.add(congelada.id);
    this.#filas.push(congelada);
    return congelada;
  }

  /** Filas en orden de inserción, opcionalmente de una sola alerta. */
  list(alertId?: string): readonly Readonly<AlertAudit>[] {
    const filas =
      alertId === undefined ? [...this.#filas] : this.#filas.filter((f) => f.alert_id === alertId);
    return Object.freeze(filas);
  }
}
