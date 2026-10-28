import { frasesProhibidas } from "@/lib/domain/lenguaje";
import { calcularConfianza, crearAlerta, type FuenteRespaldo } from "@/lib/domain/rules";
import type { Tema } from "@/lib/domain/temas";
import { compararCopia, esCopia, type ResultadoCopia } from "./anticopia";
import { aContenidoAlerta, BorradorModeloSchema, type Bandera, type BorradorModelo } from "./esquema";

/**
 * Revisión de la salida del modelo (`docs/alertas-reales.md` §4.5), **en este orden**:
 *
 * 1. Zod estricto (`BorradorModeloSchema`): JSON roto, campos de más o de menos, largos.
 * 2. Forma: sin enlaces, direcciones web, correos, HTML ni Markdown; una condición sin marcador condicional deja la
 *    bandera `sin_condicion` (no se rechaza: la dueña la verá).
 * 3. Política de lenguaje: las frases prohibidas del sitio (`lenguaje.ts`) y las formas de recomendación propias de un
 *    redactor («recomendamos», «conviene comprar», «buen momento para», «precio objetivo»…).
 * 4. Cifras: todo número de dos o más dígitos debe estar, escrito igual, en un título, una fecha o un documento.
 * 5. Anticopia contra el texto leído (`anticopia.ts`).
 * 6. Reglas de negocio: tema del evento, impacto sugerido (nunca `alto`), confianza **calculada** de las fuentes (el
 *    modelo no la fija) y el contenido pasa la validación de `crearAlerta` (`rules.ts`).
 *
 * Funciones puras: ni red, ni base, ni reloj. Un borrador que falla no se guarda; si falló por JSON, largo o copia, el
 * servicio pide **un** reintento.
 */

export type MotivoRevision = "json" | "esquema" | "largo" | "enlace" | "formato" | "lenguaje" | "cifra" | "copia" | "reglas";

/** Lo que admite un reintento con la indicación neutra (§4.5: fallos 1, 2 por largo y 5). */
export const REINTENTABLES: ReadonlySet<MotivoRevision> = new Set(["json", "esquema", "largo", "copia"]);

export type ContextoRevision = {
  tema: Tema;
  /** Fuentes del evento (todas): de ellas sale la confianza calculada. */
  fuentes: readonly FuenteRespaldo[];
  /** Títulos, organismos, fechas y textos que vio el modelo: de ahí puede salir una cifra. */
  respaldo: string;
  /** Textos leídos de las fuentes (en memoria), para la anticopia. */
  textos: readonly string[];
  /** Instante ISO de la revisión (la validación de `crearAlerta` lo necesita). */
  ahora: string;
};

export type Revisado =
  | { ok: true; borrador: BorradorModelo; banderas: Bandera[]; copia: ResultadoCopia }
  | { ok: false; motivo: MotivoRevision; copia?: ResultadoCopia };

/** Los campos de texto del borrador, cada uno por separado. */
export function camposDeTexto(b: BorradorModelo): string[] {
  return [b.evento, b.resumen, ...b.filas.flatMap((f) => [f.sector, f.condicion]), ...b.dudas];
}

const normalizar = (t: string) =>
  ` ${t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;

// 2 · Forma
const ESQUEMA_URL = /\b(?:https?|ftp|file|javascript|data|vbscript|mailto):/i;
const DOMINIO = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|cl|org|net|io|ai|co|gov|edu|int|app|dev|info|me|ly|xyz|es|ar|pe|mx|br|us|uk|eu|ru|cn|ch|fr|de|jp|top|site|online|link)\b/i;
const CORREO = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const HTML = /<\/?[a-z!][^>]*>|&[a-z]{2,8};|&#\d+;/i;
const MARKDOWN = /\*\*|__|`|^\s{0,3}#{1,6}\s|!?\[[^\]]*\]\([^)]*\)|^\s*>\s/m;

export function problemaDeForma(texto: string): "enlace" | "formato" | undefined {
  if (ESQUEMA_URL.test(texto) || /\bwww\./i.test(texto) || DOMINIO.test(texto) || CORREO.test(texto)) return "enlace";
  if (HTML.test(texto) || MARKDOWN.test(texto)) return "formato";
  return undefined;
}

const CONDICIONAL =
  /\b(si|podria|podrian|podra|podran|en caso de|cuando|mientras|siempre que|a menos que|salvo que|de mantenerse|de confirmarse|de concretarse|dependera|depende|dependiendo)\b/;

export const tieneMarcadorCondicional = (condicion: string): boolean => CONDICIONAL.test(normalizar(condicion));

// 3 · Lenguaje (además de las frases prohibidas del sitio)
const RECOMENDACION: readonly RegExp[] = [
  /\brecomend\w*/,
  /\baconsej\w*/,
  /\bsugerimos\b|\bte sugiero\b|\ble sugerimos\b/,
  /\b(conviene|convendria|deberias|debes|hay que|es hora de)\s+(comprar|vender|invertir|apostar|entrar|salir|cubrirse|tomar posicion)\w*/,
  /\b(es|seria|parece)\s+(un\s+)?(buen|mal)\s+momento\s+para\b/,
  /\b(oportunidad|senal|senales)\s+de\s+(compra|venta|inversion)\b/,
  /\bprecio\s+objetivo\b/,
  /\b(compre|venda|invierta|compren|vendan|inviertan)\b/,
];

export function lenguajeDeRecomendacion(texto: string): boolean {
  if (frasesProhibidas(texto).length > 0) return true;
  const t = normalizar(texto);
  return RECOMENDACION.some((r) => r.test(t));
}

// 4 · Cifras
const CIFRAS = /\d+(?:[.,]\d+)*/g;

export function cifrasSinRespaldo(texto: string, respaldo: string): string[] {
  const conocidas = new Set(respaldo.match(CIFRAS) ?? []);
  return (texto.match(CIFRAS) ?? []).filter((c) => c.replace(/\D/g, "").length >= 2 && !conocidas.has(c));
}

// ── La revisión completa ───────────────────────────────────────────────────

export function revisarBorrador(crudo: string, ctx: ContextoRevision): Revisado {
  // 1 · Zod estricto
  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch {
    return { ok: false, motivo: "json" };
  }
  const r = BorradorModeloSchema.safeParse(json);
  if (!r.success) {
    const largo = r.error.issues.some((i) => i.code === "too_big");
    return { ok: false, motivo: largo ? "largo" : "esquema" };
  }
  const borrador = r.data;
  const campos = camposDeTexto(borrador);

  // 2 · Forma
  const banderas = new Set<Bandera>();
  for (const campo of campos) {
    const problema = problemaDeForma(campo);
    if (problema) return { ok: false, motivo: problema };
  }
  if (borrador.filas.some((f) => !tieneMarcadorCondicional(f.condicion))) banderas.add("sin_condicion");

  // 3 · Lenguaje
  if (campos.some(lenguajeDeRecomendacion)) return { ok: false, motivo: "lenguaje" };

  // 4 · Cifras
  if (campos.some((c) => cifrasSinRespaldo(c, ctx.respaldo).length > 0)) return { ok: false, motivo: "cifra" };

  // 5 · Anticopia
  const copia = compararCopia(campos, ctx.textos);
  if (esCopia(copia)) return { ok: false, motivo: "copia", copia };

  // 6 · Reglas de negocio: la confianza la calcula el código con las fuentes del evento.
  const contenido = aContenidoAlerta(borrador, ctx.tema, calcularConfianza(ctx.fuentes));
  const valida = crearAlerta(
    { ...contenido, id: "borrador-en-revision", fecha: ctx.ahora, revisor: "Equipo editorial de Otea Austral", es_ejemplo: false },
    { actor: "borradores", fecha: ctx.ahora, generarId: () => "revision" },
  );
  if (!valida.ok) return { ok: false, motivo: "reglas" };

  return { ok: true, borrador, banderas: [...banderas], copia };
}
