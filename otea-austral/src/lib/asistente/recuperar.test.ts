import { describe, expect, it } from "vitest";
import { BASE_CONOCIMIENTO, type Entrada } from "./conocimiento";
import { PUNTAJE_MINIMO, palabrasDesconocidas, recuperar } from "./recuperar";

/** Preguntas como las escribiría la gente → entradas que pueden responderlas (la primera debe ser la mejor). */
const ESPERADAS: [string, string[]][] = [
  ["¿Cómo calculan la confianza?", ["confianza"]],
  ["que tan confiable es una alerta", ["confianza"]],
  ["como se calcula el nivel de confianza", ["confianza"]],
  ["qué significa confianza alta, media o baja", ["confianza"]],
  ["que es una fuente primaria", ["confianza", "fuentes", "verificacion"]],
  ["¿Qué niveles de verificación hay?", ["verificacion"]],
  ["como verifican la informacion", ["verificacion", "fuentes"]],
  ["¿Qué fuentes usan?", ["fuentes"]],
  ["de donde sacan la informacion", ["fuentes"]],
  ["usan datos del banco central", ["fuentes"]],
  ["¿Qué exigen antes de publicar una alerta?", ["publicar"]],
  ["quien aprueba las alertas", ["publicar"]],
  ["hay revision humana antes de publicar", ["publicar"]],
  ["que es el impacto de una alerta", ["impacto"]],
  ["cuando una alerta es de impacto alto", ["impacto", "publicar"]],
  ["¿Qué pasa si una alerta es un error?", ["correcciones"]],
  ["pueden borrar una alerta", ["correcciones"]],
  ["se equivocan a veces", ["correcciones"]],
  ["como corrigen los errores", ["correcciones"]],
  ["que es una retractacion", ["correcciones"]],
  ["usan noticias", ["prensa"]],
  ["se basan en la prensa", ["prensa"]],
  ["¿Esto es asesoría financiera?", ["asesoria"]],
  ["son asesores financieros", ["asesoria"]],
  ["¿Qué debo comprar o vender?", ["recomendaciones"]],
  ["me recomiendan comprar cobre", ["recomendaciones"]],
  ["en que invierto", ["recomendaciones"]],
  ["conviene invertir en bitcoin", ["recomendaciones"]],
  ["¿Predicen precios?", ["predicciones"]],
  ["garantizan ganancias", ["predicciones"]],
  ["aciertan en sus pronosticos", ["predicciones"]],
  ["¿Dan cotizaciones en tiempo real?", ["tiempo-real"]],
  ["muestran precios en vivo", ["tiempo-real"]],
  ["¿Qué datos guardan de mí?", ["datos-personales"]],
  ["usan cookies", ["datos-personales"]],
  ["venden mis datos", ["datos-personales"]],
  ["puedo borrar mis datos", ["datos-personales"]],
  ["guardan mis preguntas", ["preguntas-al-asistente"]],
  ["eres una ia", ["preguntas-al-asistente"]],
  ["quien lee lo que escribo aqui", ["preguntas-al-asistente"]],
  ["usan inteligencia artificial", ["preguntas-al-asistente"]],
  ["¿Es seguro el sitio?", ["seguridad"]],
  ["tienen ciberseguridad", ["seguridad"]],
  ["como reporto un error del sitio", ["reportar"]],
  ["como contacto al equipo", ["reportar", "quien-esta-detras"]],
  ["a quien aviso si algo falla", ["reportar"]],
  ["¿Quién está detrás de Otea Austral?", ["quien-esta-detras"]],
  ["quienes son los creadores", ["quien-esta-detras"]],
  ["quien es el responsable", ["quien-esta-detras"]],
  ["¿Cuáles son los términos de uso?", ["textos-legales"]],
  ["¿Dónde están las condiciones de uso?", ["textos-legales"]],
  ["¿Tienen verificación en dos pasos?", ["dos-pasos"]],
  ["hay 2fa", ["dos-pasos"]],
  ["puedo crear una cuenta", ["cuenta"]],
  ["como inicio sesion", ["cuenta"]],
  ["quiero entrar a mi cuenta", ["cuenta"]],
  ["como elimino mi cuenta", ["cuenta"]],
  ["puedo descargar mis datos", ["cuenta", "datos-personales"]],
  ["hay login", ["cuenta"]],
  ["olvide mi contrasena", ["olvide-contrasena"]],
  ["¿Cómo recupero mi contraseña?", ["olvide-contrasena"]],
  ["perdi mi telefono y tengo el autenticador", ["olvide-contrasena", "dos-pasos"]],
  ["no puedo entrar a mi cuenta", ["olvide-contrasena", "cuenta"]],
  ["puedo activar la verificacion en dos pasos en mi cuenta", ["dos-pasos", "cuenta"]],
  ["que son los codigos de recuperacion", ["olvide-contrasena", "dos-pasos"]],
  ["como verifican mi correo", ["dos-pasos", "lista-de-espera"]],
  ["necesito aceptar las condiciones para inscribirme", ["lista-de-espera", "textos-legales"]],
  ["donde esta el aviso legal", ["textos-legales"]],
  ["¿Qué es Otea Austral?", ["que-es"]],
  ["para que sirve esto", ["que-es"]],
  ["de que trata esta plataforma", ["que-es"]],
  ["¿Cómo funciona?", ["como-funciona"]],
  ["como se usa", ["como-funciona"]],
  ["¿Para quién es Otea?", ["para-quien"]],
  ["pueden usarlo personas de otros paises", ["para-quien"]],
  ["¿Cuándo lanzan?", ["lanzamiento"]],
  ["ya esta disponible", ["lanzamiento"]],
  ["cuando abren", ["lanzamiento"]],
  ["¿Cómo me uno a la lista de espera?", ["lista-de-espera"]],
  ["como me inscribo", ["lista-de-espera"]],
  ["quiero dejar mi correo", ["lista-de-espera"]],
  ["¿Cuánto cuesta?", ["precio"]],
  ["es gratis", ["precio"]],
  ["tiene planes de pago", ["precio"]],
  ["¿Las alertas que veo son reales?", ["alertas-de-ejemplo"]],
  ["los datos son de verdad", ["alertas-de-ejemplo"]],
  ["son ejemplos", ["alertas-de-ejemplo"]],
  ["¿Qué significa «condicionado»?", ["gana-pierde-condicionado"]],
  ["que quiere decir gana y pierde", ["gana-pierde-condicionado"]],
  ["quien gana y quien pierde", ["gana-pierde-condicionado"]],
  ["¿Qué temas cubren?", ["temas"]],
  ["hablan de aranceles", ["temas", "ejemplo-chips"]],
  ["¿Qué dice la alerta de ejemplo sobre el estrecho de Ormuz?", ["ejemplo-ormuz"]],
  ["que pasa en ormuz", ["ejemplo-ormuz"]],
  ["que dice la alerta de ejemplo del cobre", ["ejemplo-cobre"]],
  ["restricciones a la exportacion de chips", ["ejemplo-chips"]],
  ["que sectores ganan si sube el petroleo", ["ejemplo-ormuz", "temas", "gana-pierde-condicionado"]],
];

/** Fuera de tema: no deben alcanzar el mínimo. */
const AJENAS = [
  "cual es la capital de francia", "escribe un poema sobre el mar", "como cocino arroz", "cual es el mejor celular",
  "cuanto es 2 mas 2", "hola", "gracias", "tienen app movil", "dame una receta de pastel", "traduce esto al ingles",
  "quien gano el mundial", "cuentame un chiste", "programa un script en python", "que hora es", "como esta el clima hoy",
  "dime la historia de roma", "quien es el presidente", "ayudame con mi tarea de matematicas", "dame consejos de salud",
  "cuantos habitantes tiene chile", "asdf qwer zxcv", "1234567", "?????",
];

describe("recuperar", () => {
  it.each(ESPERADAS)("«%s» → %j", (pregunta, ids) => {
    const [mejor] = recuperar(pregunta);
    expect(mejor, pregunta).toBeDefined();
    expect(ids, `${pregunta} → ${mejor?.entrada.id} (${mejor?.puntaje.toFixed(2)})`).toContain(mejor!.entrada.id);
    expect(mejor!.puntaje).toBeGreaterThanOrEqual(PUNTAJE_MINIMO);
  });

  it.each(AJENAS)("«%s» no encuentra nada que responda", (pregunta) => {
    const [mejor] = recuperar(pregunta);
    expect(mejor?.puntaje ?? 0, `${pregunta} → ${mejor?.entrada.id}`).toBeLessThan(PUNTAJE_MINIMO);
  });

  it("no distingue tildes, mayúsculas ni signos", () => {
    const a = recuperar("¿CÓMO CALCULAN LA CONFIANZA DE UNA ALERTA?");
    const b = recuperar("como calculan la confianza de una alerta");
    expect(a.map((c) => c.entrada.id)).toEqual(b.map((c) => c.entrada.id));
    expect(a[0].puntaje).toBeCloseTo(b[0].puntaje, 10);
  });

  it("ordena de mayor a menor, con puntajes entre 0 y 1 y sin repetir entradas", () => {
    const r = recuperar("fuentes de las alertas y su confianza", undefined, 10);
    expect(r.length).toBeGreaterThan(1);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].puntaje).toBeGreaterThanOrEqual(r[i].puntaje);
    for (const c of r) {
      expect(c.puntaje).toBeGreaterThan(0);
      expect(c.puntaje).toBeLessThanOrEqual(1);
    }
    expect(new Set(r.map((c) => c.entrada.id)).size).toBe(r.length);
  });

  it("respeta el máximo pedido", () => {
    expect(recuperar("alertas", undefined, 2).length).toBeLessThanOrEqual(2);
  });

  it("una consulta vacía o sin palabras con contenido no encuentra nada", () => {
    expect(recuperar("")).toEqual([]);
    expect(recuperar("¿y eso?")).toEqual([]);
    expect(recuperar("   ")).toEqual([]);
  });

  it("es determinista", () => {
    const a = recuperar("que significa gana");
    const b = recuperar("que significa gana");
    expect(a).toEqual(b);
  });

  it("una palabra desconocida resta: una sola coincidencia suelta no basta", () => {
    const sola = recuperar("fuentes")[0].puntaje;
    const conRuido = recuperar("fuentes del pastel de manzana con canela")[0].puntaje;
    expect(conRuido).toBeLessThan(sola);
    expect(conRuido).toBeLessThan(PUNTAJE_MINIMO);
  });

  it("funciona con una base propia y no mira otra", () => {
    const base: Entrada[] = [
      { id: "uno", pregunta: "¿Cuánto mide el puente?", respuesta: "Mide cien metros.", etiquetas: ["largo"], fuentes: [] },
      { id: "dos", pregunta: "¿De qué color es el techo?", respuesta: "Es rojo.", etiquetas: ["pintura"], fuentes: [] },
    ];
    expect(recuperar("de que color es el techo", base)[0].entrada.id).toBe("dos");
    expect(recuperar("cuanto mide el largo del puente", base)[0].entrada.id).toBe("uno");
    expect(recuperar("confianza", base)).toEqual([]);
  });

  it("una pregunta del largo máximo se resuelve en milisegundos", () => {
    const larga = "alerta fuentes confianza verificacion ".repeat(14).slice(0, 500);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) recuperar(larga);
    expect((performance.now() - t0) / 50).toBeLessThan(20);
  });

  it("la base real tiene suficiente cobertura", () => {
    expect(BASE_CONOCIMIENTO.length).toBeGreaterThanOrEqual(25);
  });
});

describe("palabrasDesconocidas", () => {
  it("lista las raíces que ninguna entrada de la base conoce", () => {
    expect(palabrasDesconocidas("¿Cuál es la capital de Francia?")).toEqual(["capita", "franci"]);
    expect(palabrasDesconocidas("cuéntame un chiste")).toEqual(["chiste"]);
  });

  it("una pregunta de seguimiento solo trae palabras conocidas o vacías", () => {
    for (const q of ["¿y eso por qué?", "¿y eso?", "¿por qué?", "¿cómo calculan la confianza?", "¿qué fuentes usan?"]) {
      expect(palabrasDesconocidas(q), q).toEqual([]);
    }
  });

  it("no repite raíces", () => {
    expect(palabrasDesconocidas("chiste chiste chistes")).toEqual(["chiste"]);
  });
});
