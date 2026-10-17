import { describe, expect, it } from "vitest";
import { vistasEjemplo } from "@/data/ejemplo";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { calcularConfianza, calcularNivelVerificacion, motivosParaNoPublicar } from "@/lib/domain/rules";
import type { Alert, AlertAudit } from "@/lib/domain/schemas";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import { fuentesActivas } from "@/lib/sources/registry";
import { VIGENCIA_ENLACE_MS } from "@/lib/waitlist/service";
import {
  BASE_CONOCIMIENTO,
  ENLACES_PERMITIDOS,
  PREGUNTAS_SUGERIDAS,
  entradaPorId,
  type Entrada,
} from "./conocimiento";
import { MAX_PREGUNTA } from "./limites";
import { PUNTAJE_MINIMO, recuperar } from "./recuperar";

// Redactadas a mano: no son las derivadas de los datos del sitio (temas, fuentes y alertas de ejemplo).
const curadas = BASE_CONOCIMIENTO.filter((e) => !e.id.startsWith("ejemplo-") && e.id !== "temas" && e.id !== "fuentes");
const ejemplos = BASE_CONOCIMIENTO.filter((e) => e.ejemplo);
const respuesta = (id: string) => entradaPorId(id)?.respuesta ?? "";

describe("estructura de la base de conocimiento", () => {
  it("cada entrada tiene un identificador único, pregunta, respuesta y al menos un enlace", () => {
    const ids = BASE_CONOCIMIENTO.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of BASE_CONOCIMIENTO) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.pregunta.trim().length).toBeGreaterThan(5);
      expect(e.pregunta.length).toBeLessThanOrEqual(MAX_PREGUNTA);
      expect(e.respuesta.trim().length).toBeGreaterThan(20);
      expect(e.etiquetas.length).toBeGreaterThan(0);
      expect(e.fuentes.length).toBeGreaterThan(0);
    }
  });

  it("solo enlaza a páginas y anclas del sitio que existen", () => {
    for (const e of BASE_CONOCIMIENTO) {
      for (const f of e.fuentes) {
        expect(ENLACES_PERMITIDOS, `${e.id} → ${f.href}`).toContain(f.href);
        expect(f.titulo.trim()).not.toBe("");
      }
    }
  });

  it("la base no se puede alterar desde fuera", () => {
    expect(Object.isFrozen(BASE_CONOCIMIENTO)).toBe(true);
  });

  it("las etiquetas no repiten palabras sueltas entre todas las entradas más de lo razonable", () => {
    // Una etiqueta de una palabra en muchas entradas deja de distinguir: mejor que sea una sola o una frase.
    const veces = new Map<string, number>();
    for (const e of BASE_CONOCIMIENTO) {
      for (const t of new Set(e.etiquetas.map((x) => x.toLowerCase()))) {
        if (!t.includes(" ")) veces.set(t, (veces.get(t) ?? 0) + 1);
      }
    }
    const repetidas = [...veces].filter(([, n]) => n > 3).map(([t]) => t);
    expect(repetidas).toEqual([]);
  });
});

describe("las reglas del sitio (CLAUDE.md)", () => {
  it("ninguna pregunta ni respuesta usa lenguaje de recomendación ni promete rentabilidad", () => {
    for (const e of BASE_CONOCIMIENTO) {
      expect(frasesProhibidas(e.pregunta), e.id).toEqual([]);
      expect(frasesProhibidas(e.respuesta), e.id).toEqual([]);
    }
  });

  it("lo derivado de alertas de ejemplo dice que es ficticio", () => {
    expect(ejemplos.length).toBe(vistasEjemplo.length);
    for (const e of ejemplos) {
      expect(e.respuesta, e.id).toContain("alerta de ejemplo (ficticia, no un hecho real)");
    }
  });

  it("cada alerta de ejemplo cuenta todos sus sectores, con su dirección", () => {
    for (const v of vistasEjemplo) {
      const texto = respuesta(v.id);
      expect(texto, v.id).toContain(v.evento);
      for (const fila of v.filas) expect(texto, `${v.id} · ${fila.sector}`).toContain(fila.sector);
    }
  });

  it("ninguna respuesta curada inventa cifras: las que hay están verificadas", () => {
    // Número de dos o más cifras → debe estar en esta lista, con el lugar del que sale.
    const verificadas: Record<string, string> = {
      "72": "VIGENCIA_ENLACE_MS (lista de espera)",
      "30": "registros del proveedor de alojamiento: máximo 30 días (src/app/privacidad/page.tsx)",
      "2.0": "NIST CSF 2.0 (src/lib/security/nist-csf.ts)",
    };
    for (const e of curadas) {
      for (const cifra of e.respuesta.match(/\d+(?:[.,]\d+)*/g) ?? []) {
        if (cifra.replace(/\D/g, "").length < 2 && !cifra.includes(".")) continue;
        expect(Object.keys(verificadas), `${e.id}: «${cifra}»`).toContain(cifra);
      }
    }
    expect(VIGENCIA_ENLACE_MS).toBe(72 * 60 * 60_000);
  });

  it("no publica precios: dice que aún no los hay", () => {
    expect(respuesta("precio")).toMatch(/todavía no publicamos precios/i);
    expect(respuesta("precio")).not.toMatch(/\d|\$|usd|clp/i);
  });
});

describe("coincide con las reglas de negocio reales", () => {
  const primaria = { tipo: "primaria", organismo: "A" } as const;
  const secundaria = { tipo: "secundaria", organismo: "B" } as const;
  const prensaA = { tipo: "prensa", organismo: "C" } as const;
  const prensaB = { tipo: "prensa", organismo: "D" } as const;

  it("confianza: lo que dice la respuesta es lo que calcula `calcularConfianza`", () => {
    // La respuesta afirma exactamente esto:
    expect(calcularConfianza([primaria])).toBe("alta");
    expect(calcularConfianza([secundaria])).toBe("media");
    expect(calcularConfianza([prensaA, prensaB])).toBe("media");
    expect(calcularConfianza([prensaA])).toBe("baja");
    expect(calcularConfianza([])).toBe("baja");
    expect(calcularConfianza([prensaA, { ...prensaB, organismo: "c" }])).toBe("baja"); // mismo organismo
    const texto = respuesta("confianza");
    expect(texto).toMatch(/alta si hay al menos una fuente primaria/);
    expect(texto).toMatch(/media si hay una fuente secundaria o notas de prensa de dos medios distintos/);
    expect(texto).toMatch(/baja si solo hay una nota de prensa o aún no hay fuentes/);
    expect(texto).toMatch(/con solo prensa nunca supera la media/);
  });

  it("verificación: cuatro niveles, y dos documentos de un organismo cuentan como una fuente", () => {
    expect(calcularNivelVerificacion([primaria])).toBe("fuente_oficial");
    expect(calcularNivelVerificacion([secundaria, prensaA])).toBe("dos_fuentes");
    expect(calcularNivelVerificacion([prensaA, { ...prensaA }])).toBe("una_fuente");
    expect(calcularNivelVerificacion([])).toBe("sin_verificar");
    const texto = respuesta("verificacion");
    for (const nivel of ["Fuente oficial", "Dos fuentes independientes", "Una fuente", "Sin verificar"]) {
      expect(texto).toContain(nivel);
    }
    expect(texto).toMatch(/dos documentos del mismo organismo cuentan como uno/);
  });

  it("publicación: impacto alto exige dos organismos y una aprobación; los demás no", () => {
    const alerta = { id: "a-1", estado: "borrador", impacto: "alto" } as unknown as Alert;
    const auditoria: AlertAudit[] = [];
    const motivos = motivosParaNoPublicar(alerta, [primaria], auditoria).join(" ");
    expect(motivos).toMatch(/dos fuentes de organismos distintos/);
    expect(motivos).toMatch(/aprobación humana/);
    expect(motivosParaNoPublicar({ ...alerta, impacto: "medio" } as Alert, [primaria], auditoria)).toEqual([]);
    expect(motivosParaNoPublicar({ ...alerta, impacto: "bajo" } as Alert, [], auditoria).join(" ")).toMatch(
      /al menos una fuente/,
    );
    const texto = respuesta("publicar");
    expect(texto).toMatch(/al menos una fuente enlazada/);
    expect(texto).toMatch(/dos fuentes de organismos distintos/);
    expect(texto).toMatch(/aprobación humana registrada después de su última edición/);
    expect(respuesta("impacto")).toMatch(/dos fuentes de organismos distintos/);
  });
});

describe("lo derivado de los datos del sitio", () => {
  it("los temas: están los seis, con el nombre que ve la persona", () => {
    const texto = respuesta("temas");
    expect(TEMAS).toHaveLength(6);
    for (const t of TEMAS) expect(texto).toContain(TEMA_ETIQUETA[t]);
    expect(texto).toContain("exportación de Chile"); // los nombres propios conservan su mayúscula
  });

  it("las fuentes: cuenta las del registro y cita todas", () => {
    const activas = fuentesActivas();
    const texto = respuesta("fuentes");
    expect(texto).toContain(`lista ${activas.length} organismos activos`);
    for (const f of activas) expect(texto, f.id).toContain(f.organismo);
    // «todos fuentes primarias» solo si es verdad.
    if (!activas.every((f) => f.tipo === "primaria")) expect(texto).not.toContain("todos fuentes primarias");
  });
});

describe("las preguntas sugeridas", () => {
  it("cada una existe y encuentra la entrada que anuncia", () => {
    expect(PREGUNTAS_SUGERIDAS.length).toBeGreaterThanOrEqual(4);
    for (const p of PREGUNTAS_SUGERIDAS) {
      expect(entradaPorId(p.entrada), p.texto).toBeDefined();
      const mejor = recuperar(p.texto)[0];
      expect(mejor?.entrada.id, p.texto).toBe(p.entrada);
      expect(mejor?.puntaje ?? 0, p.texto).toBeGreaterThanOrEqual(PUNTAJE_MINIMO);
    }
  });

  it("la pregunta de cada entrada la encuentra a ella misma (sirve como sugerencia)", () => {
    const fallas = BASE_CONOCIMIENTO.filter((e: Entrada) => recuperar(e.pregunta)[0]?.entrada.id !== e.id).map(
      (e) => e.id,
    );
    expect(fallas).toEqual([]);
  });
});
