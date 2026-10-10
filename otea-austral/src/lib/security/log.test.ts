import { afterEach, describe, expect, it, vi } from "vitest";
import { formatSecurityEvent, logSecurityEvent, sanitizeLogText } from "./log";

describe("sanitizeLogText", () => {
  it("quita parámetros y fragmentos de las URLs", () => {
    expect(sanitizeLogText("https://example.org/lista?correo=a@b.cl&token=x#frag")).toBe(
      "https://example.org/lista",
    );
  });

  it("oculta correos", () => {
    expect(sanitizeLogText("contacto persona.real@correo.cl hoy")).toBe("contacto [correo] hoy");
  });

  it("oculta direcciones IP v4 y v6", () => {
    expect(sanitizeLogText("desde 190.12.3.4")).toBe("desde [ip]");
    expect(sanitizeLogText("desde 2001:db8:85a3:0:0:8a2e:370:7334")).toBe("desde [ip]");
  });

  it("oculta secuencias tipo token", () => {
    expect(sanitizeLogText(`clave ${"a1B2".repeat(10)}`)).toBe("clave [token]");
  });

  it("elimina caracteres de control (evita inyectar líneas falsas)", () => {
    expect(sanitizeLogText("uno\ndos\r\ntres")).toBe("uno dos  tres");
  });

  it("acota el largo", () => {
    expect(sanitizeLogText("x ".repeat(400)).length).toBeLessThanOrEqual(301);
  });
});

describe("formatSecurityEvent", () => {
  it("produce una línea JSON con nivel, fecha y campos saneados", () => {
    const linea = formatSecurityEvent(
      {
        tipo: "csp_violation",
        directiva: "script-src-elem",
        bloqueado: "https://malo.example/x.js?sesion=123",
        documento: "/",
        disposicion: "enforce",
        linea: 3,
      },
      new Date("2026-10-09T12:00:00Z"),
    );
    expect(linea).not.toContain("\n");
    expect(JSON.parse(linea)).toEqual({
      nivel: "seguridad",
      fecha: "2026-10-09T12:00:00.000Z",
      tipo: "csp_violation",
      directiva: "script-src-elem",
      bloqueado: "https://malo.example/x.js",
      documento: "/",
      disposicion: "enforce",
      linea: 3,
    });
  });
});

describe("logSecurityEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("escribe una sola línea en la salida de advertencias", () => {
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSecurityEvent({ tipo: "limite_excedido", recurso: "csp-report" });
    expect(espia).toHaveBeenCalledTimes(1);
    expect(JSON.parse(espia.mock.calls[0][0] as string)).toMatchObject({
      tipo: "limite_excedido",
      recurso: "csp-report",
    });
  });
});
