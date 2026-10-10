import { describe, expect, it, vi } from "vitest";
import { createFixedWindowLimiter } from "@/lib/security/rate-limit";
import { crearServicioLista, generarTokenSeguro, sha256Hex } from "./service";
import { createMemoryWaitlistStore } from "./store";

function servicio(modo: "cerrada" | "memoria" | "abierta" = "memoria", limite = 100) {
  const store = createMemoryWaitlistStore();
  const enviar = vi.fn<(correo: string, token: string) => Promise<void>>(async () => {});
  let n = 0;
  const reloj = { ahora: new Date("2026-10-09T12:00:00Z") };
  const s = crearServicioLista({
    modo,
    store,
    enviarConfirmacion: enviar,
    limiterPorCliente: createFixedWindowLimiter({ limite, ventanaMs: 60_000 }),
    generarToken: () => `${"t".repeat(42)}${n++}`,
    ahora: () => reloj.ahora,
    duracionMinimaMs: 0,
  });
  const avanzar = (ms: number) => {
    reloj.ahora = new Date(reloj.ahora.getTime() + ms);
  };
  return { s, store, enviar, avanzar };
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

const valido = { correo: "  Persona@Correo.CL ", acepta: "on", sitio_web: "" };

describe("lista de espera", () => {
  it("inscribe con el correo normalizado y guarda solo lo mínimo", async () => {
    const { s, store, enviar } = servicio();
    expect(await s.registrar(valido, "cliente")).toEqual({ estado: "ok", prueba: true });
    const [registro] = store.registros();
    expect(Object.keys(registro).sort()).toEqual(
      ["confirmado", "correo", "creado", "tokenEmitido", "tokenHash", "versionConsentimiento"].sort(),
    );
    expect(registro.correo).toBe("persona@correo.cl");
    expect(registro.confirmado).toBeNull();
    expect(enviar).toHaveBeenCalledOnce();
  });

  it("guarda el hash del token, nunca el token", async () => {
    const { s, store, enviar } = servicio();
    await s.registrar(valido, "cliente");
    const token = enviar.mock.calls[0][1];
    const [registro] = store.registros();
    expect(registro.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(store.registros())).not.toContain(token);
  });

  it("valida el correo y el consentimiento", async () => {
    const { s, store } = servicio();
    expect(await s.registrar({ correo: "no-es-correo", acepta: null, sitio_web: "" }, "c")).toEqual({
      estado: "invalida",
      errores: {
        correo: "Escribe un correo válido.",
        acepta: "Necesitamos tu consentimiento para guardar el correo.",
      },
    });
    expect(store.registros()).toHaveLength(0);
  });

  it("el campo trampa responde igual pero no guarda nada", async () => {
    const { s, store, enviar } = servicio();
    const r = await s.registrar({ ...valido, sitio_web: "https://spam.example" }, "bot");
    expect(r).toEqual({ estado: "ok", prueba: true });
    expect(store.registros()).toHaveLength(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("no revela si un correo ya estaba inscrito", async () => {
    const { s, enviar } = servicio();
    const primero = await s.registrar(valido, "a");
    const segundo = await s.registrar(valido, "b");
    expect(segundo).toEqual(primero);
    expect(enviar).toHaveBeenCalledOnce();
  });

  it("con la lista cerrada no guarda correos", async () => {
    const { s, store } = servicio("cerrada");
    expect(await s.registrar(valido, "c")).toEqual({ estado: "cerrada" });
    expect(store.registros()).toHaveLength(0);
  });

  it("limita los intentos por cliente", async () => {
    const { s } = servicio("memoria", 2);
    await s.registrar(valido, "c");
    await s.registrar(valido, "c");
    expect(await s.registrar(valido, "c")).toEqual({ estado: "limite" });
    expect(await s.registrar(valido, "otro")).toEqual({ estado: "ok", prueba: true });
  });

  it("confirma una sola vez con el token correcto (doble opt-in)", async () => {
    const { s, store, enviar } = servicio();
    await s.registrar(valido, "c");
    const token = enviar.mock.calls[0][1];
    expect(await s.confirmar("x".repeat(43))).toBe(false);
    expect(await s.confirmar(token)).toBe(true);
    expect(store.registros()[0].confirmado).toBe("2026-10-09T12:00:00.000Z");
    expect(store.registros()[0].tokenHash).toBeNull();
    expect(await s.confirmar(token)).toBe(false);
  });

  it("el enlace vence a las 72 horas", async () => {
    const { s, enviar, avanzar } = servicio();
    await s.registrar(valido, "c");
    avanzar(72 * HORA + 1);
    expect(await s.confirmar(enviar.mock.calls[0][1])).toBe(false);
  });

  it("si no llegó el correo, reenvía un enlace nuevo después de 10 minutos", async () => {
    const { s, enviar, avanzar } = servicio("abierta");
    await s.registrar(valido, "c");
    await s.registrar(valido, "c");
    expect(enviar).toHaveBeenCalledOnce();

    avanzar(10 * MINUTO + 1);
    expect(await s.registrar(valido, "c")).toEqual({ estado: "ok", prueba: false });
    expect(enviar).toHaveBeenCalledTimes(2);
    const [primero, segundo] = enviar.mock.calls.map((c) => c[1]);
    expect(await s.confirmar(primero)).toBe(false);
    expect(await s.confirmar(segundo)).toBe(true);
  });

  it("una inscripción confirmada no recibe más correos", async () => {
    const { s, enviar, avanzar } = servicio("abierta");
    await s.registrar(valido, "c");
    await s.confirmar(enviar.mock.calls[0][1]);
    avanzar(HORA);
    expect(await s.registrar(valido, "c")).toEqual({ estado: "ok", prueba: false });
    expect(enviar).toHaveBeenCalledOnce();
  });

  it("si el envío falla pide reintentar y permite otro envío enseguida", async () => {
    const { s, store, enviar } = servicio("abierta");
    enviar.mockRejectedValueOnce(new Error("caído"));
    expect(await s.registrar(valido, "c")).toEqual({ estado: "reintentar" });
    expect(await s.confirmar("t".repeat(42) + "0")).toBe(false);
    expect(await s.registrar(valido, "c")).toEqual({ estado: "ok", prueba: false });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(store.registros()).toHaveLength(1);
  });

  it("borra las inscripciones sin confirmar después de 30 días", async () => {
    const { s, store, avanzar } = servicio("abierta");
    await s.registrar(valido, "c");
    await s.registrar({ ...valido, correo: "otra@correo.cl" }, "d");
    avanzar(31 * 24 * HORA);
    await s.registrar({ ...valido, correo: "nueva@correo.cl" }, "e");
    expect(store.registros().map((r) => r.correo)).toEqual(["nueva@correo.cl"]);
  });

  it("la respuesta tarda lo mismo esté o no inscrito el correo", async () => {
    const store = createMemoryWaitlistStore();
    const s = crearServicioLista({
      modo: "abierta",
      store,
      enviarConfirmacion: async () => {},
      duracionMinimaMs: 80,
    });
    for (let i = 0; i < 2; i++) {
      const inicio = performance.now();
      await s.registrar(valido, "c");
      expect(performance.now() - inicio).toBeGreaterThanOrEqual(75);
    }
  });

  it("rechaza tokens con formato inválido sin consultar el almacenamiento", async () => {
    const { s } = servicio();
    for (const t of [undefined, "", "corto", "<script>", "a".repeat(200)]) {
      expect(await s.confirmar(t)).toBe(false);
    }
  });
});

describe("generarTokenSeguro", () => {
  it("genera 43 caracteres base64url distintos cada vez", () => {
    const a = generarTokenSeguro();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generarTokenSeguro()).not.toBe(a);
  });
});
