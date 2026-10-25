import { afterEach, describe, expect, it, vi } from "vitest";
import { vistasEjemplo } from "@/data/ejemplo";
import type { AlertView } from "@/lib/domain/view";
import { alertasVisibles } from "./visibles";

// DATOS DE PRUEBA: una alerta «real» ficticia y una de ejemplo, hechas a partir de las del sitio.
const EJEMPLO: AlertView = { ...vistasEjemplo[0], id: "ejemplo-de-la-base", es_ejemplo: true };
const REAL: AlertView = { ...vistasEjemplo[1], id: "real-1", evento: "Evento real de prueba", es_ejemplo: false };

/** Un repositorio que responde lo que se le pida, y anota qué se le pidió. */
function repo(respuesta: (ejemplo: boolean) => AlertView[] | Promise<AlertView[]>) {
  const pedidos: boolean[] = [];
  return {
    pedidos,
    publicas: vi.fn(async ({ ejemplo }: { ejemplo: boolean; limite?: number }) => {
      pedidos.push(ejemplo);
      return respuesta(ejemplo);
    }),
  };
}

const SESION = { cuentaId: "00000000-0000-4000-8000-000000000001" };

afterEach(() => vi.restoreAllMocks());

describe("qué alertas ve quien abre /alertas", () => {
  it("con sesión: solo lo real publicado, y solo se piden las reales", async () => {
    const r = repo((ejemplo) => (ejemplo ? [EJEMPLO] : [REAL]));
    expect(await alertasVisibles(SESION, r)).toEqual({ acceso: "privado", alertas: [REAL], error: false });
    expect(r.pedidos).toEqual([false]);
  });

  it("sin sesión: solo ejemplos; nunca se piden las reales", async () => {
    const r = repo((ejemplo) => (ejemplo ? [EJEMPLO] : [REAL]));
    expect(await alertasVisibles(null, r)).toEqual({ acceso: "publico", alertas: [EJEMPLO], origen: "base" });
    expect(r.pedidos).toEqual([true]);
  });

  it("sin sesión y sin ejemplos publicados (o sin base), los ejemplos rotulados del sitio", async () => {
    for (const r of [repo(() => []), null]) {
      const v = await alertasVisibles(null, r);
      expect(v).toMatchObject({ acceso: "publico", origen: "sitio" });
      expect(v.alertas.length).toBeGreaterThan(0);
      expect(v.alertas.every((a) => a.es_ejemplo)).toBe(true);
    }
  });

  it("aunque la consulta se equivocara, una lista nunca mezcla: sin sesión no pasa nada real, y con sesión nada de ejemplo", async () => {
    const mezclado = repo(() => [EJEMPLO, REAL]);
    expect((await alertasVisibles(null, mezclado)).alertas).toEqual([EJEMPLO]);
    expect((await alertasVisibles(SESION, mezclado)).alertas).toEqual([REAL]);
    const soloReal = repo(() => [REAL]);
    const publico = await alertasVisibles(null, soloReal);
    expect(publico.alertas.some((a) => a.id === REAL.id || !a.es_ejemplo)).toBe(false);
  });

  it("si la base falla: con sesión, el aviso de error; sin sesión, los ejemplos del sitio", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const roto = repo(() => Promise.reject(new Error("sin base")));
    expect(await alertasVisibles(SESION, roto)).toEqual({ acceso: "privado", alertas: [], error: true });
    expect(await alertasVisibles(null, roto)).toMatchObject({ acceso: "publico", origen: "sitio" });
  });
});
