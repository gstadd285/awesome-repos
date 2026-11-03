import { describe, expect, it } from "vitest";
import { dentroDelDominio, httpsUrl, parseHttpsUrl, safeHref } from "./url";

describe("dentroDelDominio", () => {
  const base = "https://www.bcentral.cl/";

  it.each([
    "https://www.bcentral.cl/rss/comunicados.xml",
    "https://bcentral.cl/feed",
    "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx",
    "https://WWW.BCENTRAL.CL/mayusculas",
  ])("acepta %s", (url) => {
    expect(dentroDelDominio(url, base)).toBe(true);
  });

  it.each([
    ["otro dominio", "https://example.org/feed"],
    ["sufijo engañoso", "https://bcentral.cl.example.org/feed"],
    ["prefijo engañoso", "https://falsobcentral.cl/feed"],
    ["http sin cifrar", "http://www.bcentral.cl/feed"],
    ["con credenciales", "https://usuario:clave@www.bcentral.cl/feed"],
    ["no es una URL", "bcentral.cl/feed"],
  ])("rechaza %s", (_, url) => {
    expect(dentroDelDominio(url, base)).toBe(false);
  });

  it("solo quita `www.` de la base: un host hermano no vale", () => {
    expect(dentroDelDominio("https://fiscaldata.treasury.gov/api", "https://home.treasury.gov/")).toBe(false);
    expect(dentroDelDominio("https://home.treasury.gov/news", "https://home.treasury.gov/")).toBe(true);
  });

  it("sin base válida no acepta nada", () => {
    expect(dentroDelDominio("https://www.bcentral.cl/", "")).toBe(false);
  });
});

describe("httpsUrl", () => {
  it.each([
    "https://www.bcentral.cl/",
    "https://example.org/informe?id=12#seccion",
    "HTTPS://EXAMPLE.ORG/mayusculas",
  ])("acepta %s", (url) => {
    expect(httpsUrl.safeParse(url).success).toBe(true);
  });

  it.each([
    ["http sin cifrar", "http://example.org/"],
    ["javascript:", "javascript:alert(1)"],
    ["javascript: con mayúsculas", "JaVaScRiPt:alert(1)"],
    ["data:", "data:text/html;base64,PHNjcmlwdD4="],
    ["file:", "file:///etc/passwd"],
    ["ftp:", "ftp://example.org/"],
    ["relativa", "/fuentes"],
    ["sin esquema", "example.org"],
    ["con credenciales", "https://usuario:clave@example.org/"],
    ["con espacios al borde", " https://example.org/"],
    ["vacía", ""],
  ])("rechaza %s", (_, url) => {
    expect(httpsUrl.safeParse(url).success).toBe(false);
  });

  it("rechaza URLs demasiado largas", () => {
    expect(parseHttpsUrl(`https://example.org/${"a".repeat(2100)}`)).toBeNull();
  });
});

describe("safeHref", () => {
  it("devuelve la URL normalizada si es https", () => {
    expect(safeHref("https://example.org")).toBe("https://example.org/");
  });

  it("devuelve undefined para cualquier otro esquema", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
  });
});
