import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIMITES_LECTURA,
  decodificar,
  fechaFeed,
  leerFeed,
  leerJson,
  leerXml,
  limpiarTitulo,
  normalizarItem,
  profundidadJson,
  type ItemCrudo,
} from "./feeds";

/** Fixtures sintéticos de prueba (no son feeds reales): `e2e/fixtures/fuentes/`. */
const fixture = (ruta: string) =>
  readFileSync(path.resolve(__dirname, "../../../e2e/fixtures/fuentes/fuente-prueba.example.org", ruta), "utf8");

const MARCA = "TEXTO-DE-LA-FUENTE-NO-SE-GUARDA";
const AHORA = new Date("2026-10-25T12:00:00Z");
const contexto = {
  urlFeed: "https://fuente-prueba.example.org/canal.rss.xml",
  urlBase: "https://fuente-prueba.example.org/",
  ahora: AHORA,
};
const normalizar = (items: ItemCrudo[]) => items.map((i) => normalizarItem(i, contexto));

function exitoso(lectura: ReturnType<typeof leerFeed>): ItemCrudo[] {
  if (!lectura.ok) throw new Error(`lectura fallida: ${lectura.codigo}`);
  return lectura.items;
}

describe("RSS 2.0 (fixture sintético)", () => {
  const crudos = exitoso(leerXml(fixture("canal.rss.xml"), "rss"));

  it("lee los siete ítems y solo título, enlace, guid y fecha: la description no se lee", () => {
    expect(crudos).toHaveLength(7);
    for (const item of crudos) expect(Object.keys(item).sort()).toEqual(["enlace", "fecha", "guid", "titulo"]);
    expect(JSON.stringify(crudos)).not.toContain(MARCA);
    expect(JSON.stringify(crudos)).not.toContain("Canal de prueba");
  });

  it("limpia, valida y descarta: fuera del dominio, sin https y sin título no pasan", () => {
    const items = normalizar(crudos);
    expect(items.map((i) => i?.url ?? null)).toEqual([
      "https://fuente-prueba.example.org/comunicados/2026/prueba-1",
      "https://fuente-prueba.example.org/informes/prueba-2/?utm_source=rss&utm_medium=feed&id=2#arriba",
      null, // otro-dominio.example.net
      "https://fuente-prueba.example.org/avisos/prueba-4", // relativo, resuelto contra el feed
      null, // http
      "https://fuente-prueba.example.org/comunicados/2026/prueba-6", // guid como enlace permanente
      null, // sin título
    ]);
    expect(items[0]).toEqual({
      titulo: "Comunicado de prueba 1 (ejemplo): decisión de tasa",
      url: "https://fuente-prueba.example.org/comunicados/2026/prueba-1",
      guid: "prueba-2026-001",
      identificador: "prueba-2026-001",
      publicado: new Date("2026-10-20T17:30:00Z"),
    });
    expect(items[1]?.titulo).toBe("Informe de prueba 2 (ejemplo) & anexo");
    expect(items[1]?.publicado).toEqual(new Date("2026-10-21T09:00:00Z"));
    expect(items[3]?.titulo).toBe("Título con HTML escapado, invisibles y tabulación");
  });

  it("una fecha inválida (31 de febrero, formato que no es RFC 822) no descarta el ítem: queda sin fecha", () => {
    const items = normalizar(crudos);
    expect(items[3]?.publicado).toBeNull();
    expect(items[5]?.publicado).toBeNull();
  });
});

describe("Atom 1.0 (fixture sintético)", () => {
  const crudos = exitoso(leerXml(fixture("canal.atom.xml"), "atom"));
  const items = normalizar(crudos);

  it("lee título, enlace alternate, id y published; ni summary ni content", () => {
    expect(crudos).toHaveLength(2);
    expect(JSON.stringify(crudos)).not.toContain(MARCA);
    expect(items[0]).toEqual({
      titulo: "Aviso de prueba A (ejemplo) & mercado",
      url: "https://fuente-prueba.example.org/avisos/a",
      guid: "tag:fuente-prueba.example.org,2026:aviso-a",
      identificador: "tag:fuente-prueba.example.org,2026:aviso-a",
      publicado: new Date("2026-10-23T13:15:00Z"),
    });
  });

  it("título xhtml, enlace sin rel en un subdominio y fecha con mes 13 (inválida)", () => {
    expect(items[1]).toMatchObject({ titulo: "Aviso de prueba B (ejemplo)", url: "https://www.fuente-prueba.example.org/avisos/b", publicado: null });
  });

  it("el formato declarado en el registro debe coincidir con el documento", () => {
    expect(leerXml(fixture("canal.atom.xml"), "rss")).toEqual({ ok: false, codigo: "formato" });
    expect(leerXml(fixture("canal.rss.xml"), "atom")).toEqual({ ok: false, codigo: "formato" });
    expect(leerXml("<html><body>no es un feed</body></html>", "rss")).toEqual({ ok: false, codigo: "formato" });
  });
});

describe("JSON Feed para el formato «api» (fixture sintético)", () => {
  it("lee id, url, title y fecha; descarta enlaces peligrosos y entradas que no son objetos", () => {
    const crudos = exitoso(leerFeed(fixture("api.json"), "api"));
    expect(crudos).toHaveLength(3);
    expect(JSON.stringify(crudos)).not.toContain(MARCA);
    const items = normalizar(crudos);
    expect(items[0]).toMatchObject({ titulo: "Serie de prueba 1 (ejemplo)", guid: "api-001", publicado: new Date("2026-10-24T08:00:00Z") });
    expect(items[1]).toMatchObject({ guid: "2", publicado: null });
    expect(items[2]).toBeNull();
  });

  it("rechaza JSON mal formado, de otra forma o demasiado profundo (medido antes de JSON.parse)", () => {
    expect(leerJson("{ no es json")).toEqual({ ok: false, codigo: "mal_formado" });
    expect(leerJson('{"items": []}')).toEqual({ ok: false, codigo: "formato" });
    expect(leerJson('{"version": "https://jsonfeed.org/version/1.1", "items": {}}')).toEqual({ ok: false, codigo: "formato" });
    const profundo = `{"version":"https://jsonfeed.org/version/1.1","items":[${"[".repeat(40)}${"]".repeat(40)}]}`;
    expect(leerJson(profundo)).toEqual({ ok: false, codigo: "profundidad" });
    // Diez mil niveles: nunca llega a JSON.parse.
    expect(leerJson("[".repeat(10_000))).toEqual({ ok: false, codigo: "profundidad" });
  });

  it("la profundidad ignora corchetes dentro de cadenas (con comillas escapadas)", () => {
    expect(profundidadJson('{"a": "[[[[[[\\"]]]]", "b": [1, [2]]}')).toBe(3);
  });

  it("rechaza un documento gigante sin analizarlo", () => {
    expect(leerJson(`"${"x".repeat(LIMITES_LECTURA.caracteres)}"`)).toEqual({ ok: false, codigo: "tamano" });
  });
});

describe("casos malignos (XML)", () => {
  it("XXE: un DOCTYPE con entidad externa se rechaza antes de analizar (fixture)", () => {
    expect(leerXml(fixture("xxe.rss.xml"), "rss")).toEqual({ ok: false, codigo: "dtd" });
  });

  it("bomba de entidades (mil millones de risas) se rechaza sin expandir nada (fixture)", () => {
    const inicio = performance.now();
    expect(leerXml(fixture("bomba.rss.xml"), "rss")).toEqual({ ok: false, codigo: "dtd" });
    expect(performance.now() - inicio).toBeLessThan(500);
  });

  it("cualquier declaración de DTD, también en minúsculas o sin DOCTYPE, se rechaza", () => {
    for (const malo of [
      '<!doctype rss><rss version="2.0"/>',
      '<!ENTITY x "y"><rss version="2.0"/>',
      '<rss version="2.0"><!ELEMENT x ANY></rss>',
      '<rss version="2.0"><channel><! foo></channel></rss>',
    ]) {
      expect(leerXml(malo, "rss"), malo).toEqual({ ok: false, codigo: "dtd" });
    }
  });

  it("una entidad con nombre que no está definida queda como texto literal: nunca se expande", () => {
    const xml = '<rss version="2.0"><channel><item><title>A &lol9; B &amp; C &#65;</title><link>https://fuente-prueba.example.org/x</link></item></channel></rss>';
    expect(exitoso(leerXml(xml, "rss"))[0].titulo).toBe("A &lol9; B & C A");
  });

  it("un documento gigante se rechaza por tamaño", () => {
    const gigante = `<rss version="2.0"><channel>${"<item/>".repeat(LIMITES_LECTURA.caracteres / 7 + 10)}</channel></rss>`;
    expect(leerXml(gigante, "rss")).toEqual({ ok: false, codigo: "tamano" });
  });

  it("límites de profundidad, de elementos y de atributos", () => {
    const profundo = `<rss version="2.0">${"<a>".repeat(40)}${"</a>".repeat(40)}</rss>`;
    expect(leerXml(profundo, "rss")).toEqual({ ok: false, codigo: "profundidad" });
    const muchos = `<rss version="2.0"><channel>${"<x/>".repeat(LIMITES_LECTURA.elementos + 1)}</channel></rss>`;
    expect(leerXml(muchos, "rss")).toEqual({ ok: false, codigo: "elementos" });
    const atributos = Array.from({ length: 70 }, (_, i) => `a${i}="1"`).join(" ");
    expect(leerXml(`<rss version="2.0" ${atributos}/>`, "rss")).toEqual({ ok: false, codigo: "elementos" });
  });

  it("como mucho 200 ítems por feed", () => {
    const item = "<item><title>T (ejemplo)</title><link>https://fuente-prueba.example.org/i</link></item>";
    expect(exitoso(leerXml(`<rss version="2.0"><channel>${item.repeat(300)}</channel></rss>`, "rss"))).toHaveLength(200);
  });

  it.each([
    ['<rss version="2.0"><channel>', "sin cerrar"],
    ['<rss version="2.0"><channel></rss></channel>', "cierres cruzados"],
    ['<rss version="2.0"><item title=sin-comillas/></rss>', "atributo sin comillas"],
    ['<rss version="2.0"/><rss version="2.0"/>', "dos raíces"],
    ['texto suelto <rss version="2.0"/>', "texto fuera de la raíz"],
    ['<rss version="2.0"><!-- sin fin </rss>', "comentario sin cerrar"],
    ['<rss version="2.0"><channel><item><title><![CDATA[x</title></item></channel></rss>', "CDATA sin cerrar"],
  ])("rechaza XML mal formado: %s (%s)", (xml) => {
    expect(leerXml(xml, "rss")).toEqual({ ok: false, codigo: "mal_formado" });
  });
});

describe("títulos", () => {
  it("decodifica HTML escapado, quita etiquetas, controles e invisibles y compacta espacios", () => {
    const invisibles = [0x200b, 0x202e, 0x2066, 0xfeff, 0x07].map((c) => String.fromCodePoint(c)).join("");
    expect(limpiarTitulo(`  &lt;b&gt;Alza&lt;/b&gt;${invisibles} del&nbsp;cobre &#39;hoy&#39;\n\t `)).toBe("Alza del cobre 'hoy'");
  });

  it("corta en 300 caracteres contados como puntos de código (como char_length de Postgres)", () => {
    const emoji = String.fromCodePoint(0x1f4c8);
    const largo = limpiarTitulo(emoji.repeat(400));
    expect(Array.from(largo)).toHaveLength(300);
    expect(limpiarTitulo("a".repeat(301))).toHaveLength(300);
  });
});

describe("fechas declaradas por el feed", () => {
  it.each([
    ["Tue, 20 Oct 2026 14:30:00 -0300", "2026-10-20T17:30:00.000Z"],
    ["20 Oct 2026 14:30 GMT", "2026-10-20T14:30:00.000Z"],
    ["Tue, 20 Oct 26 14:30:00 EST", "2026-10-20T19:30:00.000Z"],
    ["2026-10-20T14:30:00Z", "2026-10-20T14:30:00.000Z"],
    ["2026-10-20T14:30:00.123456-03:00", "2026-10-20T17:30:00.000Z"],
    ["2026-10-20 14:30:00+00:00", "2026-10-20T14:30:00.000Z"],
  ])("%s → %s", (valor, esperada) => {
    expect(fechaFeed(valor, AHORA)?.toISOString()).toBe(esperada);
  });

  it.each([
    "Mon, 31 Feb 2026 10:00:00 GMT",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-10-20T25:00:00Z",
    "2026-10-20",
    "ayer",
    "20 Foo 2026 10:00 GMT",
    "20 Oct 2026 10:00 XYZ",
    "2026-10-20T10:00:00+99:00",
    "1990-01-01T00:00:00Z",
    "2030-01-01T00:00:00Z",
    "",
  ])("inválida o fuera de rango: %s", (valor) => {
    expect(fechaFeed(valor, AHORA)).toBeNull();
  });
});

describe("codificación", () => {
  const texto = "Decisión";
  it("usa el charset del tipo de contenido o el de la declaración XML; solo UTF-8 y Latin-1", () => {
    expect(decodificar(new TextEncoder().encode(texto), "application/rss+xml; charset=utf-8")).toBe(texto);
    const latin1 = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
    expect(decodificar(latin1, "text/xml; charset=ISO-8859-1")).toBe(texto);
    const declarado = Uint8Array.from([...`<?xml version="1.0" encoding="iso-8859-1"?>${texto}`].map((c) => c.charCodeAt(0)));
    expect(decodificar(declarado, "application/xml")).toContain(texto);
    expect(decodificar(new TextEncoder().encode(texto), "text/xml; charset=shift_jis")).toBeNull();
  });
});
