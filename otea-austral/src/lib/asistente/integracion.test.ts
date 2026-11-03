import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLAVE_FALSA, crearServidorAnthropicFalso, trocear } from "../../../scripts/lib/anthropic-falso.mjs";
import { entradaPorId } from "./conocimiento";
import type { EventoAsistente } from "./limites";
import { crearManejadorAsistente } from "./manejador";
import { crearPresupuestoMemoria, dolaresAMicros } from "./presupuesto";
import { SISTEMA } from "./prompt";
import { crearProveedorAnthropic } from "./proveedor-anthropic";
import { responder, type ConfiguracionIa, type Registro } from "./servicio";

/**
 * Recorrido completo —HTTP → servicio → SDK oficial de Anthropic → servidor falso— sin llamar a nadie. Es la
 * prueba de que las piezas encajan tal como las arma `instancia.ts`.
 */
let falso: Awaited<ReturnType<typeof crearServidorAnthropicFalso>>;
let guion: Record<string, unknown> | undefined;

beforeAll(async () => {
  falso = await crearServidorAnthropicFalso({ responder: () => guion });
});
afterAll(async () => falso.cerrar());

const PRECIOS = { entrada: 0.1, salida: 0.5 };

function montar(tope = dolaresAMicros(1)) {
  const registros: Registro[] = [];
  const presupuesto = crearPresupuestoMemoria({ micros: tope, llamadas: 100 });
  const ia: ConfiguracionIa = {
    proveedor: crearProveedorAnthropic({ apiKey: CLAVE_FALSA, modelo: "claude-haiku-5-5", baseURL: falso.url }),
    presupuesto,
    precios: PRECIOS,
  };
  const manejador = crearManejadorAsistente({
    responder: (consulta, senal) => responder(consulta, { ia, registrar: (r) => registros.push(r) }, senal),
    registrar: () => {},
  });
  return { manejador, registros, presupuesto };
}

async function preguntar(manejador: (r: Request) => Promise<Response>, pregunta: string, ip = "203.0.113.50") {
  const respuesta = await manejador(
    new Request("https://oteaustral.example/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json", host: "oteaustral.example", "x-forwarded-for": ip },
      body: JSON.stringify({ pregunta }),
    }),
  );
  const texto = await respuesta.text();
  const eventos = texto
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EventoAsistente);
  return { respuesta, eventos };
}

const tipos = (e: EventoAsistente[]) => e.map((x) => x.t);
const texto = (e: EventoAsistente[]) => e.flatMap((x) => (x.t === "texto" ? [x.d] : [])).join("");

beforeEach(() => {
  guion = undefined; // el servidor falso vuelve a su respuesta por omisión (repite el contexto con fidelidad)
});

// Una pregunta que no coincide palabra por palabra con la de la base, para que intervenga el modelo.
const PREGUNTA = "¿De qué forma calculan la confianza de cada alerta?";

describe("recorrido completo con el SDK oficial contra un servidor falso", () => {
  it("responde con IA, frase por frase, con enlaces y sugerencias", async () => {
    const { manejador, registros } = montar();
    const antes = falso.solicitudes.length;
    const { respuesta, eventos } = await preguntar(manejador, PREGUNTA);

    expect(respuesta.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(tipos(eventos)[0]).toBe("inicio");
    expect(eventos[0]).toEqual({ t: "inicio", modo: "ia" });
    expect(tipos(eventos).slice(-3)).toEqual(["fuentes", "sugerencias", "fin"]);
    expect(texto(eventos)).toMatch(/^Respuesta de la IA de prueba: La confianza no la escribe nadie a mano/);
    expect(registros).toEqual([{ resultado: "ia" }]);

    // Lo que viajó al proveedor: las instrucciones, el contexto de la base y la pregunta; nada de la persona.
    expect(falso.solicitudes.length).toBe(antes + 1);
    const { cuerpo, cabeceras } = falso.solicitudes[antes];
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.system).toBe(SISTEMA);
    expect(cuerpo.messages[0].content).toContain(entradaPorId("confianza")!.respuesta);
    expect(cuerpo.messages[0].content).toContain(`<pregunta>\n${PREGUNTA}\n</pregunta>`);
    const todo = JSON.stringify({ cuerpo, cabeceras });
    expect(todo).not.toContain("203.0.113.50");
    expect(todo).not.toContain("oteaustral.example");
    expect(cabeceras["x-api-key"]).toBe(CLAVE_FALSA);
  });

  it("gasta del presupuesto lo realmente usado", async () => {
    const { manejador, presupuesto } = montar(3_000);
    guion = { fragmentos: trocear("La confianza sale de las fuentes. "), uso: { input_tokens: 1_000, output_tokens: 50 } };
    await preguntar(manejador, PREGUNTA);
    // Gastó 1.000 × 0,1 + 50 × 0,5 = 125 micros; el resto de la reserva volvió: caben más llamadas.
    let otras = 0;
    while (await presupuesto.reservar(1_000)) otras += 1;
    expect(otras).toBe(2); // 3.000 − 125 = 2.875 → dos reservas de 1.000
  });

  it("una pregunta que es una de la base no llama al proveedor", async () => {
    const { manejador } = montar();
    const antes = falso.solicitudes.length;
    const { eventos } = await preguntar(manejador, entradaPorId("confianza")!.pregunta);
    expect(eventos[0]).toMatchObject({ t: "inicio", modo: "base" });
    expect(falso.solicitudes.length).toBe(antes);
  });

  describe("cuando la IA falla, la persona recibe la base", () => {
    const base = entradaPorId("confianza")!;

    it.each([
      ["HTTP 500", { estado: 500, tipoError: "api_error" }, "proveedor"],
      ["HTTP 429", { estado: 429, tipoError: "rate_limit_error" }, "proveedor"],
      ["clave rechazada (401)", { estado: 401, tipoError: "authentication_error" }, "proveedor"],
      ["el modelo se niega", { fragmentos: [], stopReason: "refusal" }, "proveedor"],
      ["no escribe nada", { fragmentos: [] }, "proveedor"],
      ["conexión cortada a mitad", { fragmentos: ["Una frase sin cerrar"], cortar: true }, "proveedor"],
      ["recomienda comprar", { fragmentos: trocear("Primero algo correcto. Te recomendamos comprar cobre ahora. Fin. ") }, "salida"],
      ["trae un enlace", { fragmentos: trocear("Visita https://ejemplo.com para saber más. ") }, "salida"],
      ["inventa una cifra", { fragmentos: trocear("Acierta el 93 por ciento de las veces. ") }, "salida"],
    ])("%s", async (_nombre, g, codigo) => {
      guion = g as Record<string, unknown>;
      const { manejador, registros } = montar();
      const { eventos } = await preguntar(manejador, PREGUNTA);
      const i = eventos.findIndex((e) => e.t === "error");
      expect(eventos[i]).toEqual({ t: "error", codigo });
      expect(eventos[i + 1]).toMatchObject({ t: "inicio", modo: "base", coincidencia: base.pregunta });
      expect(texto(eventos.slice(i + 1))).toBe(base.respuesta);
      expect(eventos.at(-1)).toEqual({ t: "fin" });
      expect(registros).toEqual([{ resultado: "degradada", motivo: codigo }]);
      // Nada prohibido llegó a la persona.
      expect(texto(eventos)).not.toMatch(/recomendamos comprar|https?:\/\/|93 por ciento/);
    });

    it("sin cupo de gasto no se llama al proveedor", async () => {
      const { manejador } = montar(1);
      const antes = falso.solicitudes.length;
      const { eventos } = await preguntar(manejador, PREGUNTA);
      expect(eventos[0]).toEqual({ t: "error", codigo: "limite" });
      expect(texto(eventos)).toBe(base.respuesta);
      expect(falso.solicitudes.length).toBe(antes);
    });
  });

  it("si la persona cierra la conexión, se cancela la llamada al proveedor", async () => {
    const { manejador } = montar();
    guion = { fragmentos: trocear("Una frase que sigue y sigue. ".repeat(40), 10), intervaloMs: 20 };
    const antes = falso.solicitudes.length;
    const respuesta = await manejador(
      new Request("https://oteaustral.example/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json", host: "oteaustral.example", "x-forwarded-for": "203.0.113.51" },
        body: JSON.stringify({ pregunta: PREGUNTA }),
      }),
    );
    const lector = respuesta.body!.getReader();
    await lector.read(); // llega la primera frase
    await lector.cancel(); // la persona se fue
    await new Promise((r) => setTimeout(r, 300));
    expect(falso.solicitudes[antes].abortada).toBe(true);
  });
});
