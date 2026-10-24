import { describe, expect, it } from "vitest";
import { httpsUrl, parseHttpsUrl, safeHref } from "./url";

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
