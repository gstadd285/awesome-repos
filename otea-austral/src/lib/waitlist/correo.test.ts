import { afterEach, describe, expect, it, vi } from "vitest";
import { API_RESEND, crearRemitenteResend, enlaceConfirmacion, htmlConfirmacion } from "./correo";

const TOKEN = "A".repeat(43);

function remitente(respuesta: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(respuesta);
  const enviar = crearRemitenteResend({
    apiKey: "re_prueba_123456",
    remitente: "Otea Austral <alertas@oteaustral.com>",
    urlSitio: "https://oteaustral.com",
    fetchFn,
    tiempoLimiteMs: 50,
  });
  return { enviar, fetchFn };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remitente de Resend", () => {
  it("envía a la API fija con el enlace de confirmación y sin seguir redirecciones", async () => {
    const { enviar, fetchFn } = remitente(async () => new Response("{}", { status: 200 }));
    await enviar("persona@correo.cl", TOKEN);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(API_RESEND);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_prueba_123456");
    const cuerpo = JSON.parse(String(init?.body));
    expect(cuerpo.to).toEqual(["persona@correo.cl"]);
    expect(cuerpo.text).toContain(`https://oteaustral.com/lista-de-espera/confirmar?token=${TOKEN}`);
    expect(cuerpo.text).toContain("No constituye asesoría financiera");
  });

  it("si la API responde con error, lanza y registra solo el código", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { enviar } = remitente(async () => new Response("límite", { status: 429 }));
    await expect(enviar("persona@correo.cl", TOKEN)).rejects.toThrow();
    const linea = JSON.parse(aviso.mock.calls[0][0]);
    expect(linea).toMatchObject({ tipo: "fallo_servicio", servicio: "correo", codigo: "http_429" });
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("persona@correo.cl");
    expect(JSON.stringify(aviso.mock.calls)).not.toContain(TOKEN);
  });

  it("corta la espera con tiempo límite", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { enviar } = remitente(
      (...[, init]: Parameters<typeof fetch>) =>
        new Promise((_, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason))),
    );
    await expect(enviar("persona@correo.cl", TOKEN)).rejects.toThrow();
    expect(JSON.parse(aviso.mock.calls[0][0]).codigo).toBe("tiempo_agotado");
  });
});

describe("contenido del correo", () => {
  it("arma el enlace sobre la URL del sitio", () => {
    expect(enlaceConfirmacion("https://oteaustral.com", TOKEN)).toBe(
      `https://oteaustral.com/lista-de-espera/confirmar?token=${TOKEN}`,
    );
  });

  it("escapa el enlace en el HTML", () => {
    expect(htmlConfirmacion('https://x.cl/?a="><script>')).not.toContain("<script>");
  });
});
