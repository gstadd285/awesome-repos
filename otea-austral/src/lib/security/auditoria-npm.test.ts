import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avisosDelInforme, evaluarAuditoria, problemasDeLaLista } from "../../../scripts/lib/auditoria-npm.mjs";

const via = (id: string, name: string, severity: string) => ({
  source: 1,
  name,
  dependency: name,
  title: `Aviso de ${name}`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: "<=1.0.0",
});

/** Forma real de `npm audit --json`: el mismo aviso aparece en toda la cadena de dependencias. */
const INFORME = {
  auditReportVersion: 2,
  vulnerabilities: {
    braces: { name: "braces", severity: "high", via: [via("GHSA-vfj7-8cjw-p6xm", "braces", "high")] },
    micromatch: { name: "micromatch", severity: "high", via: ["braces"] },
    "fast-glob": { name: "fast-glob", severity: "high", via: ["micromatch"] },
    ruidoso: { name: "ruidoso", severity: "moderate", via: [via("GHSA-aaaa-bbbb-cccc", "ruidoso", "moderate")] },
  },
};

const ACEPTADO = {
  paquete: "braces",
  alcance: "desarrollo",
  motivo: "Solo llega por el lint local; no se despliega y no hay versión corregida publicada.",
  revisar: "2027-01-10",
};
const HOY = new Date("2026-10-10T12:00:00Z");

describe("auditoría de dependencias (control 20)", () => {
  it("cuenta cada aviso una sola vez aunque aparezca en toda la cadena", () => {
    expect(avisosDelInforme(INFORME).map((a: { id: string }) => a.id).sort()).toEqual(["GHSA-aaaa-bbbb-cccc", "GHSA-vfj7-8cjw-p6xm"]);
  });

  it("un aviso alto aceptado y vigente no bloquea; uno de severidad menor tampoco", () => {
    const r = evaluarAuditoria(INFORME, { "GHSA-vfj7-8cjw-p6xm": ACEPTADO }, HOY);
    expect(r.ok).toBe(true);
    expect(r.aceptados.map((a: { id: string }) => a.id)).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
    expect(r.informativos.map((a: { id: string }) => a.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("un aviso alto sin evaluar bloquea", () => {
    const r = evaluarAuditoria(INFORME, {}, HOY);
    expect(r.ok).toBe(false);
    expect(r.nuevos.map((a: { id: string }) => a.id)).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
  });

  it("uno crítico nuevo bloquea aunque haya otros aceptados; uno moderado nuevo no", () => {
    const informe = {
      vulnerabilities: { ...INFORME.vulnerabilities, grave: { name: "grave", severity: "critical", via: [via("GHSA-gggg-hhhh-jjjj", "grave", "critical")] } },
    };
    const r = evaluarAuditoria(informe, { "GHSA-vfj7-8cjw-p6xm": ACEPTADO }, HOY);
    expect(r.ok).toBe(false);
    expect(r.nuevos.map((a: { paquete: string }) => a.paquete)).toEqual(["grave"]);
  });

  it("la aceptación vence en la fecha de revisión y vuelve a bloquear hasta que alguien la renueve", () => {
    const despues = new Date("2027-01-11T00:00:00Z");
    const r = evaluarAuditoria(INFORME, { "GHSA-vfj7-8cjw-p6xm": ACEPTADO }, despues);
    expect(r.ok).toBe(false);
    expect(r.vencidos.map((a: { id: string }) => a.id)).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
  });

  it("avisa de las aceptaciones que ya no hacen falta, sin bloquear", () => {
    const r = evaluarAuditoria({ vulnerabilities: {} }, { "GHSA-vfj7-8cjw-p6xm": ACEPTADO }, HOY);
    expect(r.ok).toBe(true);
    expect(r.sobrantes).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
  });

  it("un informe vacío o sin avisos pasa", () => {
    expect(evaluarAuditoria({}, {}, HOY).ok).toBe(true);
    expect(evaluarAuditoria({ vulnerabilities: {} }, {}, HOY).ok).toBe(true);
  });

  it("no se deja engañar por un id que coincida con propiedades de Object.prototype", () => {
    const informe = { vulnerabilities: { x: { name: "x", severity: "high", via: [{ ...via("constructor", "x", "high"), url: "https://github.com/advisories/constructor" }] } } };
    expect(evaluarAuditoria(informe, {}, HOY).ok).toBe(false);
  });
});

describe("lista de avisos aceptados", () => {
  it("rechaza ids raros, motivos vacíos y fechas inválidas", () => {
    expect(problemasDeLaLista({ "GHSA-vfj7-8cjw-p6xm": ACEPTADO })).toEqual([]);
    expect(problemasDeLaLista([])).not.toEqual([]);
    expect(problemasDeLaLista({ "no-es-ghsa": ACEPTADO }).join()).toContain("GHSA");
    expect(problemasDeLaLista({ "GHSA-vfj7-8cjw-p6xm": { ...ACEPTADO, motivo: "ok" } }).join()).toContain("motivo");
    expect(problemasDeLaLista({ "GHSA-vfj7-8cjw-p6xm": { ...ACEPTADO, revisar: "mañana" } }).join()).toContain("fecha");
    expect(problemasDeLaLista({ "GHSA-vfj7-8cjw-p6xm": { ...ACEPTADO, paquete: "" } }).join()).toContain("paquete");
  });

  it("la lista real es válida y ninguna revisión está vencida (si falla, hay que revisar los avisos aceptados)", () => {
    const real = JSON.parse(readFileSync(path.resolve(__dirname, "../../../seguridad/avisos-npm-aceptados.json"), "utf8"));
    expect(problemasDeLaLista(real)).toEqual([]);
    for (const [id, a] of Object.entries(real as Record<string, { revisar: string }>)) {
      expect(Date.parse(a.revisar), `${id}: la fecha de revisión (${a.revisar}) venció`).toBeGreaterThan(Date.now());
    }
  });
});
