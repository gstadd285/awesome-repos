import { afterEach, describe, expect, it, vi } from "vitest";
import { crearAlmacenMemoria } from "./almacen-memoria";
import { crearCifradorCuentas } from "./cifrado";
import { ENVIOS_POR_INVITACION, INVITACIONES_VIGENTES_MAX } from "./constantes";
import {
  CodigoInvitacionSchema,
  crearServicioInvitaciones,
  estadoInvitacion,
  formatearCodigoInvitacion,
  generarCodigoInvitacion,
  normalizarCodigoInvitacion,
} from "./invitaciones";

const SECRETO = "S".repeat(43);
const DIA = 24 * 60 * 60_000;

afterEach(() => vi.restoreAllMocks());

describe("códigos de invitación", () => {
  it("son 20 caracteres base32 (100 bits) en cuatro grupos de cinco, y no se repiten", () => {
    const codigos = Array.from({ length: 500 }, generarCodigoInvitacion);
    for (const c of codigos) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(new Set(codigos).size).toBe(codigos.length);
    // Usan todo el alfabeto (32 símbolos = 5 bits cada uno): 20 × 5 = 100 bits.
    expect(new Set(codigos.join("").replaceAll("-", "")).size).toBe(32);
  });

  it("se normalizan antes de comparar: minúsculas, espacios, guiones y los dígitos que se confunden con letras", () => {
    expect(normalizarCodigoInvitacion(" abcde-fghij klmno-pqrst ")).toBe("ABCDEFGHIJKLMNOPQRST");
    expect(normalizarCodigoInvitacion("0O1I8B-22222")).toBe("OOIIBB22222");
    expect(formatearCodigoInvitacion("ABCDEFGHIJKLMNOPQRST")).toBe("ABCDE-FGHIJ-KLMNO-PQRST");
  });

  it("el formulario solo comprueba la forma, con el mismo mensaje para todo texto mal formado", () => {
    expect(CodigoInvitacionSchema.parse("abcde-fghij-klmno-pqrst")).toBe("ABCDEFGHIJKLMNOPQRST");
    const mensajes = ["", "ABC", "ABCDE-FGHIJ-KLMNO-PQRS9", "ABCDE-FGHIJ-KLMNO-PQRSTU", "x".repeat(65)].map((t) => {
      const r = CodigoInvitacionSchema.safeParse(t);
      expect(r.success, t).toBe(false);
      return r.error?.issues[0]?.message;
    });
    expect(mensajes[0]).toBe("Escribe tu código de invitación.");
    expect(new Set(mensajes.slice(1))).toEqual(new Set(["Revisa el código de invitación: son 20 letras y números, en cuatro grupos de cinco."]));
  });

  it("de un código solo se guarda un HMAC con la clave derivada de CUENTAS_SECRETO: sin el secreto no se puede probar", () => {
    const codigo = normalizarCodigoInvitacion(generarCodigoInvitacion());
    const a = crearCifradorCuentas(SECRETO).hashInvitacion(codigo);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(crearCifradorCuentas(SECRETO).hashInvitacion(codigo)).toBe(a);
    expect(crearCifradorCuentas("T".repeat(43)).hashInvitacion(codigo)).not.toBe(a);
    expect(a).not.toContain(codigo.toLowerCase());
  });
});

describe("estado de una invitación", () => {
  const base = { id: "i", alias: "a", emitida: "2026-10-01T00:00:00.000Z", vence: "2026-10-15T00:00:00.000Z", envios: 0, usada: null, revocada: null };
  const ahora = new Date("2026-10-10T00:00:00.000Z");

  it("vigente, agotada, vencida, usada o revocada", () => {
    expect(estadoInvitacion(base, ahora)).toBe("vigente");
    expect(estadoInvitacion({ ...base, envios: ENVIOS_POR_INVITACION }, ahora)).toBe("agotada");
    expect(estadoInvitacion(base, new Date("2026-10-15T00:00:00.000Z"))).toBe("vencida");
    expect(estadoInvitacion({ ...base, usada: "2026-10-02T00:00:00.000Z" }, ahora)).toBe("usada");
    expect(estadoInvitacion({ ...base, revocada: "2026-10-02T00:00:00.000Z" }, ahora)).toBe("revocada");
  });
});

describe("servicio de invitaciones del panel", () => {
  function montar() {
    const almacen = crearAlmacenMemoria();
    const cifrador = crearCifradorCuentas(SECRETO);
    let reloj = Date.UTC(2026, 9, 20, 12, 0, 0);
    const servicio = crearServicioInvitaciones({ almacen, cifrador, ahora: () => new Date(reloj) });
    return { almacen, cifrador, servicio, avanzar: (ms: number) => (reloj += ms), ahora: () => new Date(reloj) };
  }

  it("emite un código que se muestra una vez: lo guardado es su HMAC, y vence a los 14 días por omisión", async () => {
    const m = montar();
    const r = await m.servicio.emitir({ alias: " Anticipado-01 ", dias: "" }, "duena");
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.alias).toBe("anticipado-01");
    expect(r.codigo).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
    expect(Date.parse(r.vence) - m.ahora().getTime()).toBe(14 * DIA);
    const { invitaciones, vigentes, auditoria } = await m.servicio.listar();
    expect(vigentes).toBe(1);
    expect(invitaciones).toEqual([expect.objectContaining({ id: r.id, alias: "anticipado-01", estado: "vigente", envios: 0 })]);
    // Lo que sale del almacén no trae el código ni su huella.
    expect(JSON.stringify(invitaciones)).not.toContain(r.codigo.replaceAll("-", ""));
    expect(Object.keys(invitaciones[0]).sort()).toEqual(["alias", "emitida", "envios", "estado", "id", "revocada", "usada", "vence"]);
    expect(auditoria).toEqual([expect.objectContaining({ invitacionId: r.id, accion: "emitida", actor: "duena", alias: "anticipado-01" })]);
    // El código emitido es el que se reserva con su HMAC.
    const hash = m.cifrador.hashInvitacion(normalizarCodigoInvitacion(r.codigo));
    expect(await m.almacen.reservarInvitacion(hash, m.ahora().toISOString(), ENVIOS_POR_INVITACION)).toBe(r.id);
  });

  it("valida el alias (forma del actor, sin datos personales) y la vigencia (1 a 30 días)", async () => {
    const m = montar();
    for (const alias of ["", "ana@correo.cl", "con espacios", "x".repeat(41)]) {
      expect((await m.servicio.emitir({ alias, dias: "7" }, "duena")).ok, alias).toBe(false);
    }
    for (const dias of ["0", "31", "2.5", "muchos"]) {
      expect((await m.servicio.emitir({ alias: "a", dias }, "duena")).ok, dias).toBe(false);
    }
    expect((await m.servicio.emitir({ alias: "a", dias: "30" }, "duena")).ok).toBe(true);
  });

  it(`no deja más de ${INVITACIONES_VIGENTES_MAX} vigentes a la vez; las vencidas o revocadas no cuentan`, async () => {
    const m = montar();
    const ids: string[] = [];
    for (let i = 0; i < INVITACIONES_VIGENTES_MAX; i++) {
      const r = await m.servicio.emitir({ alias: `a-${i}`, dias: "1" }, "duena");
      if (!r.ok) throw new Error(r.motivos.join());
      ids.push(r.id);
    }
    const tope = await m.servicio.emitir({ alias: "una-mas", dias: "1" }, "duena");
    expect(tope).toEqual({ ok: false, motivos: [expect.stringContaining(`${INVITACIONES_VIGENTES_MAX} invitaciones vigentes`)] });
    expect(await m.servicio.revocar(ids[0], "duena")).toEqual({ ok: true });
    expect((await m.servicio.emitir({ alias: "una-mas", dias: "1" }, "duena")).ok).toBe(true);
    m.avanzar(DIA + 1);
    expect((await m.servicio.listar()).vigentes).toBe(0);
    expect((await m.servicio.emitir({ alias: "otra", dias: "1" }, "duena")).ok).toBe(true);
  });

  it("revocar: una vez, solo si no se usó, y queda en la auditoría", async () => {
    const m = montar();
    const r = await m.servicio.emitir({ alias: "a", dias: "3" }, "duena");
    if (!r.ok) throw new Error();
    expect(await m.servicio.revocar(r.id, "duena")).toEqual({ ok: true });
    expect(await m.servicio.revocar(r.id, "duena")).toEqual({ ok: false, motivos: ["Esa invitación ya estaba usada o revocada."] });
    expect(await m.servicio.revocar("no-es-un-id", "duena")).toEqual({ ok: false, motivos: ["Esa invitación no existe."] });
    const { invitaciones, auditoria } = await m.servicio.listar();
    expect(invitaciones[0].estado).toBe("revocada");
    expect(auditoria.map((a) => a.accion)).toEqual(["revocada", "emitida"]);
    const hash = m.cifrador.hashInvitacion(normalizarCodigoInvitacion(r.codigo));
    expect(await m.almacen.reservarInvitacion(hash, m.ahora().toISOString(), ENVIOS_POR_INVITACION)).toBeNull();
  });

  it("si la base falla, no se entrega ningún código", async () => {
    const m = montar();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(m.almacen, "emitirInvitacion").mockRejectedValue(new Error("sin base"));
    const r = await m.servicio.emitir({ alias: "a", dias: "3" }, "duena");
    expect(r).toEqual({ ok: false, motivos: [expect.stringContaining("No se pudo guardar")] });
  });
});
