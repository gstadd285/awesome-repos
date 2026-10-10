/**
 * DATOS DE EJEMPLO. Escenarios, organismos y documentos ficticios para la
 * portada y las pruebas. Ningún dato corresponde a un evento ni a una fuente
 * real: los enlaces apuntan a example.org (dominio reservado) y la interfaz
 * marca cada tarjeta como "Datos de ejemplo".
 */
import {
  AlertSchema,
  AlertSourceSchema,
  CorrectionSchema,
  SourceSchema,
  type Alert,
  type AlertSource,
  type Correction,
  type Source,
} from "@/lib/domain/schemas";
import { construirVista, type AlertView } from "@/lib/domain/view";

const CONDICIONES = "Datos de ejemplo: no corresponde a una fuente real.";
const REVISOR = "Equipo editorial (ejemplo)";

export const fuentesEjemplo: Source[] = [
  {
    id: "ejemplo-agencia-energia",
    nombre: "Informe de mercado petrolero (ejemplo)",
    organismo: "Agencia energética internacional (ejemplo)",
    url_base: "https://example.org/",
    tipo: "primaria",
    temas: ["energia", "geopolitica"],
    acceso: "manual",
    condiciones_reutilizacion: CONDICIONES,
    prioridad: "A",
    activa: true,
  },
  {
    id: "ejemplo-centro-estudios",
    nombre: "Observatorio de semiconductores (ejemplo)",
    organismo: "Centro de estudios sectoriales (ejemplo)",
    url_base: "https://example.org/",
    tipo: "secundaria",
    temas: ["chips", "comercio_eeuu_china"],
    acceso: "manual",
    condiciones_reutilizacion: CONDICIONES,
    prioridad: "B",
    activa: true,
  },
  {
    id: "ejemplo-agencia-noticias",
    nombre: "Cable internacional (ejemplo)",
    organismo: "Agencia de noticias internacional (ejemplo)",
    url_base: "https://example.org/",
    tipo: "prensa",
    temas: ["geopolitica", "energia"],
    acceso: "manual",
    condiciones_reutilizacion: CONDICIONES,
    prioridad: "C",
    activa: true,
  },
  {
    id: "ejemplo-diario-local",
    nombre: "Sección de minería (ejemplo)",
    organismo: "Diario económico local (ejemplo)",
    url_base: "https://example.org/",
    tipo: "prensa",
    temas: ["cobre"],
    acceso: "manual",
    condiciones_reutilizacion: CONDICIONES,
    prioridad: "C",
    activa: true,
  },
].map((s) => SourceSchema.parse(s));

export const alertasEjemplo: Alert[] = [
  {
    id: "ejemplo-ormuz",
    tema: "geopolitica",
    evento: "Tensión en el estrecho de Ormuz",
    resumen:
      "Escenario de ejemplo: un aumento de la tensión naval eleva el riesgo de interrupciones en el tránsito de crudo. El efecto en cada sector depende de cuánto dure y de la respuesta de otros productores.",
    filas: [
      {
        sector: "Productoras de crudo fuera del Golfo",
        direccion: "gana",
        condicion: "Si el tránsito se restringe por más de unos días",
        confianza: "media",
      },
      {
        sector: "Navieras de petroleros",
        direccion: "condicionado",
        condicion: "Fletes al alza, pero con más riesgo y seguros más caros",
        confianza: "media",
      },
      {
        sector: "Aerolíneas",
        direccion: "pierde",
        condicion: "Si el alza del combustible se sostiene en el tiempo",
        confianza: "alta",
      },
      {
        sector: "Importadores netos de energía",
        direccion: "pierde",
        condicion: "Si sube el costo de la energía importada",
        confianza: "media",
      },
    ],
    fecha: "2026-10-08T08:15:00-03:00",
    revisor: REVISOR,
    impacto: "alto",
    estado: "publicada",
    es_ejemplo: true,
  },
  {
    id: "ejemplo-chips",
    tema: "comercio_eeuu_china",
    evento: "Nuevas restricciones a la exportación de chips avanzados",
    resumen:
      "Escenario de ejemplo: un endurecimiento de los controles de exportación obligaría a reordenar cadenas de suministro de semiconductores.",
    filas: [
      {
        sector: "Fundiciones fuera de las zonas afectadas",
        direccion: "gana",
        condicion: "Si los clientes reubican pedidos",
        confianza: "media",
      },
      {
        sector: "Equipos de litografía",
        direccion: "pierde",
        condicion: "Si las restricciones alcanzan a sus mayores clientes",
        confianza: "media",
      },
      {
        sector: "Chips para centros de datos",
        direccion: "condicionado",
        condicion: "Según las licencias y excepciones que se otorguen",
        confianza: "baja",
      },
    ],
    fecha: "2026-10-07T18:40:00-03:00",
    revisor: REVISOR,
    impacto: "medio",
    estado: "publicada",
    es_ejemplo: true,
  },
  {
    id: "ejemplo-cobre",
    tema: "cobre",
    evento: "Paralización temporal en una gran mina de cobre",
    resumen:
      "Escenario de ejemplo: una detención no programada reduce por un tiempo la oferta de concentrado. Por ahora solo hay reportes de prensa.",
    filas: [
      {
        sector: "Otras productoras de cobre",
        direccion: "gana",
        // Declarada "alta", pero solo hay una nota de prensa: se muestra "baja".
        condicion: "Si la paralización se extiende y presiona el precio",
        confianza: "alta",
      },
      {
        sector: "Fabricantes de cables",
        direccion: "pierde",
        condicion: "Si el mayor costo del metal no se traspasa a precios",
        confianza: "baja",
      },
      {
        sector: "Peso chileno",
        direccion: "condicionado",
        condicion: "Depende de cuánto pese la menor producción frente al precio",
        confianza: "baja",
      },
    ],
    fecha: "2026-10-06T10:05:00-03:00",
    revisor: REVISOR,
    impacto: "medio",
    estado: "corregida",
    es_ejemplo: true,
  },
].map((a) => AlertSchema.parse(a));

export const enlacesEjemplo: AlertSource[] = [
  {
    alert_id: "ejemplo-ormuz",
    source_id: "ejemplo-agencia-energia",
    titulo_documento: "Nota de seguimiento del mercado de crudo (ejemplo)",
    url: "https://example.org/ejemplo/ormuz-informe",
    fecha_publicacion: "2026-10-08",
    fecha_consulta: "2026-10-08",
    identificador: "EJ-001",
  },
  {
    alert_id: "ejemplo-ormuz",
    source_id: "ejemplo-agencia-noticias",
    titulo_documento: "Reporte sobre tránsito naval en la zona (ejemplo)",
    url: "https://example.org/ejemplo/ormuz-prensa",
    fecha_publicacion: "2026-10-07",
    fecha_consulta: "2026-10-08",
  },
  {
    alert_id: "ejemplo-chips",
    source_id: "ejemplo-centro-estudios",
    titulo_documento: "Análisis de controles de exportación (ejemplo)",
    url: "https://example.org/ejemplo/chips-analisis",
    fecha_publicacion: "2026-10-07",
    fecha_consulta: "2026-10-07",
  },
  {
    alert_id: "ejemplo-cobre",
    source_id: "ejemplo-diario-local",
    titulo_documento: "Nota sobre detención de faenas (ejemplo)",
    url: "https://example.org/ejemplo/cobre-prensa",
    fecha_publicacion: "2026-10-06",
    fecha_consulta: "2026-10-06",
  },
].map((e) => AlertSourceSchema.parse(e));

export const correccionesEjemplo: Correction[] = [
  {
    id: "ejemplo-correccion-cobre",
    alert_id: "ejemplo-cobre",
    fecha: "2026-10-06T16:20:00-03:00",
    texto_publico:
      "Ejemplo de corrección: se ajustó la duración estimada de la paralización según una nota posterior del mismo medio.",
    tipo: "correccion",
  },
].map((c) => CorrectionSchema.parse(c));

export const vistasEjemplo: AlertView[] = alertasEjemplo.map((a) =>
  construirVista(a, enlacesEjemplo, fuentesEjemplo, correccionesEjemplo),
);

export function vistaEjemplo(id: string): AlertView {
  const vista = vistasEjemplo.find((v) => v.id === id);
  if (!vista) throw new Error(`No existe la alerta de ejemplo ${id}`);
  return vista;
}
