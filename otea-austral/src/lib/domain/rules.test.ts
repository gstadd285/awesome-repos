import { describe, expect, it } from "vitest";
import {
  acotarConfianza,
  aprobar,
  calcularConfianza,
  calcularNivelVerificacion,
  contarOrganismosDistintos,
  crearAlerta,
  editar,
  enviarARevision,
  motivosParaNoPublicar,
  publicar,
  retractar,
  tieneAprobacionVigente,
  type Contexto,
  type FuenteRespaldo,
  type Resultado,
} from "./rules";
import type { Alert, AlertAudit } from "./schemas";

const primaria = (organismo = "Banco Central de Chile"): FuenteRespaldo => ({
  tipo: "primaria",
  organismo,
});
const secundaria = (organismo = "Centro de estudios"): FuenteRespaldo => ({
  tipo: "secundaria",
  organismo,
});
const prensa = (organismo = "Diario A"): FuenteRespaldo => ({ tipo: "prensa", organismo });

function ctx(): Contexto {
  let n = 0;
  return { actor: "editor", fecha: "2026-10-08T10:00:00Z", generarId: () => `id-${++n}` };
}

function base(over: Partial<Alert> = {}): Alert {
  return {
    id: "a1",
    tema: "energia",
    evento: "Evento de prueba",
    resumen: "Resumen propio",
    filas: [{ sector: "Petroleras", direccion: "gana", condicion: "Si sube el crudo", confianza: "media" }],
    fecha: "2026-10-08T10:00:00Z",
    revisor: "Equipo",
    impacto: "medio",
    estado: "borrador",
    es_ejemplo: true,
    ...over,
  };
}

function sinEstado(alerta: Alert): Omit<Alert, "estado"> {
  const datos: Partial<Alert> = { ...alerta };
  delete datos.estado;
  return datos as Omit<Alert, "estado">;
}

function valor<T>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(`Se esperaba ok, motivos: ${r.motivos.join(" | ")}`);
  return r.valor;
}

function audit(accion: AlertAudit["accion"], alert_id = "a1"): AlertAudit {
  return { id: `au-${accion}-${Math.random()}`, alert_id, accion, actor: "editor", fecha: "2026-10-08T10:00:00Z", nota: "" };
}

describe("calcularConfianza", () => {
  it("sin fuentes es baja", () => {
    expect(calcularConfianza([])).toBe("baja");
  });

  it("regla 1: una fuente primaria permite alta", () => {
    expect(calcularConfianza([primaria()])).toBe("alta");
    expect(calcularConfianza([prensa(), primaria()])).toBe("alta");
  });

  it("regla 1: sin fuente primaria nunca es alta", () => {
    expect(calcularConfianza([secundaria(), secundaria("Otro"), prensa(), prensa("B")])).toBe("media");
  });

  it("regla 2: solo prensa nunca supera media, aunque haya muchas", () => {
    const muchas = ["A", "B", "C", "D", "E"].map((o) => prensa(`Diario ${o}`));
    expect(calcularConfianza(muchas)).toBe("media");
  });

  it("una sola nota de prensa, o varias del mismo medio, es baja", () => {
    expect(calcularConfianza([prensa()])).toBe("baja");
    expect(calcularConfianza([prensa("Diario A"), prensa("diario a ")])).toBe("baja");
  });

  it("una fuente secundaria da media", () => {
    expect(calcularConfianza([secundaria()])).toBe("media");
  });
});

describe("calcularNivelVerificacion", () => {
  it("cubre los cuatro niveles", () => {
    expect(calcularNivelVerificacion([])).toBe("sin_verificar");
    expect(calcularNivelVerificacion([prensa()])).toBe("una_fuente");
    expect(calcularNivelVerificacion([prensa("A"), prensa("B")])).toBe("dos_fuentes");
    expect(calcularNivelVerificacion([prensa("A"), primaria()])).toBe("fuente_oficial");
  });

  it("dos documentos del mismo organismo cuentan como una fuente", () => {
    expect(calcularNivelVerificacion([secundaria("Cochilco"), secundaria("COCHILCO")])).toBe(
      "una_fuente",
    );
  });
});

describe("contarOrganismosDistintos", () => {
  it("ignora mayúsculas, tildes y espacios", () => {
    expect(
      contarOrganismosDistintos([prensa("Comisión para el Mercado Financiero"), prensa("comision  para el mercado financiero ")]),
    ).toBe(1);
  });
});

describe("acotarConfianza", () => {
  it("la fila nunca supera la confianza de la alerta", () => {
    expect(acotarConfianza("alta", "baja")).toBe("baja");
    expect(acotarConfianza("alta", "media")).toBe("media");
    expect(acotarConfianza("baja", "alta")).toBe("baja");
    expect(acotarConfianza("media", "media")).toBe("media");
  });
});

describe("tieneAprobacionVigente", () => {
  it("requiere una aprobación posterior a la última edición", () => {
    expect(tieneAprobacionVigente("a1", [audit("creada"), audit("aprobada")])).toBe(true);
    expect(tieneAprobacionVigente("a1", [audit("creada"), audit("aprobada"), audit("editada")])).toBe(false);
    expect(tieneAprobacionVigente("a1", [audit("creada")])).toBe(false);
  });

  it("no cuenta aprobaciones de otra alerta", () => {
    expect(tieneAprobacionVigente("a1", [audit("creada"), audit("aprobada", "a2")])).toBe(false);
  });
});

describe("publicación (regla 3)", () => {
  const alta = base({ impacto: "alto", estado: "en_revision" });
  const dosOrganismos = [primaria("BCCh"), prensa("Diario A")];
  const aprobada = [audit("creada"), audit("aprobada")];

  it("impacto alto con dos organismos y aprobación se publica", () => {
    const t = valor(publicar(alta, dosOrganismos, aprobada, ctx()));
    expect(t.alerta.estado).toBe("publicada");
    expect(t.auditoria.map((f) => f.accion)).toEqual(["publicada"]);
  });

  it("impacto alto sin segunda fuente no se publica", () => {
    const r = publicar(alta, [primaria()], aprobada, ctx());
    expect(r.ok).toBe(false);
  });

  it("impacto alto con dos documentos del mismo organismo no se publica", () => {
    const r = publicar(alta, [primaria("BCCh"), secundaria("bcch")], aprobada, ctx());
    expect(r.ok).toBe(false);
  });

  it("impacto alto sin aprobación no se publica", () => {
    const motivos = motivosParaNoPublicar(alta, dosOrganismos, [audit("creada")]);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/aprobación/);
  });

  it("impacto alto editado después de aprobar necesita nueva aprobación", () => {
    const r = publicar(alta, dosOrganismos, [...aprobada, audit("editada")], ctx());
    expect(r.ok).toBe(false);
  });

  it("impacto medio con una fuente se publica sin aprobación", () => {
    expect(publicar(base(), [prensa()], [], ctx()).ok).toBe(true);
  });

  it("ninguna alerta se publica sin fuentes", () => {
    expect(publicar(base(), [], [], ctx()).ok).toBe(false);
  });

  it("no se vuelve a publicar una alerta ya publicada", () => {
    expect(publicar(base({ estado: "publicada" }), [prensa()], [], ctx()).ok).toBe(false);
  });
});

describe("ciclo de vida", () => {
  it("crear deja un borrador y una fila 'creada'", () => {
    const t = valor(crearAlerta(sinEstado(base()), ctx()));
    expect(t.alerta.estado).toBe("borrador");
    expect(t.auditoria[0]).toMatchObject({ accion: "creada", alert_id: "a1", actor: "editor" });
  });

  it("crear valida los datos", () => {
    expect(crearAlerta(sinEstado(base({ filas: [] })), ctx()).ok).toBe(false);
  });

  it("solo se aprueba una alerta en revisión", () => {
    expect(aprobar(base(), ctx()).ok).toBe(false);
    const enRevision = valor(enviarARevision(base(), ctx())).alerta;
    expect(valor(aprobar(enRevision, ctx())).auditoria[0].accion).toBe("aprobada");
  });

  it("un actor con correo hace fallar la transición: nunca llega a la auditoría", () => {
    expect(() => aprobar(base({ estado: "en_revision" }), { ...ctx(), actor: "a@b.cl" })).toThrow();
  });
});

describe("edición (regla 4)", () => {
  it("en borrador deja una fila 'editada' sin corrección pública", () => {
    const t = valor(editar(base(), { evento: "Nuevo título" }, ctx()));
    expect(t.alerta.evento).toBe("Nuevo título");
    expect(t.alerta.estado).toBe("borrador");
    expect(t.correccion).toBeUndefined();
    expect(t.auditoria[0].accion).toBe("editada");
  });

  it("una publicada que cambia pasa a corregida, con corrección pública y auditoría", () => {
    const t = valor(
      editar(base({ estado: "publicada" }), { resumen: "Resumen corregido" }, ctx(), "Se corrigió el resumen."),
    );
    expect(t.alerta.estado).toBe("corregida");
    expect(t.correccion).toMatchObject({ tipo: "correccion", texto_publico: "Se corrigió el resumen." });
    expect(t.auditoria[0].accion).toBe("corregida");
  });

  it("una publicada no se edita en silencio: sin texto de corrección falla", () => {
    expect(editar(base({ estado: "publicada" }), { resumen: "Otro" }, ctx()).ok).toBe(false);
    expect(editar(base({ estado: "publicada" }), { resumen: "Otro" }, ctx(), "   ").ok).toBe(false);
  });

  it("una corregida puede volver a corregirse", () => {
    const t = valor(editar(base({ estado: "corregida" }), { impacto: "bajo" }, ctx(), "Impacto revisado."));
    expect(t.alerta.estado).toBe("corregida");
  });

  it("sin cambios de contenido no hace nada", () => {
    expect(editar(base(), { evento: "Evento de prueba" }, ctx()).ok).toBe(false);
  });

  it("solo toma campos de contenido aunque lleguen otros", () => {
    const cambios = { evento: "Nuevo", estado: "publicada", es_ejemplo: false } as unknown as Partial<Alert>;
    const t = valor(editar(base(), cambios, ctx()));
    expect(t.alerta.estado).toBe("borrador");
    expect(t.alerta.es_ejemplo).toBe(true);
  });

  it("valida el contenido nuevo", () => {
    expect(editar(base(), { evento: "" }, ctx()).ok).toBe(false);
  });

  it("una retractada no se edita", () => {
    expect(editar(base({ estado: "retractada" }), { evento: "Otro" }, ctx(), "x").ok).toBe(false);
  });
});

describe("retractación (regla 5)", () => {
  it("cambia el estado sin borrar la alerta y crea una retractación pública", () => {
    const original = base({ estado: "publicada" });
    const t = valor(retractar(original, ctx(), "La fuente original desmintió el hecho."));
    expect(t.alerta).toEqual({ ...original, estado: "retractada" });
    expect(t.correccion).toMatchObject({ tipo: "retractacion" });
    expect(t.auditoria[0].accion).toBe("retractada");
  });

  it("exige texto público", () => {
    expect(retractar(base({ estado: "publicada" }), ctx(), " ").ok).toBe(false);
  });

  it("solo aplica a alertas publicadas o corregidas", () => {
    expect(retractar(base(), ctx(), "x").ok).toBe(false);
    expect(retractar(base({ estado: "retractada" }), ctx(), "x").ok).toBe(false);
  });
});
