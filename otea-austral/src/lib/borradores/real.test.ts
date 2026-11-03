import { describe, expect, it } from "vitest";
import { costoDetalladoEnMicros, estimarTokens, FACTOR_CACHE_ESCRITA, microsADolares } from "@/lib/ia/gasto";
import { armarMensaje, SISTEMA_BORRADOR, type EntradaMensaje } from "./prompt";
import { contarTokens, crearProveedorBorrador, MAX_TOKENS_BORRADOR } from "./proveedor-borrador";
import { revisarBorrador } from "./revision";

/**
 * PRUEBA CON LA API REAL DE ANTHROPIC. **Gasta dinero** (décimas de centavo: un borrador y un conteo de tokens, que es
 * gratis) y por eso no corre nunca sola: se omite salvo que lo pidas expresamente.
 *
 *   BORRADORES_PRUEBA_REAL=1 BORRADORES_ANTHROPIC_API_KEY=sk-ant-… BORRADORES_PRECIO_ENTRADA=… BORRADORES_PRECIO_SALIDA=… \
 *   npm run borradores:probar
 *
 * (los precios, en dólares por millón de tokens, de la página de precios de Anthropic; la clave, la del espacio de trabajo
 * de borradores). Es la única prueba que toca el servicio de verdad (`docs/alertas-reales.md` §4.1, aceptación de F5):
 * comprueba que la API acepta la solicitud (Haiku 5.5, salida estructurada, `effort: "low"`, sin herramientas), que el
 * borrador pasa la revisión, que el **costo real es ≤ US$ 0,004** y que el estimador del gasto queda **por encima** de
 * `countTokens`. El texto es un DOCUMENTO SINTÉTICO de prueba (organismo «(ejemplo)»), no una fuente real.
 */
const activa = process.env.BORRADORES_PRUEBA_REAL === "1";
const clave = process.env.BORRADORES_ANTHROPIC_API_KEY ?? "";
const precios = { entrada: Number(process.env.BORRADORES_PRECIO_ENTRADA), salida: Number(process.env.BORRADORES_PRECIO_SALIDA) };
const MODELO = "claude-haiku-5-5";

const DOCUMENTO = `El Consejo del Banco de prueba (ejemplo) acordó mantener su tasa de referencia en 5,25 %. Según este comunicado
ficticio, la inflación subyacente bajó durante el trimestre y las expectativas a dos años siguen cerca de la meta de 3 %.
El Consejo indicó que sus próximas decisiones dependerán de la evolución de la actividad y del tipo de cambio.`.repeat(8);

const ENTRADA: EntradaMensaje = {
  tema: "divisas",
  claveAgenda: "rpm",
  desde: "2026-10-24",
  hasta: "2026-10-24",
  fuentes: [{ organismo: "Banco de prueba (ejemplo)", tipo: "primaria", fecha: "2026-10-24", titulo: "Comunicado de prueba de la reunión de política monetaria (ejemplo)" }],
  documentos: [{ fuente: 1, texto: DOCUMENTO }],
};

describe.skipIf(!activa)("API real de Anthropic para borradores (gasta dinero: solo con BORRADORES_PRUEBA_REAL=1)", () => {
  it("tiene lo necesario para probar", () => {
    expect(clave, "falta BORRADORES_ANTHROPIC_API_KEY").toMatch(/^sk-ant-/);
    expect(precios.entrada, "BORRADORES_PRECIO_ENTRADA").toBeGreaterThan(0);
    expect(precios.salida, "BORRADORES_PRECIO_SALIDA").toBeGreaterThan(0);
  });

  it("un borrador real: pasa la revisión, cuesta ≤ US$ 0,004 y el estimador queda por encima de countTokens", { timeout: 90_000 }, async () => {
    const mensaje = armarMensaje(ENTRADA, "0123456789abcdef")!;
    const contados = await contarTokens({ apiKey: clave, modelo: MODELO }, { sistema: SISTEMA_BORRADOR, mensaje });
    const estimados = estimarTokens(SISTEMA_BORRADOR + mensaje);
    const r = await crearProveedorBorrador({ apiKey: clave, modelo: MODELO }).redactar({ sistema: SISTEMA_BORRADOR, mensaje, maxTokens: MAX_TOKENS_BORRADOR });
    const costo = costoDetalladoEnMicros(r.uso, precios);
    const reservado = Math.ceil(estimados * FACTOR_CACHE_ESCRITA * precios.entrada + MAX_TOKENS_BORRADOR * precios.salida);
    const revision = revisarBorrador(r.texto, {
      tema: "divisas",
      fuentes: [{ tipo: "primaria", organismo: "Banco de prueba (ejemplo)" }],
      respaldo: mensaje,
      textos: [DOCUMENTO],
      ahora: new Date().toISOString(),
    });
    // Lo que ve quien corre la prueba: el borrador, la revisión y lo que costó de verdad.
    console.log(
      [
        `modelo: ${MODELO} · fin: ${r.motivo} · uso: ${JSON.stringify(r.uso)}`,
        `tokens: countTokens ${contados} · estimados ${estimados} · costo ≈ US$ ${microsADolares(costo).toFixed(6)} · reservado US$ ${microsADolares(reservado).toFixed(6)}`,
        `revisión: ${JSON.stringify(revision.ok ? { ok: true, banderas: revision.banderas, copia: revision.copia } : revision)}`,
        `borrador:\n${r.texto}`,
      ].join("\n"),
    );
    expect(r.motivo).toBe("completo");
    expect(revision.ok).toBe(true);
    expect(estimados).toBeGreaterThanOrEqual(contados);
    expect(costo).toBeLessThanOrEqual(4_000);
    expect(costo).toBeLessThanOrEqual(reservado);
  });
});
