import { z } from "zod";
import type { ContenidoEditable, Resultado } from "@/lib/domain/rules";
import { Confianza, Direccion, Impacto, Tema } from "@/lib/domain/schemas";
import type { DatosEnlace, DatosNuevaAlerta } from "./repositorio";

/**
 * Lectura de los formularios del panel. Aquí solo se normaliza y se valida
 * la forma; los largos, los formatos y las reglas los aplica el dominio.
 */
export const MAX_FILAS = 8;

function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

const ETIQUETAS: Record<string, string> = {
  tema: "Tema",
  evento: "Evento",
  resumen: "Resumen",
  impacto: "Impacto",
  revisor: "Revisado por",
  filas: "Filas",
  sector: "sector",
  direccion: "dirección",
  condicion: "condición",
  confianza: "confianza",
  source_id: "Fuente",
  titulo_documento: "Título del documento",
  url: "Enlace",
  fecha_publicacion: "Fecha de publicación",
  fecha_consulta: "Fecha de consulta",
  identificador: "Identificador",
  texto_publico: "Texto público",
};

/** `filas.0.condicion: …` → `Fila 1 · condición: …`. */
export function etiquetarMotivo(motivo: string): string {
  return motivo.replace(/^([a-z_]+(?:\.\d+\.[a-z_]+)?):/, (_, ruta: string) => {
    const fila = /^filas\.(\d+)\.([a-z_]+)$/.exec(ruta);
    if (fila) return `Fila ${Number(fila[1]) + 1} · ${ETIQUETAS[fila[2]] ?? fila[2]}:`;
    return `${ETIQUETAS[ruta] ?? ruta}:`;
  });
}

function motivos(error: z.ZodError): string[] {
  return error.issues.map((i) => etiquetarMotivo(`${i.path.join(".")}: ${i.message}`));
}

const ContenidoFormulario = z.object({
  tema: Tema,
  evento: z.string(),
  resumen: z.string(),
  impacto: Impacto,
  filas: z
    .array(z.object({ sector: z.string(), direccion: Direccion, condicion: z.string(), confianza: Confianza }))
    .min(1, "agrega al menos una fila con sector y condición."),
});

export function leerContenido(datos: FormData): Resultado<ContenidoEditable> {
  const filas = [];
  for (let i = 0; i < MAX_FILAS; i++) {
    const sector = texto(datos, `fila_${i}_sector`);
    const condicion = texto(datos, `fila_${i}_condicion`);
    if (!sector && !condicion) continue;
    filas.push({
      sector,
      direccion: texto(datos, `fila_${i}_direccion`),
      condicion,
      confianza: texto(datos, `fila_${i}_confianza`),
    });
  }
  const r = ContenidoFormulario.safeParse({
    tema: texto(datos, "tema"),
    evento: texto(datos, "evento"),
    resumen: texto(datos, "resumen"),
    impacto: texto(datos, "impacto"),
    filas,
  });
  return r.success ? { ok: true, valor: r.data } : { ok: false, motivos: motivos(r.error) };
}

export function leerNuevaAlerta(datos: FormData): Resultado<DatosNuevaAlerta> {
  const contenido = leerContenido(datos);
  if (!contenido.ok) return contenido;
  return {
    ok: true,
    valor: {
      ...contenido.valor,
      revisor: texto(datos, "revisor"),
      es_ejemplo: datos.get("es_ejemplo") === "on",
    },
  };
}

export function leerEnlace(datos: FormData): DatosEnlace {
  const identificador = texto(datos, "identificador");
  return {
    source_id: texto(datos, "source_id"),
    titulo_documento: texto(datos, "titulo_documento"),
    url: texto(datos, "url"),
    fecha_publicacion: texto(datos, "fecha_publicacion"),
    fecha_consulta: texto(datos, "fecha_consulta"),
    ...(identificador ? { identificador } : {}),
  };
}

/** Versión que vio quien edita (0 si falta: nunca coincide). */
export function leerVersion(datos: FormData): number {
  const n = Number(texto(datos, "version"));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function leerTexto(datos: FormData, campo: string): string {
  return texto(datos, campo);
}
