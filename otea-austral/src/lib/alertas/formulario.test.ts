import { describe, expect, it } from "vitest";
import { etiquetarMotivo, leerContenido, leerEnlace, leerNuevaAlerta, leerVersion } from "./formulario";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [k, v] of Object.entries(campos)) datos.set(k, v);
  return datos;
}

const BASE = {
  tema: "cobre",
  evento: " Evento ",
  resumen: "Resumen",
  impacto: "medio",
  fila_0_sector: "Mineras",
  fila_0_direccion: "gana",
  fila_0_condicion: "Si sube el precio",
  fila_0_confianza: "media",
};

describe("formularios del panel", () => {
  it("lee el contenido, recorta espacios y omite filas vacías", () => {
    const r = leerContenido(formulario({ ...BASE, fila_3_sector: "", fila_3_condicion: "" }));
    expect(r).toEqual({
      ok: true,
      valor: {
        tema: "cobre",
        evento: "Evento",
        resumen: "Resumen",
        impacto: "medio",
        filas: [{ sector: "Mineras", direccion: "gana", condicion: "Si sube el precio", confianza: "media" }],
      },
    });
  });

  it("explica en español qué falta", () => {
    const r = leerContenido(formulario({ ...BASE, tema: "otro", fila_0_sector: "", fila_0_condicion: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivos[0]).toMatch(/^Tema: Opción inválida/);
      expect(r.motivos).toContain("Filas: agrega al menos una fila con sector y condición.");
    }
  });

  it("solo marca como ejemplo con la casilla", () => {
    const sin = leerNuevaAlerta(formulario({ ...BASE, revisor: "Equipo" }));
    const con = leerNuevaAlerta(formulario({ ...BASE, revisor: "Equipo", es_ejemplo: "on" }));
    expect(sin.ok && sin.valor.es_ejemplo).toBe(false);
    expect(con.ok && con.valor.es_ejemplo).toBe(true);
  });

  it("lee el enlace sin identificador vacío", () => {
    expect(leerEnlace(formulario({ source_id: "bcch", url: " https://x.cl/ ", identificador: "" }))).toEqual({
      source_id: "bcch",
      titulo_documento: "",
      url: "https://x.cl/",
      fecha_publicacion: "",
      fecha_consulta: "",
    });
  });

  it("una versión ausente o rara nunca coincide", () => {
    for (const v of ["", "abc", "-1", "1.5"]) expect(leerVersion(formulario({ version: v }))).toBe(0);
    expect(leerVersion(formulario({ version: "3" }))).toBe(3);
  });

  it("etiqueta los motivos del dominio", () => {
    expect(etiquetarMotivo("filas.1.condicion: Demasiado pequeño")).toBe("Fila 2 · condición: Demasiado pequeño");
    expect(etiquetarMotivo("url: URL inválida")).toBe("Enlace: URL inválida");
    expect(etiquetarMotivo("Sin prefijo.")).toBe("Sin prefijo.");
  });
});
