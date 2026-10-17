import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import type { EventoAsistente } from "./limites";
import { costoEnMicros, crearPresupuestoMemoria, dolaresAMicros, microsADolares } from "./presupuesto";
import type { EventoModelo, Proveedor, Uso } from "./proveedor";
import { crearProveedorAnthropic } from "./proveedor-anthropic";
import { responder } from "./servicio";

/**
 * PRUEBA CON LA API REAL DE ANTHROPIC. **Gasta dinero** (centavos de dólar: dos preguntas) y por eso no corre nunca
 * sola: se omite salvo que lo pidas expresamente.
 *
 *   ASISTENTE_PRUEBA_REAL=1 ANTHROPIC_API_KEY=sk-ant-… ASISTENTE_MODELO=claude-haiku-5-5 \
 *   ASISTENTE_PRECIO_ENTRADA=… ASISTENTE_PRECIO_SALIDA=… npm run asistente:probar
 *
 * (los precios, en dólares por millón de tokens, de la página de precios de Anthropic). Es la única prueba que toca
 * el servicio de verdad: comprueba que la clave, el modelo y la forma de la solicitud (sin `thinking` ni parámetros
 * de muestreo, con `effort: "low"`) los acepta la API, que la respuesta llega por frases, que pasa las reglas de
 * lenguaje del sitio y cuánto cuesta realmente cada pregunta. El tope de esta prueba es de US$ 0,05.
 */
const activa = process.env.ASISTENTE_PRUEBA_REAL === "1";
const clave = process.env.ANTHROPIC_API_KEY ?? "";
const modelo = process.env.ASISTENTE_MODELO ?? "";
const precios = {
  entrada: Number(process.env.ASISTENTE_PRECIO_ENTRADA),
  salida: Number(process.env.ASISTENTE_PRECIO_SALIDA),
};

const PREGUNTAS = [
  "¿De qué forma calculan la confianza de cada alerta?",
  "¿Qué pasa si una alerta publicada tiene un error?",
];

describe.skipIf(!activa)("API real de Anthropic (gasta dinero: solo con ASISTENTE_PRUEBA_REAL=1)", () => {
  it("tiene lo necesario para probar", () => {
    expect(clave, "falta ANTHROPIC_API_KEY").toMatch(/^sk-ant-/);
    expect(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"], "ASISTENTE_MODELO").toContain(modelo);
    expect(precios.entrada, "ASISTENTE_PRECIO_ENTRADA (USD por millón de tokens)").toBeGreaterThan(0);
    expect(precios.salida, "ASISTENTE_PRECIO_SALIDA (USD por millón de tokens)").toBeGreaterThan(0);
  });

  for (const pregunta of PREGUNTAS) {
    it(`«${pregunta}»`, { timeout: 60_000 }, async () => {
      const real = crearProveedorAnthropic({ apiKey: clave, modelo });
      // Se anota el uso que informa la API (es lo que se cobra) sin tocar lo que ve el servicio.
      let uso: Uso | undefined;
      let motivo = "";
      const proveedor: Proveedor = {
        nombre: real.nombre,
        async *generar(solicitud) {
          for await (const evento of real.generar(solicitud)) {
            if (evento.tipo === "fin") {
              uso = evento.uso;
              motivo = evento.motivo;
            }
            yield evento satisfies EventoModelo;
          }
        },
      };
      const presupuesto = crearPresupuestoMemoria({ micros: dolaresAMicros(0.05), llamadas: 5 });

      const eventos: EventoAsistente[] = [];
      for await (const e of responder(
        { pregunta, anteriores: [], clave: "prueba-real" },
        { ia: { proveedor, presupuesto, precios } },
      )) {
        eventos.push(e);
      }

      const texto = eventos.flatMap((e) => (e.t === "texto" ? [e.d] : [])).join("");
      const costo = uso ? microsADolares(costoEnMicros(uso, precios)) : NaN;
      // Lo que ve quien corre la prueba: la respuesta, cómo terminó y lo que costó de verdad.
      console.log(
        [
          `pregunta: ${pregunta}`,
          `modelo: ${modelo} · fin: ${motivo} · uso: ${JSON.stringify(uso)} · costo ≈ US$ ${costo.toFixed(6)}`,
          `eventos: ${eventos.map((e) => e.t).join(" → ")}`,
          `respuesta:\n${texto}`,
        ].join("\n"),
      );

      // Si la API rechazó algo (clave, modelo, parámetros) el servicio degrada a la base: aquí eso es un fallo.
      expect(eventos.map((e) => e.t), "la IA no respondió; revisa clave, modelo y saldo").not.toContain("error");
      expect(eventos[0]).toEqual({ t: "inicio", modo: "ia" });
      expect(eventos.at(-1)).toEqual({ t: "fin" });
      expect(texto.length).toBeGreaterThan(40);
      expect(frasesProhibidas(texto)).toEqual([]);
      expect(motivo).toBe("completo");
      expect(uso?.entrada).toBeGreaterThan(0);
      expect(uso?.salida).toBeGreaterThan(0);
    });
  }
});
