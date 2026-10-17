/**
 * Lo que el servicio necesita de un modelo de lenguaje, sin atarse a un proveedor. La implementación real
 * (`proveedor-anthropic.ts`) usa el SDK oficial; las pruebas usan un guion (`proveedor-guion.ts`).
 */

export type Uso = { entrada: number; salida: number };

/** Cómo terminó la generación. `rechazo`: el modelo se negó (clasificadores de seguridad); `limite`: se acabó `maxTokens`. */
export type MotivoFin = "completo" | "limite" | "rechazo" | "otro";

export type SolicitudModelo = {
  sistema: string;
  /** El único mensaje de la persona: contexto, preguntas anteriores y pregunta. */
  mensaje: string;
  maxTokens: number;
  senal: AbortSignal;
};

export type EventoModelo = { tipo: "texto"; texto: string } | { tipo: "fin"; motivo: MotivoFin; uso?: Uso };

export type Proveedor = {
  /** Nombre para los registros, nunca un dato de la persona. */
  readonly nombre: string;
  /** Genera la respuesta fragmento a fragmento. Lanza `ErrorProveedor` si el servicio falla. */
  generar(solicitud: SolicitudModelo): AsyncIterable<EventoModelo>;
};

/** El servicio del modelo falló (red, límite, clave, caída). El mensaje es técnico y nunca incluye texto de la persona. */
export class ErrorProveedor extends Error {
  constructor(
    /** Código técnico corto: `limite_tasa`, `autenticacion`, `solicitud`, `servidor`, `conexion`, `tiempo`… */
    readonly codigo: string,
    readonly estado?: number,
  ) {
    super(`Falló el proveedor de IA (${codigo}${estado ? ` ${estado}` : ""})`);
    this.name = "ErrorProveedor";
  }
}
