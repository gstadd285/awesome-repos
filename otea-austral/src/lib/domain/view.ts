import { acotarConfianza, calcularConfianza, calcularNivelVerificacion } from "./rules";
import type {
  Alert,
  AlertRow,
  AlertSource,
  Confianza,
  Correction,
  NivelVerificacion,
  Source,
  TipoFuente,
} from "./schemas";

export type FuenteVista = {
  organismo: string;
  nombre_fuente: string;
  tipo: TipoFuente;
  titulo: string;
  url: string;
  fecha_publicacion: string;
  identificador?: string;
};

export type FilaVista = AlertRow & { confianza_mostrada: Confianza };

/** Lo que necesita `AlertCard`: la alerta con su respaldo ya calculado. */
export type AlertView = Omit<Alert, "filas"> & {
  confianza: Confianza;
  nivel_verificacion: NivelVerificacion;
  filas: FilaVista[];
  fuentes: FuenteVista[];
  /** Ordenadas de la más antigua a la más reciente. */
  correcciones: Correction[];
};

/**
 * Une la alerta con sus fuentes y correcciones y calcula la confianza.
 * Lanza si una fuente enlazada no está en el registro: son datos corruptos.
 */
export function construirVista(
  alerta: Alert,
  enlaces: readonly AlertSource[],
  registro: readonly Source[],
  correcciones: readonly Correction[] = [],
): AlertView {
  const porId = new Map(registro.map((s) => [s.id, s]));
  const fuentes: FuenteVista[] = enlaces
    .filter((e) => e.alert_id === alerta.id)
    .map((e) => {
      const fuente = porId.get(e.source_id);
      if (!fuente) {
        throw new Error(`La fuente ${e.source_id} no está en el registro`);
      }
      return {
        organismo: fuente.organismo,
        nombre_fuente: fuente.nombre,
        tipo: fuente.tipo,
        titulo: e.titulo_documento,
        url: e.url,
        fecha_publicacion: e.fecha_publicacion,
        identificador: e.identificador,
      };
    });

  const confianza = calcularConfianza(fuentes);
  return {
    ...alerta,
    confianza,
    nivel_verificacion: calcularNivelVerificacion(fuentes),
    filas: alerta.filas.map((f) => ({
      ...f,
      confianza_mostrada: acotarConfianza(f.confianza, confianza),
    })),
    fuentes,
    correcciones: correcciones
      .filter((c) => c.alert_id === alerta.id)
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha)),
  };
}
