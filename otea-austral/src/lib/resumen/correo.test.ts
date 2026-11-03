import { describe, expect, it } from "vitest";
import { AVISO_NO_ASESORIA, correoResumen, enlaceBaja } from "./correo";
import { MAXIMO_EN_CORREO, type AlertaParaResumen } from "./seleccion";

const TOKEN = "A".repeat(43);
/** DATOS DE PRUEBA: alertas ficticias (títulos «(prueba)»). */
const alerta = (i: number, extra: Partial<AlertaParaResumen> = {}): AlertaParaResumen => ({
  id: `id-${i}`,
  tema: "cobre",
  evento: `Evento ${i} de las pruebas (prueba)`,
  confianza: "alta",
  publicada: "2026-10-30T10:00:00.000Z",
  estado: "publicada",
  es_ejemplo: false,
  ...extra,
});

describe("correo del resumen diario", () => {
  const c = correoResumen([alerta(1), alerta(2, { tema: "divisas", confianza: "baja" })], "https://oteaustral.com", TOKEN);

  it("lleva el título de Otea, el tema y la confianza de cada alerta, y el enlace a /alertas", () => {
    expect(c.asunto).toBe("Tu resumen de Otea Austral: 2 alertas en tus temas");
    expect(c.texto).toContain("- Cobre · confianza alta · Evento 1 de las pruebas (prueba)");
    expect(c.texto).toContain("- Divisas · confianza baja · Evento 2 de las pruebas (prueba)");
    expect(c.texto).toContain("Ver las alertas:\nhttps://oteaustral.com/alertas");
  });

  it("dice que es información y análisis, no asesoría, por qué llega y cómo dejarlo con un clic", () => {
    expect(AVISO_NO_ASESORIA).toBe("Información y análisis; no es asesoría.");
    expect(c.texto).toContain(AVISO_NO_ASESORIA);
    expect(c.html).toContain(AVISO_NO_ASESORIA);
    expect(c.texto).toMatch(/pediste el resumen diario en tu perfil/);
    const baja = enlaceBaja("https://oteaustral.com", TOKEN);
    expect(baja).toBe(`https://oteaustral.com/api/resumen/baja?t=${TOKEN}`);
    expect(c.texto).toContain(baja);
    expect(c.cabeceras).toEqual({ "List-Unsubscribe": `<${baja}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("no lleva texto de fuentes, enlaces a ellas, datos de pago, nombres ni lenguaje de recomendación", () => {
    const enlaces = [...c.texto.matchAll(/https?:\/\/\S+/g)].map((m) => new URL(m[0]).pathname);
    expect(enlaces.sort()).toEqual(["/alertas", "/api/resumen/baja"]);
    expect(`${c.texto}\n${c.html}`).not.toMatch(/example\.org|resumen:|Mercado Pago|tarjeta|recomendamos|compra ahora|rentabilidad/i);
    expect(c.texto.startsWith("Hola:\n")).toBe(true);
  });

  it("escapa el título en el HTML, lista como mucho 12 y cuenta el resto; sin alertas no hay correo", () => {
    const raro = correoResumen([alerta(1, { evento: 'Tasa <script>alert("x")</script> (prueba)' })], "https://oteaustral.com", TOKEN);
    expect(raro.asunto).toBe("Tu resumen de Otea Austral: 1 alerta en tus temas");
    expect(raro.html).not.toContain("<script>");
    expect(raro.html).toContain("&lt;script&gt;");
    const muchas = correoResumen(Array.from({ length: 15 }, (_, i) => alerta(i)), "https://oteaustral.com", TOKEN);
    expect(muchas.texto.match(/^- /gm)).toHaveLength(MAXIMO_EN_CORREO);
    expect(muchas.texto).toContain("Y 3 más en la página de alertas.");
    expect(() => correoResumen([], "https://oteaustral.com", TOKEN)).toThrow();
  });
});
