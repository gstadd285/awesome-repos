// Evalúa el informe de `npm audit --json` contra la lista de avisos aceptados
// (`seguridad/avisos-npm-aceptados.json`). Lo usan `scripts/auditar-dependencias.mjs` y las pruebas.
//
// Un aviso de severidad alta o crítica que no esté en la lista hace fallar la CI. Un aviso aceptado necesita
// su motivo y una fecha de revisión: cuando vence, vuelve a fallar hasta que alguien lo revise.

const ORDEN = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/**
 * @typedef {{ paquete: string, alcance: string, motivo: string, revisar: string }} Aceptado
 * @typedef {{ id: string, paquete: string, severidad: string, titulo: string, url: string }} Aviso
 */

/**
 * Valida la forma de la lista de avisos aceptados.
 * @param {unknown} datos
 * @returns {string[]} problemas encontrados (vacío si está bien)
 */
export function problemasDeLaLista(datos) {
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return ["La lista debe ser un objeto {id: aviso}."];
  const problemas = [];
  for (const [id, a] of Object.entries(datos)) {
    if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(id)) problemas.push(`${id}: el id debe ser un GHSA-xxxx-xxxx-xxxx.`);
    if (typeof a !== "object" || a === null) {
      problemas.push(`${id}: debe ser un objeto.`);
      continue;
    }
    for (const campo of ["paquete", "alcance", "motivo", "revisar"]) {
      if (typeof a[campo] !== "string" || a[campo].trim() === "") problemas.push(`${id}: falta «${campo}».`);
    }
    if (typeof a.motivo === "string" && a.motivo.trim().length < 40) problemas.push(`${id}: el motivo debe explicar por qué se acepta.`);
    if (typeof a.revisar === "string" && Number.isNaN(Date.parse(a.revisar))) problemas.push(`${id}: «revisar» debe ser una fecha AAAA-MM-DD.`);
  }
  return problemas;
}

/**
 * Avisos únicos del informe (cada uno aparece en varios paquetes de la cadena).
 * @param {any} informe salida de `npm audit --json`
 * @returns {Aviso[]}
 */
export function avisosDelInforme(informe) {
  /** @type {Map<string, Aviso>} */
  const porId = new Map();
  for (const vulnerabilidad of Object.values(informe?.vulnerabilities ?? {})) {
    for (const via of /** @type {any} */ (vulnerabilidad).via ?? []) {
      if (typeof via !== "object" || via === null) continue; // un nombre: apunta a otro paquete de la cadena
      const id = String(via.url ?? "").split("/").pop() || `npm-${via.source}`;
      if (!porId.has(id)) {
        porId.set(id, { id, paquete: String(via.name), severidad: String(via.severity), titulo: String(via.title), url: String(via.url ?? "") });
      }
    }
  }
  return [...porId.values()];
}

/**
 * @param {any} informe
 * @param {Record<string, Aceptado>} aceptados
 * @param {Date} hoy
 * @param {{ nivelMinimo?: keyof typeof ORDEN }} [opciones] severidad desde la cual bloquea (por omisión, alta)
 * @returns {{ ok: boolean, nuevos: Aviso[], vencidos: (Aviso & Aceptado)[], aceptados: (Aviso & Aceptado)[], sobrantes: string[], informativos: Aviso[] }}
 */
export function evaluarAuditoria(informe, aceptados, hoy, { nivelMinimo = "high" } = {}) {
  const avisos = avisosDelInforme(informe);
  const nuevos = [];
  const vencidos = [];
  const vigentes = [];
  const informativos = [];
  for (const aviso of avisos) {
    if ((ORDEN[/** @type {keyof typeof ORDEN} */ (aviso.severidad)] ?? 0) < ORDEN[nivelMinimo]) {
      informativos.push(aviso);
      continue;
    }
    const aceptado = Object.hasOwn(aceptados, aviso.id) ? aceptados[aviso.id] : undefined;
    if (!aceptado) nuevos.push(aviso);
    else if (Date.parse(aceptado.revisar) < hoy.getTime()) vencidos.push({ ...aviso, ...aceptado });
    else vigentes.push({ ...aviso, ...aceptado });
  }
  const presentes = new Set(avisos.map((a) => a.id));
  const sobrantes = Object.keys(aceptados).filter((id) => !presentes.has(id));
  return { ok: nuevos.length === 0 && vencidos.length === 0, nuevos, vencidos, aceptados: vigentes, sobrantes, informativos };
}
