import { AlertAuditSchema, type AlertAudit } from "./schemas";

/**
 * Registro de auditoría de solo agregar, en memoria. No expone métodos para
 * editar ni borrar, y las filas que entrega están congeladas.
 *
 * Es el modelo de referencia en memoria. La versión persistente es la tabla
 * `alerta_auditoria` (`src/lib/alertas/repositorio.ts`, migración 0001): mantiene
 * el mismo contrato y además lo bloquea en la base de datos, con permisos solo de
 * INSERT/SELECT y un disparador que rechaza UPDATE y DELETE.
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
