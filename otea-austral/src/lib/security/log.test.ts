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

describe("evento del asistente", () => {
  it("lleva solo la categoría del resultado", () => {
    const linea = JSON.parse(formatSecurityEvent({ tipo: "asistente", resultado: "degradada", motivo: "salida" }));
    expect(linea).toMatchObject({ nivel: "seguridad", tipo: "asistente", resultado: "degradada", motivo: "salida" });
    expect(Object.keys(linea).sort()).toEqual(["fecha", "motivo", "nivel", "resultado", "tipo"]);
  });
});

describe("eventos de las cuentas", () => {
  it("un acceso lleva solo su resultado: nunca el correo, la contraseña ni el código", () => {
    const linea = JSON.parse(formatSecurityEvent({ tipo: "acceso_cuenta", resultado: "dos_pasos_rechazado" }));
    expect(Object.keys(linea).sort()).toEqual(["fecha", "nivel", "resultado", "tipo"]);
    expect(linea).toMatchObject({ tipo: "acceso_cuenta", resultado: "dos_pasos_rechazado" });
  });

  it("un cambio en una cuenta lleva solo qué fue: nada de quién", () => {
    const linea = JSON.parse(formatSecurityEvent({ tipo: "cuenta", evento: "clave_restablecida" }));
    expect(Object.keys(linea).sort()).toEqual(["evento", "fecha", "nivel", "tipo"]);
  });

  it("aunque se colara un correo, una IP o un token en un campo de texto, el saneado lo oculta", () => {
    const linea = formatSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: `ana@correo.cl 190.1.2.3 ${"aB3_".repeat(11)}` });
    expect(linea).not.toMatch(/ana@correo|190\.1\.2\.3|aB3_aB3_/);
  });
});
