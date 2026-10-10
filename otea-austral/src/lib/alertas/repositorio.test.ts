import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, HAY_BASE_DE_PRUEBAS, type BaseDePrueba } from "@/lib/db/prueba-postgres";
import type { Contexto } from "@/lib/domain/rules";
import { crearRepositorioAlertas, type Cambio, type DatosEnlace, type DatosNuevaAlerta, type RepositorioAlertas } from "./repositorio";

// DATOS DE EJEMPLO: escenario ficticio, solo para pruebas.
const NUEVA: DatosNuevaAlerta = {
  tema: "cobre",
  evento: "Evento de prueba en el mercado del cobre",
  resumen: "Escenario de ejemplo redactado para las pruebas.",
  filas: [{ sector: "Mineras", direccion: "gana", condicion: "Si el precio se sostiene", confianza: "alta" }],
  impacto: "medio",
  revisor: "Equipo de prueba",
  es_ejemplo: true,
};

function enlace(source_id: string, sufijo: string): DatosEnlace {
  return {
    source_id,
    titulo_documento: `Documento de ejemplo ${sufijo}`,
    url: `https://example.org/documento-${sufijo}`,
    fecha_publicacion: "2026-10-01",
    fecha_consulta: "2026-10-02",
  };
}

function ctx(): Contexto {
  return { actor: "editor", fecha: new Date().toISOString(), generarId: () => randomUUID() };
}

function ok(r: Cambio) {
  if (!r.ok) throw new Error(`Se esperaba ok: ${r.motivos.join(" | ")}`);
  return r.valor;
}

describe.skipIf(!HAY_BASE_DE_PRUEBAS)("repositorio de alertas (Postgres)", () => {
  let base: BaseDePrueba;
  let repo: RepositorioAlertas;

  beforeAll(async () => {
    base = await crearBaseDePrueba();
    repo = crearRepositorioAlertas(base.app);
  }, 60_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  async function borradorConFuente(datos: Partial<DatosNuevaAlerta> = {}, fuente = "bcch") {
    const { id } = ok(await repo.crear({ ...NUEVA, ...datos }, ctx()));
    const { version } = ok(await repo.agregarFuente(id, 1, enlace(fuente, randomUUID()), ctx()));
    return { id, version };
  }

  it("crea un borrador con su fila de auditoría y confianza calculada baja", async () => {
    const { id } = ok(await repo.crear(NUEVA, ctx()));
    const d = await repo.obtener(id);
    expect(d?.alerta.estado).toBe("borrador");
    expect(d?.version).toBe(1);
    expect(d?.auditoria.map((a) => a.accion)).toEqual(["creada"]);
    expect(d?.vista.confianza).toBe("baja");
    expect(d?.vista.filas[0].confianza_mostrada).toBe("baja");
    expect(d?.motivosParaNoPublicar).toContain("Toda alerta necesita al menos una fuente.");
    expect((await repo.listar()).some((r) => r.id === id)).toBe(true);
  });

  it("una fuente primaria sube la confianza a alta (reglas 1 y 6)", async () => {
    const { id, version } = await borradorConFuente();
    expect(version).toBe(2);
    const d = await repo.obtener(id);
    expect(d?.vista.confianza).toBe("alta");
    expect(d?.vista.nivel_verificacion).toBe("fuente_oficial");
    expect(d?.enlaces[0]).toMatchObject({ organismo: "Banco Central de Chile", tipo: "primaria" });
    expect(d?.auditoria.map((a) => a.accion)).toEqual(["creada", "editada"]);
  });

  it("rechaza cambios sobre una versión vieja (bloqueo optimista)", async () => {
    const { id } = await borradorConFuente();
    const r = await repo.enviarARevision(id, 1, ctx());
    expect(r).toEqual({ ok: false, motivos: [expect.stringContaining("cambió mientras la mirabas")] });
  });

  it("impacto alto: dos organismos y aprobación antes de publicar (regla 3)", async () => {
    const { id, version: v2 } = await borradorConFuente({ impacto: "alto" });
    const v3 = ok(await repo.enviarARevision(id, v2, ctx())).version;

    const sinSegunda = await repo.publicar(id, v3, ctx());
    expect(sinSegunda.ok).toBe(false);

    const v4 = ok(await repo.agregarFuente(id, v3, enlace("fed", "segunda"), ctx())).version;
    const sinAprobar = await repo.publicar(id, v4, ctx());
    expect(sinAprobar).toEqual({ ok: false, motivos: [expect.stringContaining("aprobación humana")] });

    const v5 = ok(await repo.aprobar(id, v4, ctx(), "Revisado")).version;
    const antes = (await repo.obtener(id))?.alerta.fecha;
    const instante = new Date(Date.now() + 60_000).toISOString();
    ok(await repo.publicar(id, v5, { ...ctx(), fecha: instante }));

    const d = await repo.obtener(id);
    expect(d?.alerta.estado).toBe("publicada");
    expect(d?.alerta.fecha).toBe(instante);
    expect(d?.alerta.fecha).not.toBe(antes);
    expect(d?.auditoria.map((a) => a.accion)).toEqual(["creada", "editada", "editada", "editada", "aprobada", "publicada"]);
    expect((await repo.publicas()).some((a) => a.id === id)).toBe(true);
  });

  it("una alerta publicada solo cambia con corrección pública (regla 4)", async () => {
    const { id, version } = await borradorConFuente();
    const v = ok(await repo.publicar(id, version, ctx())).version;

    const silenciosa = await repo.editar(id, v, { evento: "Evento corregido" }, ctx());
    expect(silenciosa.ok).toBe(false);

    const v2 = ok(await repo.editar(id, v, { evento: "Evento corregido" }, ctx(), "Se precisó el evento.")).version;
    const d = await repo.obtener(id);
    expect(d?.alerta.estado).toBe("corregida");
    expect(d?.correcciones).toHaveLength(1);
    expect(d?.correcciones[0]).toMatchObject({ tipo: "correccion", texto_publico: "Se precisó el evento." });

    const sinTexto = await repo.agregarFuente(id, v2, enlace("ine", "x"), ctx());
    expect(sinTexto.ok).toBe(false);
    ok(await repo.agregarFuente(id, v2, enlace("ine", "x"), ctx(), "Se agregó un dato del INE."));
    const publica = (await repo.publicas()).find((a) => a.id === id);
    expect(publica?.correcciones).toHaveLength(2);
    expect(publica?.fuentes).toHaveLength(2);
  });

  it("una publicada conserva al menos una fuente; un borrador puede quedar sin ninguna", async () => {
    const borrador = await borradorConFuente();
    const enlaceBorrador = (await repo.obtener(borrador.id))!.enlaces[0].id;
    ok(await repo.retirarFuente(borrador.id, borrador.version, enlaceBorrador, ctx()));
    const d = await repo.obtener(borrador.id);
    expect(d?.enlaces[0].retirada).not.toBeNull();
    expect(d?.vista.fuentes).toHaveLength(0);

    const { id, version } = await borradorConFuente();
    const v = ok(await repo.publicar(id, version, ctx())).version;
    const enlaceId = (await repo.obtener(id))!.enlaces[0].id;
    const r = await repo.retirarFuente(id, v, enlaceId, ctx(), "Se retira la única fuente.");
    expect(r).toEqual({ ok: false, motivos: [expect.stringContaining("al menos una fuente"), expect.stringContaining("retráctala")] });
    // El rechazo revierte todo: el enlace sigue activo y la versión no cambió.
    const intacta = await repo.obtener(id);
    expect(intacta?.enlaces[0].retirada).toBeNull();
    expect(intacta?.version).toBe(v);
  });

  it("la retractación no borra: sigue pública y ya no se edita (regla 5)", async () => {
    const { id, version } = await borradorConFuente();
    const v = ok(await repo.publicar(id, version, ctx())).version;
    const v2 = ok(await repo.retractar(id, v, ctx(), "Los datos no se confirmaron.")).version;
    const d = await repo.obtener(id);
    expect(d?.alerta.estado).toBe("retractada");
    expect(d?.correcciones.at(-1)?.tipo).toBe("retractacion");
    expect((await repo.editar(id, v2, { evento: "Otro" }, ctx(), "x")).ok).toBe(false);
    expect((await repo.publicas()).find((a) => a.id === id)?.estado).toBe("retractada");
  });

  it("rechaza documentos duplicados, fuentes fuera del registro y enlaces no https", async () => {
    const { id, version } = await borradorConFuente();
    const d = await repo.obtener(id);
    const repetido = { ...enlace("cmf", "r"), url: d!.enlaces[0].url };
    expect(await repo.agregarFuente(id, version, repetido, ctx())).toEqual({
      ok: false,
      motivos: ["Ese documento ya está enlazado a la alerta."],
    });
    expect((await repo.agregarFuente(id, version, enlace("no-existe", "n"), ctx())).ok).toBe(false);
    const inseguro = { ...enlace("cmf", "j"), url: "javascript:alert(1)" };
    expect((await repo.agregarFuente(id, version, inseguro, ctx())).ok).toBe(false);
    expect((await repo.obtener(id))?.version).toBe(version);
  });

  it("no guarda alertas con lenguaje de recomendación", async () => {
    const antes = (await repo.listar()).length;
    const r = await repo.crear({ ...NUEVA, resumen: "Recomendamos comprar mineras." }, ctx());
    expect(r.ok).toBe(false);
    expect(await repo.listar()).toHaveLength(antes);
  });

  it("un cambio posterior del registro no altera la confianza de una alerta publicada", async () => {
    const { id, version } = await borradorConFuente({}, "cochilco");
    ok(await repo.publicar(id, version, ctx()));
    await base.propietario.consulta("update fuentes set tipo = 'prensa' where id = 'cochilco'");
    try {
      expect((await repo.publicas()).find((a) => a.id === id)?.confianza).toBe("alta");
    } finally {
      await base.propietario.consulta("update fuentes set tipo = 'primaria' where id = 'cochilco'");
    }
  });

  it("la aplicación no puede editar ni borrar la auditoría, ni borrar alertas", async () => {
    const { id } = await borradorConFuente();
    await expect(base.app.consulta("update alerta_auditoria set nota = 'x' where alert_id = $1", [id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(base.app.consulta("delete from alerta_auditoria where alert_id = $1", [id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(base.app.consulta("delete from alertas where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(base.app.consulta("update alertas set estado = 'publicada' where id = $1", [id])).rejects.toThrow();
  });

  it("ni siquiera el dueño de la base reescribe la auditoría o las correcciones", async () => {
    const { id } = await borradorConFuente();
    await expect(
      base.propietario.consulta("update alerta_auditoria set nota = 'x' where alert_id = $1", [id]),
    ).rejects.toThrow(/no admite UPDATE/);
    await expect(base.propietario.consulta("delete from correcciones")).rejects.toThrow(/no admite DELETE/);
    await expect(base.propietario.consulta("truncate alerta_auditoria")).rejects.toThrow(/no admite TRUNCATE/);
  });
});
