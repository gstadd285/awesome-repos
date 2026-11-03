import { describe, expect, it } from "vitest";
import type { Correo } from "@/lib/correo/resend";
import { hashToken } from "@/lib/cuentas/tokens";
import type { SecurityEvent } from "@/lib/security/log";
import type { AlertaParaResumen } from "./seleccion";
import { correrResumen, type AlmacenResumen, type DependenciasResumen, type Suscrita } from "./servicio";

/**
 * El servicio con un almacén en memoria que imita las reglas de la base (migración 0011): un resumen por cuenta y día, el
 * cupo diario que solo sube y la reserva de todo o nada. Las mismas reglas, con Postgres de verdad, en `almacen-postgres.test.ts`.
 */

const DIA_MS = 24 * 3_600_000;
const diaDeChile = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

type Envio = { cuentaId: string; dia: string; estado: "reservado" | "enviado" | "fallido"; desde: Date; hasta: Date; alertas: number };

function mundo(
  cuentas: (Omit<Suscrita, "ultimoHasta" | "correoIndice" | "correoCifrado" | "pedidoDesde"> & { correo: string; pedidoDesde?: Date })[],
  alertas: AlertaParaResumen[],
) {
  const envios: Envio[] = [];
  const cupo = new Map<string, number>();
  const tokens: { hash: string; cuentaId: string; vence: Date }[] = [];
  const corridas: { resultado: string; cuentas: number; enviados: number; fallos: number }[] = [];
  const almacen: AlmacenResumen = {
    async suscritas(ahora) {
      return cuentas
        .filter((c) => !envios.some((e) => e.cuentaId === c.cuentaId && e.dia === diaDeChile(ahora)))
        .map((c) => {
          const enviados = envios.filter((e) => e.cuentaId === c.cuentaId && e.estado === "enviado").map((e) => e.hasta.getTime());
          const ultimoHasta = enviados.length ? new Date(Math.max(...enviados)) : null;
          return { cuentaId: c.cuentaId, correoCifrado: `v1.${c.correo}`, correoIndice: "i", temas: c.temas, ultimoHasta, pedidoDesde: c.pedidoDesde ?? null };
        });
    },
    async publicadas(desde, hasta) {
      return alertas.filter((a) => Date.parse(a.publicada) > desde.getTime() && Date.parse(a.publicada) <= hasta.getTime());
    },
    async reservar(r) {
      const dia = diaDeChile(r.ahora);
      if ((cupo.get(dia) ?? 0) >= r.tope) return "sin_cupo";
      if (envios.some((e) => e.cuentaId === r.cuentaId && e.dia === dia)) return "ya_enviado";
      cupo.set(dia, (cupo.get(dia) ?? 0) + 1);
      envios.push({ cuentaId: r.cuentaId, dia, estado: "reservado", desde: r.desde, hasta: r.hasta, alertas: r.alertas });
      tokens.push({ hash: r.tokenHash, cuentaId: r.cuentaId, vence: r.vence });
      return "ok";
    },
    async resolver(cuentaId, reservadoEn, estado) {
      const e = envios.find((x) => x.cuentaId === cuentaId && x.dia === diaDeChile(reservadoEn) && x.estado === "reservado");
      if (e) e.estado = estado;
    },
    async purgar() {},
    async registrarCorrida(c) {
      corridas.push({ resultado: c.resultado, cuentas: c.cuentas, enviados: c.enviados, fallos: c.fallos });
    },
  };
  const correos: Correo[] = [];
  const eventos: SecurityEvent[] = [];
  let turnoLibre = true;
  let fallarPara: string | null = null;
  let n = 0;
  const correr = (ahora: Date, extra: Partial<DependenciasResumen> = {}) =>
    correrResumen({
      almacen,
      turno: { tomar: async () => (turnoLibre ? "ficha" : null), soltar: async () => {} },
      enviar: async (c) => {
        if (c.para === fallarPara) throw new Error("Resend no responde");
        correos.push(c);
      },
      descifrarCorreo: (s) => (s.correoCifrado === "v1.roto" ? null : s.correoCifrado.slice(3)),
      urlSitio: "https://oteaustral.com",
      topeDiario: 30,
      reloj: () => ahora,
      nuevoToken: () => `${"t".repeat(40)}${String(++n).padStart(3, "0")}`,
      registrar: (e) => eventos.push(e),
      ...extra,
    });
  return {
    envios,
    tokens,
    corridas,
    correos,
    eventos,
    correr,
    ocuparTurno: () => (turnoLibre = false),
    fallarPara: (c: string | null) => (fallarPara = c),
  };
}

const AHORA = new Date("2026-10-30T10:41:00.000Z");
/** DATOS DE PRUEBA: alertas y cuentas ficticias (títulos «(prueba)», correos de example.org). */
const alerta = (id: string, tema: AlertaParaResumen["tema"], publicada: Date): AlertaParaResumen => ({
  id,
  tema,
  evento: `Evento ${id} (prueba)`,
  confianza: "media",
  publicada: publicada.toISOString(),
  estado: "publicada",
  es_ejemplo: false,
});
const antes = (horas: number, desde = AHORA) => new Date(desde.getTime() - horas * 3_600_000);

describe("corrida del resumen diario", () => {
  it("cada cuenta con alertas nuevas en sus temas recibe uno; sin novedades, nada; la corrida queda con conteos", async () => {
    const m = mundo(
      [
        { cuentaId: "c1", correo: "ana@example.org", temas: ["cobre"] },
        { cuentaId: "c2", correo: "beto@example.org", temas: ["chips"] },
        { cuentaId: "c3", correo: "caro@example.org", temas: [] },
      ],
      [alerta("a1", "cobre", antes(2)), alerta("a2", "energia", antes(5))],
    );
    const r = await m.correr(AHORA);
    expect(r).toEqual({ resultado: "ok", cuentas: 3, enviados: 2, sinNovedades: 1, fallos: 0, cupoAgotado: false });
    expect(m.correos.map((c) => c.para).sort()).toEqual(["ana@example.org", "caro@example.org"]);
    const ana = m.correos.find((c) => c.para === "ana@example.org")!;
    expect(ana.texto).toContain("Evento a1 (prueba)");
    expect(ana.texto).not.toContain("Evento a2");
    // Sin temas, todos: la cuenta c3 recibe las dos.
    expect(m.correos.find((c) => c.para === "caro@example.org")!.texto).toMatch(/Evento a1[\s\S]*Evento a2/);
    // El token de cada correo es único y en el almacén solo queda su hash.
    const enlace = /\/api\/resumen\/baja\?t=([A-Za-z0-9_-]{43})/.exec(ana.texto)![1];
    expect(m.tokens.map((t) => t.hash)).toContain(hashToken(enlace));
    expect(JSON.stringify(m.tokens)).not.toContain(enlace);
    expect(m.envios.map((e) => e.estado)).toEqual(["enviado", "enviado"]);
    expect(m.corridas).toEqual([{ resultado: "ok", cuentas: 3, enviados: 2, fallos: 0 }]);
    // El registro lleva solo conteos: nunca un correo ni un título.
    expect(m.eventos).toEqual([{ tipo: "tarea", tarea: "resumen", resultado: "ok", cuentas: 3, enviados: 2, fallos: 0 }]);
    expect(JSON.stringify(m.eventos)).not.toMatch(/example\.org|prueba/);
  });

  it("aunque la tarea corra dos veces el mismo día, cada cuenta recibe uno solo; al día siguiente, solo lo nuevo", async () => {
    const m = mundo([{ cuentaId: "c1", correo: "ana@example.org", temas: ["cobre"] }], [alerta("a1", "cobre", antes(2))]);
    await m.correr(AHORA);
    expect((await m.correr(new Date(AHORA.getTime() + 60_000))).enviados).toBe(0);
    expect(m.correos).toHaveLength(1);
    // Mañana, sin nada nuevo: a1 ya salió y no se repite.
    expect(await m.correr(new Date(AHORA.getTime() + DIA_MS))).toMatchObject({ enviados: 0, sinNovedades: 1 });
  });

  it("al día siguiente la ventana empieza donde terminó el último que salió", async () => {
    const alertas = [alerta("a1", "cobre", antes(2))];
    const m = mundo([{ cuentaId: "c1", correo: "ana@example.org", temas: ["cobre"] }], alertas);
    await m.correr(AHORA);
    alertas.push(alerta("a2", "cobre", antes(-3)), alerta("a3", "cobre", antes(-20)));
    const manana = new Date(AHORA.getTime() + DIA_MS);
    expect((await m.correr(manana)).enviados).toBe(1);
    expect(m.correos[1].texto).toMatch(/Evento a3[\s\S]*Evento a2/);
    expect(m.correos[1].texto).not.toContain("Evento a1");
    expect(m.envios[1].desde).toEqual(AHORA);
  });

  it("respeta el cupo del día: cuando se acaba, para; las que faltaron lo reciben mañana", async () => {
    const cuentas = ["c1", "c2", "c3"].map((id) => ({ cuentaId: id, correo: `${id}@example.org`, temas: ["cobre"], pedidoDesde: antes(48) }));
    const m = mundo(cuentas, [alerta("a1", "cobre", antes(2))]);
    const r = await m.correr(AHORA, { topeDiario: 2 });
    expect(r).toMatchObject({ resultado: "parcial", enviados: 2, cupoAgotado: true });
    expect(m.correos).toHaveLength(2);
    expect(m.eventos).toContainEqual({ tipo: "limite_excedido", recurso: "resumen_envios_diarios" });
    const manana = new Date(AHORA.getTime() + DIA_MS);
    expect((await m.correr(manana, { topeDiario: 2 })).enviados).toBe(1);
    expect(m.correos.map((c) => c.para).sort()).toEqual(["c1@example.org", "c2@example.org", "c3@example.org"]);
  });

  it("un envío que falla queda «fallido» y no se repite ese día; mañana su ventana incluye esas alertas", async () => {
    const m = mundo([{ cuentaId: "c1", correo: "ana@example.org", temas: ["cobre"] }], [alerta("a1", "cobre", antes(2))]);
    m.fallarPara("ana@example.org");
    expect(await m.correr(AHORA)).toMatchObject({ resultado: "parcial", enviados: 0, fallos: 1 });
    expect(m.envios[0].estado).toBe("fallido");
    m.fallarPara(null);
    expect((await m.correr(new Date(AHORA.getTime() + 60_000))).enviados).toBe(0);
    const manana = new Date(AHORA.getTime() + 20 * 3_600_000);
    expect((await m.correr(manana)).enviados).toBe(1);
    expect(m.correos[0].texto).toContain("Evento a1");
  });

  it("con el turno tomado por otra corrida no envía nada; un correo que no se descifra no gasta cupo", async () => {
    const m = mundo([{ cuentaId: "c1", correo: "roto", temas: ["cobre"] }], [alerta("a1", "cobre", antes(2))]);
    expect(await m.correr(AHORA)).toMatchObject({ resultado: "parcial", fallos: 1, enviados: 0 });
    expect(m.envios).toEqual([]);
    m.ocuparTurno();
    expect(await m.correr(AHORA)).toMatchObject({ resultado: "omitida", enviados: 0 });
    expect(m.corridas.at(-1)).toMatchObject({ resultado: "omitida" });
  });

  it("la primera vez cubre desde que lo pidió (o 24 h si fue hace menos), como mucho 7 días", async () => {
    const alertas = [alerta("a1", "cobre", antes(10)), alerta("a2", "cobre", antes(30)), alerta("a3", "cobre", antes(24 * 9))];
    const m = mundo(
      [
        { cuentaId: "c1", correo: "nueva@example.org", temas: ["cobre"], pedidoDesde: antes(1) },
        { cuentaId: "c2", correo: "antigua@example.org", temas: ["cobre"], pedidoDesde: antes(24 * 30) },
      ],
      alertas,
    );
    await m.correr(AHORA);
    const texto = (para: string) => m.correos.find((c) => c.para === para)!.texto;
    expect(texto("nueva@example.org")).toContain("Evento a1");
    expect(texto("nueva@example.org")).not.toContain("Evento a2");
    expect(texto("antigua@example.org")).toMatch(/Evento a1[\s\S]*Evento a2/);
    expect(texto("antigua@example.org")).not.toContain("Evento a3");
  });

  it("si la base falla al tomar el turno o al leer, la corrida falla sin enviar nada", async () => {
    const m = mundo([{ cuentaId: "c1", correo: "ana@example.org", temas: ["cobre"] }], [alerta("a1", "cobre", antes(2))]);
    const r = await m.correr(AHORA, {
      turno: {
        tomar: async () => {
          throw new Error("sin base");
        },
        soltar: async () => {},
      },
    });
    expect(r.resultado).toBe("fallida");
    expect(m.correos).toEqual([]);
  });
});
