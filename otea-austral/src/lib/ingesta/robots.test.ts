import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTE_ROBOTS, permitePorRobots, reglasPara, rutaPermitida } from "./robots";

const FIXTURE = readFileSync(
  path.resolve(__dirname, "../../../e2e/fixtures/fuentes/fuente-prueba.example.org/robots.txt"),
  "utf8",
);

const permite = (texto: string, ruta: string, agente = AGENTE_ROBOTS) => rutaPermitida(reglasPara(texto, agente), ruta);

describe("robots.txt (RFC 9309)", () => {
  it.each([
    // [robots.txt, ruta, ¿permitido?]
    ["", "/feed.xml", true],
    ["User-agent: *\nDisallow: /", "/feed.xml", false],
    ["User-agent: *\nDisallow:", "/feed.xml", true],
    ["User-agent: *\nDisallow: /privado", "/privado/feed.xml", false],
    ["User-agent: *\nDisallow: /privado", "/privadox", false],
    ["User-agent: *\nDisallow: /privado/", "/privado", true],
    ["User-agent: *\nDisallow: /\nAllow: /feeds/", "/feeds/rss.xml", true],
    ["User-agent: *\nDisallow: /feeds/\nAllow: /feeds", "/feeds/rss.xml", false],
    ["User-agent: *\nAllow: /a\nDisallow: /a", "/a/b", true],
    ["User-agent: *\nDisallow: /*.pdf$", "/docs/informe.pdf", false],
    ["User-agent: *\nDisallow: /*.pdf$", "/docs/informe.pdf?v=1", true],
    ["User-agent: *\nDisallow: /*?", "/feed.xml?x=1", false],
    ["User-agent: *\nDisallow: /a*b*c", "/a-x-b-y-c-z", false],
    ["User-agent: *\nDisallow: /", "/robots.txt", true],
    ["Disallow: /\nUser-agent: *\nAllow: /", "/feed.xml", true],
    ["User-agent: OtroRobot\nDisallow: /", "/feed.xml", true],
    ["User-agent: OTEAAUSTRAL\nDisallow: /x\nUser-agent: *\nDisallow: /", "/feed.xml", true],
    ["User-agent: OteaAustral/1.0\nDisallow: /", "/feed.xml", false],
    ["User-agent: otro\nUser-agent: OteaAustral\nDisallow: /f\n\nUser-agent: *\nAllow: /", "/feed.xml", false],
    ["User-agent: OteaAustral # comentario\nDisallow: /f # otro\nSitemap: https://x.example.org/s.xml\nCrawl-delay: 5", "/feed", false],
    ["User-agent: OteaAustral\nDisallow: /a\n\nUser-agent: OteaAustral\nDisallow: /b", "/b/c", false],
    ["user-agent: *\r\ndisallow: /x\r\n", "/x", false],
  ])("%j · %s → %s", (texto, ruta, esperado) => {
    expect(permite(texto, ruta)).toBe(esperado);
  });

  it("el fixture: nuestro grupo manda sobre el de «*» (que prohíbe todo)", () => {
    expect(permite(FIXTURE, "/canal.rss.xml")).toBe(true);
    expect(permite(FIXTURE, "/privado/canal.rss.xml")).toBe(false);
    expect(permite(FIXTURE, "/privado/abierto/canal.rss.xml")).toBe(true);
    expect(permite(FIXTURE, "/avisos/a.pdf")).toBe(false);
    expect(permite(FIXTURE, "/canal.rss.xml", "OtroAgente")).toBe(false);
  });

  it("permitePorRobots mira la ruta y la consulta de la URL", () => {
    const texto = "User-agent: *\nDisallow: /*?privado";
    expect(permitePorRobots(texto, new URL("https://x.example.org/feed?privado=1"))).toBe(false);
    expect(permitePorRobots(texto, new URL("https://x.example.org/feed"))).toBe(true);
  });

  it("un patrón adversario con muchos comodines no se cuelga (sin retroceso exponencial)", () => {
    const patron = `/${"*a".repeat(200)}b`;
    const texto = `User-agent: *\nDisallow: ${patron}`;
    const ruta = `/${"a".repeat(2000)}`;
    const inicio = performance.now();
    expect(permite(texto, ruta)).toBe(true);
    expect(performance.now() - inicio).toBeLessThan(2_000);
  });

  it("acota patrones largos y el número de reglas", () => {
    const largo = `User-agent: *\nDisallow: /${"x".repeat(600)}`;
    expect(reglasPara(largo)).toEqual([]);
    const muchas = `User-agent: *\n${Array.from({ length: 5_000 }, (_, i) => `Disallow: /r${i}`).join("\n")}`;
    expect(reglasPara(muchas)).toHaveLength(1_000);
  });
});
