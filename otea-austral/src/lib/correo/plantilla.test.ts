import { describe, expect, it } from "vitest";
import { componerCorreo, escapar } from "./plantilla";

describe("armado de correos", () => {
  const correo = componerCorreo("Asunto de prueba", [
    { tipo: "parrafo", texto: "Primer párrafo con <etiqueta> & \"comillas\"." },
    { tipo: "enlace", texto: "Abrir el enlace", url: "https://oteaustral.com/cuenta/activar?token=ABC_def-123" },
    { tipo: "lista", items: ["uno", "dos <b>"] },
  ]);

  it("el texto plano lleva el saludo, los párrafos, el enlace completo y el pie", () => {
    expect(correo.texto).toBe(
      [
        "Hola:",
        "",
        'Primer párrafo con <etiqueta> & "comillas".',
        "",
        "Abrir el enlace:",
        "https://oteaustral.com/cuenta/activar?token=ABC_def-123",
        "",
        "- uno",
        "- dos <b>",
        "",
        "Otea Austral · Inteligencia de eventos para mercados.",
        "Información y análisis. No constituye asesoría financiera.",
      ].join("\n"),
    );
  });

  it("el HTML escapa todo lo que viene de los bloques", () => {
    expect(correo.html).toContain("Primer párrafo con &lt;etiqueta&gt; &amp; &quot;comillas&quot;.");
    expect(correo.html).toContain("<li>dos &lt;b&gt;</li>");
    expect(correo.html).not.toContain("<etiqueta>");
    expect(correo.html).not.toMatch(/<b>/);
    expect(correo.html).toContain('href="https://oteaustral.com/cuenta/activar?token=ABC_def-123"');
    expect(correo.html).toContain("<!doctype html>");
    expect(correo.html).toContain('lang="es"');
  });

  it("escapar cubre los cinco caracteres peligrosos", () => {
    expect(escapar(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  });

  it("rechaza enlaces que no sean https (o http hacia localhost, en desarrollo)", () => {
    const con = (url: string) => () => componerCorreo("a", [{ tipo: "enlace", texto: "t", url }]);
    expect(con("javascript:alert(1)")).toThrow();
    expect(con("data:text/html,<script>")).toThrow();
    expect(con("http://oteaustral.com/x")).toThrow();
    expect(con("ftp://oteaustral.com/x")).toThrow();
    expect(con("no es una url")).toThrow();
    expect(con("http://localhost:3000/cuenta")).not.toThrow();
    expect(con("https://oteaustral.com/cuenta")).not.toThrow();
  });

  it("el enlace con comillas se escapa en el atributo y no puede cerrarlo", () => {
    const c = componerCorreo("a", [{ tipo: "enlace", texto: "t", url: 'https://x.cl/?a="onmouseover="alert(1)' }]);
    expect(c.html).not.toContain('"onmouseover=');
    expect(c.html).toContain("%22onmouseover=%22alert(1)");
  });

  it("el asunto no admite saltos de línea (inyección de cabeceras)", () => {
    expect(() => componerCorreo("Asunto\r\nBcc: otra@persona.cl", [])).toThrow();
    expect(() => componerCorreo("Asunto\nBcc: otra@persona.cl", [])).toThrow();
  });
});
