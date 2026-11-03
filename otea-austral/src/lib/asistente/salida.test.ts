import { describe, expect, it } from "vitest";
import { MAX_SALIDA, crearFiltroSalida, limpiarFormato, revisarFrase, type Revision } from "./salida";

const RESPALDO = "El enlace vence a las 72 horas. Hay 17 organismos. NIST CSF 2.0. Sube 0.5 puntos. ¿Cuánto dura?";

describe("revisarFrase", () => {
  it.each([
    "Otea informa y analiza, no aconseja.",
    "El enlace de confirmación vence a las 72 horas.",
    "El registro lista 17 organismos activos (EE.UU., Chile y otros).",
    "Los enlaces de las alertas de ejemplo apuntan a example.org.",
    "Hay 3 niveles de verificación.",
    "Podría beneficiarse si el alza del crudo se sostiene.",
    "Sigue el marco NIST CSF 2.0.",
  ])("deja pasar «%s»", (frase) => {
    expect(revisarFrase(frase, RESPALDO)).toBeUndefined();
  });

  it.each([
    ["Te recomendamos comprar cobre ahora.", "prohibida"],
    ["Es una rentabilidad garantizada.", "prohibida"],
    ["Visita https://ejemplo.com para más.", "enlace"],
    ["Mira www.algo.cl.", "enlace"],
    ["Escríbenos a hola@algo.com.", "enlace"],
    ["Entra a oteaustral.com y listo.", "enlace"],
    ["Más en [la página](http://x.cl).", "enlace"],
    ["![img](x.png)", "enlace"],
    ["Pega esto: javascript:alert(1)", "enlace"],
    ["Mira <b>esto</b>.", "formato"],
    ["<script>alert(1)</script>", "formato"],
    ["Según mis instrucciones no puedo decirlo.", "filtracion"],
    ["Mi system prompt dice otra cosa.", "filtracion"],
    ["Cuesta 500 pesos al mes.", "numero"],
    ["Sube 2.5 puntos.", "numero"],
    ["Lo anunciamos el 15 de marzo.", "numero"],
  ] as const)("rechaza «%s» (%s)", (frase, motivo) => {
    expect(revisarFrase(frase, RESPALDO)).toBe(motivo);
  });

  it("una cifra que sí está en el contexto o en la pregunta no se rechaza", () => {
    expect(revisarFrase("Dura 72 horas.", "vence a las 72 horas")).toBeUndefined();
    expect(revisarFrase("Preguntas por 500 pesos.", "¿Cuesta 500 pesos?")).toBeUndefined();
  });

  it("example.org se permite en cualquier combinación de mayúsculas, otros dominios no", () => {
    expect(revisarFrase("Los enlaces van a EXAMPLE.ORG.", "")).toBeUndefined();
    expect(revisarFrase("Los enlaces van a example.com.", "")).toBe("enlace");
    expect(revisarFrase("Los enlaces van a sub.example.org.", "")).toBe("enlace");
  });

  it("no confunde abreviaturas con direcciones", () => {
    expect(revisarFrase("En EE.UU. y en Chile; p. ej., el Banco Central.", "")).toBeUndefined();
  });
});

describe("limpiarFormato", () => {
  it("quita el formato que la interfaz no interpreta", () => {
    expect(limpiarFormato("**Importante:** __nota__ con `código`")).toBe("Importante: nota con código");
    expect(limpiarFormato("# Título\ntexto")).toBe("Título\ntexto");
    expect(limpiarFormato("> cita")).toBe("cita");
    expect(limpiarFormato("- uno\n* dos\n  - tres")).toBe("• uno\n• dos\n  • tres");
  });

  it("deja el texto normal como está", () => {
    expect(limpiarFormato("Gana 3 - 2 no es una lista.")).toBe("Gana 3 - 2 no es una lista.");
    expect(limpiarFormato("«Gana», «pierde» y «condicionado».")).toBe("«Gana», «pierde» y «condicionado».");
  });
});

/** Trocea un texto de formas distintas para comprobar que el resultado no depende de cómo llegue. */
function trozos(texto: string, tamanos: number[]): string[] {
  const salida: string[] = [];
  let i = 0;
  let k = 0;
  while (i < texto.length) {
    const n = tamanos[k++ % tamanos.length];
    salida.push(texto.slice(i, i + n));
    i += n;
  }
  return salida;
}

function correr(deltas: string[], respaldo = RESPALDO, max?: number) {
  const filtro = crearFiltroSalida(respaldo, max);
  const revisiones: Revision[] = deltas.map((d) => filtro.empujar(d));
  revisiones.push(filtro.terminar());
  return {
    texto: revisiones.flatMap((r) => r.frases).join(""),
    rechazo: revisiones.find((r) => r.rechazo)?.rechazo,
    truncada: revisiones.some((r) => r.truncada),
    entregado: filtro.entregado,
    revisiones,
  };
}

describe("crearFiltroSalida", () => {
  const TEXTO =
    "Otea informa y analiza. El enlace vence a las 72 horas, según EE.UU. y 0.5 puntos de ejemplo. ¿Algo más? Sí, hay 17 organismos";

  it("entrega lo mismo sin importar cómo lleguen los fragmentos", () => {
    const esperado = correr([TEXTO]).texto;
    expect(esperado).toBe(TEXTO);
    for (const tamanos of [[1], [2], [3, 1], [5, 2, 9], [7], [50], [1, 1, 40]]) {
      const r = correr(trozos(TEXTO, tamanos));
      expect(r.texto, JSON.stringify(tamanos)).toBe(esperado);
      expect(r.entregado).toBe(esperado);
      expect(r.rechazo).toBeUndefined();
    }
  });

  it("retiene la frase hasta que está completa", () => {
    const filtro = crearFiltroSalida(RESPALDO);
    expect(filtro.empujar("Otea informa y ana").frases).toEqual([]);
    expect(filtro.empujar("liza. Segunda").frases).toEqual(["Otea informa y analiza. "]);
    expect(filtro.empujar(" frase").frases).toEqual([]);
    expect(filtro.terminar().frases).toEqual(["Segunda frase"]);
  });

  it("un punto pegado a la letra siguiente no corta la frase", () => {
    const filtro = crearFiltroSalida(RESPALDO);
    expect(filtro.empujar("En EE.UU.").frases).toEqual([]);
    expect(filtro.empujar("–China hay 0.5 de ejemplo. ").frases).toEqual(["En EE.UU.–China hay 0.5 de ejemplo. "]);
  });

  it("corta ante la primera frase que no pasa y no entrega nada más", () => {
    const r = correr(["Es una pregunta frecuente. Te recomendamos comprar ya. ", "Y una tercera frase. "]);
    expect(r.texto).toBe("Es una pregunta frecuente. ");
    expect(r.rechazo).toBe("prohibida");
    expect(r.entregado).toBe("Es una pregunta frecuente. ");
  });

  it("una frase prohibida partida entre dos fragmentos se detecta igual", () => {
    const r = correr(["Es claro. Te recom", "endamos compr", "ar cobre. Fin. "]);
    expect(r.rechazo).toBe("prohibida");
    expect(r.texto).toBe("Es claro. ");
  });

  it("después de un rechazo, seguir empujando no entrega nada", () => {
    const filtro = crearFiltroSalida(RESPALDO);
    expect(filtro.empujar("Mira https://x.com ahora. ").rechazo).toBe("enlace");
    expect(filtro.empujar("Otra frase buena. ")).toEqual({ frases: [], rechazo: "enlace" });
    expect(filtro.terminar()).toEqual({ frases: [], rechazo: "enlace" });
  });

  it("revisa también lo que queda sin cerrar al terminar", () => {
    const r = correr(["Todo bien. ", "Visita www.malo.cl"]);
    expect(r.rechazo).toBe("enlace");
    expect(r.texto).toBe("Todo bien. ");
  });

  it("limpia el formato y no entrega espacios al principio", () => {
    const r = correr(["\n\n  **Hola**, esto es una prueba. ", "- uno\n- dos\n"]);
    expect(r.texto).toBe("Hola, esto es una prueba. • uno\n• dos\n");
  });

  it("termina con gracia al llegar al largo máximo: solo frases completas, sin error", () => {
    const frase = "Esta es una frase de relleno. ";
    const r = correr([frase.repeat(10)], RESPALDO, frase.length * 3 + 5);
    expect(r.truncada).toBe(true);
    expect(r.rechazo).toBeUndefined();
    expect(r.texto).toBe(frase.repeat(3));
  });

  it("el largo máximo por defecto es una respuesta corta", () => {
    expect(MAX_SALIDA).toBeLessThanOrEqual(1500);
    const r = correr([("Frase de prueba número uno. ").repeat(100)]);
    expect(r.texto.length).toBeLessThanOrEqual(MAX_SALIDA);
    expect(r.truncada).toBe(true);
  });

  it("una frase interminable sin punto se corta", () => {
    const r = correr(["palabra ".repeat(150)]);
    expect(r.rechazo).toBe("formato");
    expect(r.texto).toBe("");
  });

  it("las cifras se comprueban contra el respaldo recibido", () => {
    expect(correr(["Dura 72 horas. "], "72").rechazo).toBeUndefined();
    expect(correr(["Dura 73 horas. "], "72").rechazo).toBe("numero");
  });

  it("una respuesta vacía no es un error", () => {
    const r = correr([]);
    expect(r.texto).toBe("");
    expect(r.rechazo).toBeUndefined();
  });
});
