/**
 * Proveedor de IA de mentira para las pruebas: responde lo que se le indica, sin red ni costo, y anota las
 * solicitudes que recibe. No lo importa código de producción.
 */
import { ErrorProveedor, type EventoModelo, type MotivoFin, type Proveedor, type SolicitudModelo, type Uso } from "./proveedor";

export type GuionProveedor = {
  fragmentos?: string[];
  motivo?: MotivoFin;
  uso?: Uso;
  /** Falla antes de escribir nada. */
  error?: ErrorProveedor;
  /** Falla después de escribir los fragmentos. */
  errorAlFinal?: ErrorProveedor;
  /** No responde hasta que se cancela la señal. */
  colgar?: boolean;
};

export function crearProveedorGuion(guion: GuionProveedor | ((n: number, s: SolicitudModelo) => GuionProveedor)) {
  const llamadas: SolicitudModelo[] = [];
  let terminadas = 0;
  let canceladas = 0;
  const proveedor: Proveedor = {
    nombre: "guion",
    async *generar(solicitud): AsyncGenerator<EventoModelo> {
      const n = llamadas.push(solicitud) - 1;
      const g = typeof guion === "function" ? guion(n, solicitud) : guion;
      try {
        if (g.colgar) {
          await new Promise<void>((resolver) => {
            if (solicitud.senal.aborted) resolver();
            solicitud.senal.addEventListener("abort", () => resolver(), { once: true });
          });
          throw new ErrorProveedor("abortado");
        }
        if (g.error) throw g.error;
        for (const texto of g.fragmentos ?? []) {
          if (solicitud.senal.aborted) throw new ErrorProveedor("abortado");
          yield { tipo: "texto", texto };
        }
        if (g.errorAlFinal) throw g.errorAlFinal;
        yield { tipo: "fin", motivo: g.motivo ?? "completo", uso: g.uso ?? { entrada: 800, salida: 120 } };
        terminadas += 1;
      } finally {
        if (solicitud.senal.aborted) canceladas += 1;
      }
    },
  };
  return {
    proveedor,
    llamadas,
    /** Cuántas generaciones llegaron hasta el final. */
    get terminadas() {
      return terminadas;
    },
    /** Cuántas terminaron con la señal cancelada (el servicio siempre la cancela al acabar). */
    get canceladas() {
      return canceladas;
    },
  };
}
