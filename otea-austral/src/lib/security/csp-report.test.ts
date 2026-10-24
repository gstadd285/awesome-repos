import { describe, expect, it, vi } from "vitest";
import {
  MAX_BYTES_REPORTE,
  crearManejadorReportesCsp,
  normalizarReportes,
  resumirUrl,
} from "./csp-report";
import type { SecurityEvent } from "./log";
import { createFixedWindowLimiter } from "./rate-limit";

const URL_REPORTE = "https://oteaustral.com/api/csp-report";

function solicitud(cuerpo: string, tipo = "application/csp-report", cabeceras: Record<string, string> = {}) {
  return new Request(URL_REPORTE, {
    method: "POST",
    headers: { "content-type": tipo, ...cabeceras },
    body: cuerpo,
  });
}

const clasico = {
  "csp-report": {
    "document-uri": "https://oteaustral.com/seguridad?correo=persona@correo.cl#x",
    referrer: "https://buscador.example/?q=privado",
    "violated-directive": "script-src-elem 'self' 'nonce-abc'",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'; script-src 'nonce-abc'",
    disposition: "enforce",
    "blocked-uri": "https://malo.example/inyectado.js?sesion=123",
    "script-sample": "alert(document.cookie)",
    "line-number": 12,
    "column-number": 4,
    "source-file": "https://oteaustral.com/_next/static/chunks/app.js?v=1",
  },
};

const moderno = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://oteaustral.com/",
    user_agent: "Mozilla/5.0 (algo identificable)",
    body: {
      documentURL: "https://oteaustral.com/?utm=campaña",
      effectiveDirective: "style-src-attr",
      blockedURL: "inline",
      disposition: "enforce",
      sample: "color:red",
    },
  },
  { type: "deprecation", body: { id: "x" } },
];

describe("resumirUrl", () => {
  it("deja origen y ruta, sin parámetros ni fragmento", () => {
    expect(resumirUrl("https://a.example/ruta/x.js?token=1#f")).toBe("https://a.example/ruta/x.js");
  });

  it("conserva palabras clave de la CSP", () => {
    expect(resumirUrl("inline")).toBe("inline");
    expect(resumirUrl("EVAL")).toBe("eval");
  });

  it("reduce otros esquemas a su nombre", () => {
    expect(resumirUrl("data:text/javascript;base64,YWxlcnQoMSk=")).toBe("data:");
    expect(resumirUrl("chrome-extension://abcdef/script.js")).toBe("chrome-extension:");
  });

  it("marca lo que no se puede interpretar", () => {
    expect(resumirUrl("no es url")).toBe("[desconocido]");
    expect(resumirUrl(undefined)).toBe("[vacío]");
  });
});

describe("normalizarReportes", () => {
  it("formato clásico: solo campos permitidos y sin datos sensibles", () => {
    expect(normalizarReportes(clasico)).toEqual([
      {
        tipo: "csp_violation",
        directiva: "script-src-elem",
        bloqueado: "https://malo.example/inyectado.js",
        documento: "/seguridad",
        disposicion: "enforce",
        fuente: "https://oteaustral.com/_next/static/chunks/app.js",
        linea: 12,
        columna: 4,
      },
    ]);
  });

  it("Reporting API: toma solo los reportes de CSP", () => {
    expect(normalizarReportes(moderno)).toEqual([
      {
        tipo: "csp_violation",
        directiva: "style-src-attr",
        bloqueado: "inline",
        documento: "/",
        disposicion: "enforce",
      },
    ]);
  });

  it("usa solo el nombre de la directiva violada", () => {
    const sinEfectiva = {
      "csp-report": { "violated-directive": "img-src 'self' data:", "blocked-uri": "https://x.example/a.png" },
    };
    expect(normalizarReportes(sinEfectiva)?.[0]).toMatchObject({ directiva: "img-src" });
  });

  it("rechaza formatos desconocidos", () => {
    expect(normalizarReportes({ hola: "mundo" })).toBeNull();
    expect(normalizarReportes([])).toBeNull();
    expect(normalizarReportes("texto")).toBeNull();
  });
});

describe("crearManejadorReportesCsp", () => {
  function manejador(limite = 100) {
    const eventos: SecurityEvent[] = [];
    const post = crearManejadorReportesCsp({
      limiter: createFixedWindowLimiter({ limite, ventanaMs: 60_000 }),
      registrar: (e) => eventos.push(e),
    });
    return { post, eventos };
  }

  it("registra un reporte válido y responde 204", async () => {
    const { post, eventos } = manejador();
    const r = await post(solicitud(JSON.stringify(clasico)));
    expect(r.status).toBe(204);
    expect(eventos).toHaveLength(1);
    const texto = JSON.stringify(eventos);
    for (const prohibido of ["persona@correo.cl", "sesion=123", "document.cookie", "privado", "nonce-abc"]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("acepta el formato de la Reporting API", async () => {
    const { post, eventos } = manejador();
    const r = await post(solicitud(JSON.stringify(moderno), "application/reports+json"));
    expect(r.status).toBe(204);
    expect(eventos).toHaveLength(1);
    expect(JSON.stringify(eventos)).not.toContain("identificable");
  });

  it("rechaza tipos de contenido inesperados con 415", async () => {
    const { post, eventos } = manejador();
    expect((await post(solicitud("{}", "text/plain"))).status).toBe(415);
    expect(eventos).toHaveLength(0);
  });

  it("rechaza cuerpos grandes con 413, aunque no declaren su tamaño", async () => {
    const { post } = manejador();
    const grande = JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(MAX_BYTES_REPORTE) } });
    expect((await post(solicitud(grande))).status).toBe(413);
    expect(
      (await post(solicitud("{}", "application/csp-report", { "content-length": String(MAX_BYTES_REPORTE + 1) })))
        .status,
    ).toBe(413);
  });

  it("rechaza JSON inválido o con formato desconocido con 400", async () => {
    const { post } = manejador();
    expect((await post(solicitud("{no es json"))).status).toBe(400);
    expect((await post(solicitud(JSON.stringify({ a: 1 })))).status).toBe(400);
  });

  it("limita el volumen y avisa una sola vez por ventana", async () => {
    const { post, eventos } = manejador(1);
    expect((await post(solicitud(JSON.stringify(clasico)))).status).toBe(204);
    expect((await post(solicitud(JSON.stringify(clasico)))).status).toBe(429);
    expect((await post(solicitud(JSON.stringify(clasico)))).status).toBe(429);
    expect(eventos.filter((e) => e.tipo === "limite_excedido")).toHaveLength(1);
  });

  it("usa el registro de seguridad por defecto", async () => {
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = crearManejadorReportesCsp();
    await post(solicitud(JSON.stringify(clasico)));
    expect(espia).toHaveBeenCalledTimes(1);
    espia.mockRestore();
  });
});
