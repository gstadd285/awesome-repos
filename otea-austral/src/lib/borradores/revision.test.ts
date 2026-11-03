import { describe, expect, it } from "vitest";
import type { BorradorModelo } from "./esquema";
import {
  cifrasSinRespaldo,
  lenguajeDeRecomendacion,
  problemaDeForma,
  REINTENTABLES,
  revisarBorrador,
  tieneMarcadorCondicional,
  type ContextoRevision,
} from "./revision";

// DATOS DE PRUEBA: textos sintéticos, organismos «(ejemplo)».
const DOCUMENTO =
  "El Consejo del Banco de prueba (ejemplo) acordó mantener la tasa en 5,25 % y señaló que la inflación subyacente bajó durante el trimestre.";

const CTX: ContextoRevision = {
  tema: "divisas",
  fuentes: [{ tipo: "primaria", organismo: "Banco de prueba (ejemplo)" }],
  respaldo: `[1] Banco de prueba (ejemplo) · fuente primaria · 2026-10-24 · Decisión de tasa de prueba (ejemplo)\n${DOCUMENTO}`,
  textos: [DOCUMENTO],
  ahora: "2026-10-25T12:00:00.000Z",
};

const BUENO: BorradorModelo = {
  evento: "El banco de prueba mantiene su tasa de referencia",
  resumen:
    "La autoridad monetaria de prueba dejó la tasa sin cambios en 5,25 % y apuntó a una inflación de fondo más baja. Podría importar a quienes siguen el peso.",
  filas: [
    { sector: "Bancos locales", direccion: "condicionado", condicion: "Si la tasa sigue sin cambios, los márgenes podrían mantenerse." },
    { sector: "Importadores", direccion: "gana", condicion: "Cuando el peso se aprecia, sus costos podrían bajar." },
  ],
  impacto_sugerido: "medio",
  dudas: ["Comprobar en el comunicado la fecha de la próxima reunión."],
};

const revisar = (b: unknown, ctx: Partial<ContextoRevision> = {}) =>
  revisarBorrador(typeof b === "string" ? b : JSON.stringify(b), { ...CTX, ...ctx });

describe("revisión de la salida (§4.5), en orden", () => {
  it("un borrador bueno pasa, sin banderas y con las dos cifras de la anticopia", () => {
    const r = revisar(BUENO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.banderas).toEqual([]);
    expect(r.borrador).toEqual(BUENO);
    expect(r.copia.tramo).toBeLessThan(10);
  });

  describe("1 · Zod estricto", () => {
    it("JSON roto", () => {
      expect(revisar('{"evento": "Corta')).toEqual({ ok: false, motivo: "json" });
      expect(revisar("")).toEqual({ ok: false, motivo: "json" });
      expect(revisar("Claro, aquí va el borrador: {}")).toEqual({ ok: false, motivo: "json" });
    });

    it("un campo de más (confianza, tema, fuentes, enlaces, estado) se rechaza: la confianza se calcula, no la fija el modelo", () => {
      for (const extra of [{ confianza: "alta" }, { tema: "cobre" }, { fuentes: [] }, { enlaces: ["https://example.org"] }, { estado: "publicada" }]) {
        expect(revisar({ ...BUENO, ...extra }), JSON.stringify(extra)).toEqual({ ok: false, motivo: "esquema" });
      }
      expect(revisar({ ...BUENO, filas: [{ ...BUENO.filas[0], confianza: "alta" }] })).toEqual({ ok: false, motivo: "esquema" });
    });

    it("impacto alto no existe para el modelo; faltan campos o sobran filas", () => {
      expect(revisar({ ...BUENO, impacto_sugerido: "alto" })).toEqual({ ok: false, motivo: "esquema" });
      const sinDudas: Partial<BorradorModelo> = { ...BUENO };
      delete sinDudas.dudas;
      expect(revisar(sinDudas)).toEqual({ ok: false, motivo: "esquema" });
      expect(revisar({ ...BUENO, filas: [] })).toEqual({ ok: false, motivo: "esquema" });
    });

    it("demasiado largo", () => {
      expect(revisar({ ...BUENO, resumen: "a ".repeat(400) })).toEqual({ ok: false, motivo: "largo" });
      expect(revisar({ ...BUENO, filas: Array(7).fill(BUENO.filas[0]) })).toEqual({ ok: false, motivo: "largo" });
      expect(revisar({ ...BUENO, dudas: ["a", "b", "c", "d"] })).toEqual({ ok: false, motivo: "largo" });
    });
  });

  describe("2 · Forma", () => {
    it.each([
      ["una URL", "Más detalles en https://ejemplo.cl/nota.", "enlace"],
      ["un dominio", "Más detalles en bancodeprueba.cl.", "enlace"],
      ["www", "Visita www.prueba para más.", "enlace"],
      ["un correo", "Escribe a prensa@prueba.org para más.", "enlace"],
      ["HTML", "La tasa <b>se mantiene</b>.", "formato"],
      ["una entidad HTML", "La tasa &amp; el peso.", "formato"],
      ["Markdown", "La tasa **se mantiene**.", "formato"],
      ["un enlace Markdown", "Ver [la nota](algo).", "formato"],
    ])("rechaza %s", (_n, resumen, motivo) => {
      expect(revisar({ ...BUENO, resumen })).toEqual({ ok: false, motivo });
    });

    it("una condición sin marcador condicional deja la bandera, no rechaza", () => {
      const r = revisar({ ...BUENO, filas: [{ sector: "Bancos locales", direccion: "gana", condicion: "Los márgenes suben con la tasa." }] });
      expect(r.ok && r.banderas).toEqual(["sin_condicion"]);
      expect(tieneMarcadorCondicional("En caso de alza, podría…")).toBe(true);
      expect(tieneMarcadorCondicional("Mientras dure la decisión")).toBe(true);
      expect(tieneMarcadorCondicional("Los márgenes suben.")).toBe(false);
    });
  });

  describe("3 · Política de lenguaje (sin recomendaciones)", () => {
    it.each([
      "Recomendamos comprar acciones de bancos.",
      "Te recomendamos esperar.",
      "Es recomendable vender ahora.",
      "Aconsejamos a los inversionistas salir.",
      "Sugerimos tomar posiciones en cobre.",
      "Conviene comprar dólares hoy.",
      "Es un buen momento para invertir en bonos.",
      "Una clara señal de compra para el sector.",
      "El precio objetivo de la acción es mayor.",
      "Compre cobre antes de la reunión.",
      "Hay que vender antes del anuncio.",
      "Rentabilidad garantizada para los bancos.",
      "Invierte ya en el sector.",
    ])("rechaza «%s»", (resumen) => {
      expect(revisar({ ...BUENO, resumen })).toEqual({ ok: false, motivo: "lenguaje" });
    });

    it("también en las filas y en las dudas", () => {
      expect(revisar({ ...BUENO, filas: [{ ...BUENO.filas[0], condicion: "Si sube, conviene vender." }] })).toEqual({ ok: false, motivo: "lenguaje" });
      expect(revisar({ ...BUENO, dudas: ["Recomendamos comprar si se confirma."] })).toEqual({ ok: false, motivo: "lenguaje" });
    });

    it("el lenguaje de efectos posibles pasa", () => {
      for (const t of ["Los bancos podrían ganar si la tasa se mantiene.", "El Tesoro debe vender bonos para financiarse, según el texto."]) {
        expect(lenguajeDeRecomendacion(t), t).toBe(false);
      }
    });
  });

  describe("4 · Cifras", () => {
    it("una cifra de dos o más dígitos que no está en las fuentes se rechaza", () => {
      expect(revisar({ ...BUENO, resumen: "La tasa quedó en 5,50 % según el banco de prueba." })).toEqual({ ok: false, motivo: "cifra" });
      expect(revisar({ ...BUENO, resumen: "La próxima reunión es el 2027-01-28." })).toEqual({ ok: false, motivo: "cifra" });
    });

    it("las del documento, los títulos y las fechas pasan; los dígitos sueltos no cuentan", () => {
      expect(cifrasSinRespaldo("Quedó en 5,25 % el 24 de octubre de 2026, con 3 votos.", CTX.respaldo)).toEqual([]);
      expect(cifrasSinRespaldo("Subió a 6,1 %.", CTX.respaldo)).toEqual(["6,1"]);
    });
  });

  describe("5 · Anticopia", () => {
    it("copiar el documento se rechaza y admite reintento", () => {
      const r = revisar({ ...BUENO, resumen: DOCUMENTO });
      expect(r).toMatchObject({ ok: false, motivo: "copia" });
      expect(REINTENTABLES.has("copia")).toBe(true);
    });

    it("sin texto de las fuentes la anticopia da cero", () => {
      const r = revisar({ ...BUENO, resumen: DOCUMENTO }, { textos: [] });
      expect(r.ok && r.copia).toEqual({ tramo: 0, proporcion: 0 });
    });
  });

  describe("6 · Reglas de negocio", () => {
    it("la confianza es la calculada con las fuentes; un tema sin respaldo deja «baja»", async () => {
      const { aContenidoAlerta } = await import("./esquema");
      expect(aContenidoAlerta(BUENO, "divisas", "alta").filas.every((f) => f.confianza === "alta")).toBe(true);
      expect(revisar(BUENO, { fuentes: [] }).ok).toBe(true); // sin fuentes: confianza baja, la alerta igual es válida como borrador
    });
  });

  it("el orden importa: la forma va antes que el lenguaje, y el lenguaje antes que las cifras", () => {
    expect(revisar({ ...BUENO, resumen: "Recomendamos comprar en https://x.cl a 99 %." })).toEqual({ ok: false, motivo: "enlace" });
    expect(revisar({ ...BUENO, resumen: "Recomendamos comprar a 99 %." })).toEqual({ ok: false, motivo: "lenguaje" });
  });

  it("solo JSON, esquema, largo y copia admiten el reintento", () => {
    expect([...REINTENTABLES].sort()).toEqual(["copia", "esquema", "json", "largo"]);
  });

  it("problemaDeForma no confunde una sigla con un dominio", () => {
    expect(problemaDeForma("Según EE.UU. y la U.E., la tasa 4.5 se mantiene.")).toBeUndefined();
  });
});
