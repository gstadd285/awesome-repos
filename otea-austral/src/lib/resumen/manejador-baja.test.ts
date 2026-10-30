import { describe, expect, it, vi } from "vitest";
import { createFixedWindowLimiter } from "@/lib/security/rate-limit";
import type { SecurityEvent } from "@/lib/security/log";
import { darDeBaja, FORMATO_TOKEN_BAJA } from "./baja";
import { crearManejadorBaja } from "./manejador-baja";

const TOKEN = "b".repeat(43);
const URL_BAJA = `https://oteaustral.com/api/resumen/baja?t=${TOKEN}`;

function montar(resultado: "baja" | "enlace_invalido" | Error = "baja", limite = 20) {
  const eventos: SecurityEvent[] = [];
  const darDeBajaFn = vi.fn(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  const manejar = crearManejadorBaja({
    darDeBaja: darDeBajaFn,
    proxiesConfiables: 1,
    porIp: createFixedWindowLimiter({ limite, ventanaMs: 60_000 }),
    registrar: (e) => eventos.push(e),
  });
  return { manejar, darDeBajaFn, eventos };
}

const post = (url = URL_BAJA, cabeceras: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.9", ...cabeceras }, body: "List-Unsubscribe=One-Click" });

describe("baja de un clic del resumen diario", () => {
  it("un GET (o HEAD) nunca da de baja: lleva a la página que pide confirmar, con el token solo si tiene su forma", async () => {
    const m = montar();
    for (const method of ["GET", "HEAD"]) {
      const r = await m.manejar(new Request(URL_BAJA, { method }));
      expect(r.status, method).toBe(303);
      expect(r.headers.get("location")).toBe(`/resumen/baja?t=${TOKEN}`);
    }
    const raro = await m.manejar(new Request("https://oteaustral.com/api/resumen/baja?t=%0d%0aSet-Cookie:x", { method: "GET" }));
    expect(raro.headers.get("location")).toBe("/resumen/baja");
    expect(m.darDeBajaFn).not.toHaveBeenCalled();
  });

  it("el POST de un programa de correo (RFC 8058) da de baja y responde texto; uno sin token o vencido, lo mismo sin cambiar nada", async () => {
    const m = montar();
    const r = await m.manejar(post());
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/ya no recibirás/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.darDeBajaFn).toHaveBeenCalledWith(TOKEN);
    expect(m.eventos).toEqual([{ tipo: "resumen_baja", resultado: "baja" }]);
    const vencido = montar("enlace_invalido");
    const r2 = await vencido.manejar(post());
    expect(r2.status).toBe(200);
    expect(vencido.eventos).toEqual([{ tipo: "resumen_baja", resultado: "enlace_invalido" }]);
  });

  it("desde el botón de la página (una navegación) vuelve a la página con el resultado", async () => {
    expect((await montar().manejar(post(URL_BAJA, { "sec-fetch-mode": "navigate" }))).headers.get("location")).toBe("/resumen/baja?estado=listo");
    expect((await montar("enlace_invalido").manejar(post(URL_BAJA, { "sec-fetch-mode": "navigate" }))).headers.get("location")).toBe(
      "/resumen/baja?estado=invalido",
    );
    const caida = montar(new Error("sin base"));
    expect((await caida.manejar(post(URL_BAJA, { "sec-fetch-mode": "navigate" }))).headers.get("location")).toBe("/resumen/baja?estado=error");
    expect((await caida.manejar(post())).status).toBe(503);
  });

  it("no lee cuerpos grandes, limita por IP y no admite otros métodos", async () => {
    const m = montar("baja", 2);
    expect((await m.manejar(post(URL_BAJA, { "content-length": "5000" }))).status).toBe(413);
    expect((await m.manejar(post())).status).toBe(200);
    expect((await m.manejar(post())).status).toBe(200);
    expect((await m.manejar(post())).status).toBe(429);
    expect(m.eventos.at(-1)).toEqual({ tipo: "resumen_baja", resultado: "limite" });
    expect((await m.manejar(new Request(URL_BAJA, { method: "PUT" }))).status).toBe(405);
  });

  it("sin base de datos, 404 a todo", async () => {
    const manejar = crearManejadorBaja({ darDeBaja: null, proxiesConfiables: 1 });
    for (const method of ["GET", "POST"]) expect((await manejar(new Request(URL_BAJA, { method }))).status, method).toBe(404);
  });

  it("darDeBaja valida la forma del token antes de buscar su hash", async () => {
    const almacen = { darDeBaja: vi.fn<(hash: string, ahora: Date) => Promise<boolean>>(async () => true) };
    expect(FORMATO_TOKEN_BAJA.test(TOKEN)).toBe(true);
    for (const malo of [undefined, "", "corto", `${TOKEN}x`, `${"b".repeat(42)}+`, 12]) {
      expect(await darDeBaja(malo, almacen), String(malo)).toBe("enlace_invalido");
    }
    expect(almacen.darDeBaja).not.toHaveBeenCalled();
    expect(await darDeBaja(TOKEN, almacen)).toBe("baja");
    expect(almacen.darDeBaja.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(almacen.darDeBaja.mock.calls[0][0]).not.toContain(TOKEN);
  });
});
