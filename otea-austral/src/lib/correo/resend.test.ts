import { afterEach, describe, expect, it, vi } from "vitest";
import { API_RESEND, crearEnviadorResend } from "./resend";

const CORREO = { para: "persona@correo.cl", asunto: "Asunto", texto: "Texto", html: "<p>Texto</p>" };

function enviador(respuesta: (...args: Parameters<typeof fetch>) => Promise<Response>, url?: string) {
  const fetchFn = vi.fn<typeof fetch>(respuesta);
  const enviar = crearEnviadorResend({
    apiKey: "re_prueba_123456",
    remitente: "Otea Austral <alertas@oteaustral.com>",
    url,
    fetchFn,
    tiempoLimiteMs: 50,
  });
  return { enviar, fetchFn };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("envío de correo con Resend", () => {
  it("envía a la API fija, a un solo destinatario, con la clave y sin seguir redirecciones", async () => {
    const { enviar, fetchFn } = enviador(async () => new Response("{}", { status: 200 }));
    await enviar(CORREO);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(API_RESEND);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_prueba_123456");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Otea Austral <alertas@oteaustral.com>",
      to: ["persona@correo.cl"],
      subject: "Asunto",
      text: "Texto",
      html: "<p>Texto</p>",
    });
  });

  it("usa otra dirección solo si se la dan (las pruebas e2e)", async () => {
    const { enviar, fetchFn } = enviador(async () => new Response("{}", { status: 200 }), "http://127.0.0.1:3298/emails");
    await enviar(CORREO);
    expect(fetchFn.mock.calls[0][0]).toBe("http://127.0.0.1:3298/emails");
  });

  it("si la API responde con error, lanza y registra solo el código", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { enviar } = enviador(async () => new Response("límite", { status: 429 }));
    await expect(enviar(CORREO)).rejects.toThrow("No se pudo enviar el correo.");
    expect(JSON.parse(aviso.mock.calls[0][0])).toMatchObject({ tipo: "fallo_servicio", servicio: "correo", codigo: "http_429" });
    const registrado = JSON.stringify(aviso.mock.calls);
    for (const secreto of ["persona@correo.cl", "Asunto", "Texto", "re_prueba"]) expect(registrado).not.toContain(secreto);
  });

  it("si la red falla o se agota el tiempo, lanza y registra un código técnico", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const caida = enviador(async () => Promise.reject(new TypeError("fetch failed")));
    await expect(caida.enviar(CORREO)).rejects.toThrow();
    expect(JSON.parse(aviso.mock.calls[0][0]).codigo).toBe("red");
    const lenta = enviador(
      (...[, init]: Parameters<typeof fetch>) =>
        new Promise((_, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason))),
    );
    await expect(lenta.enviar(CORREO)).rejects.toThrow();
    expect(JSON.parse(aviso.mock.calls[1][0]).codigo).toBe("tiempo_agotado");
  });
});
