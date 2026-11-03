import { normalizarOrganismo } from "@/lib/domain/respaldo";
import type { Source } from "@/lib/domain/schemas";
import { TEMAS, type Tema } from "@/lib/domain/temas";
import { aciertosPorTema, claveDeAgenda, palabrasSignificativas, similitud, tieneDecision } from "./lexico";

/**
 * Agrupación de los ítems ingeridos en **eventos candidatos** (`docs/alertas-reales.md` §3). Función pura y
 * determinista: recibe los ítems sin evento, los eventos abiertos, el registro y `ahora`, y devuelve qué evento le toca
 * a cada ítem. No lee reloj, red ni base; los identificadores nuevos salen de `generarId` (como en `rules.ts`).
 *
 * Solo usa metadatos (título, fecha y fuente): nunca el texto de un documento.
 */

export const VENTANA_MS = 48 * 60 * 60_000;
export const CIERRE_MS = 72 * 60 * 60_000;
export const RECIENTE_MS = 6 * 60 * 60_000;
export const UMBRAL_SIMILITUD = 0.35;
/** Umbral del borrador con IA (F5). La cola sin IA muestra todos los eventos, con o sin él. */
export const UMBRAL_BORRADOR = 50;

export type TemaEvento = Tema | "sin_tema";

export type FuenteAgrupable = Pick<Source, "id" | "organismo" | "temas" | "prioridad">;
type PrioridadFuente = Source["prioridad"];

/** Un ítem de `fuente_items` que todavía no tiene evento. */
export type ItemNuevo = { id: string; sourceId: string; titulo: string; publicado: Date | null; visto: Date };

/** Un ítem que ya pertenece a un evento abierto. */
export type ItemDeEvento = { sourceId: string; titulo: string; fecha: Date };

export type EventoAbierto = {
  id: string;
  tema: TemaEvento;
  claveAgenda: string | null;
  primero: Date;
  ultimo: Date;
  items: readonly ItemDeEvento[];
};

/** Un evento nuevo o uno abierto que recibió ítems: lo que hay que guardar. */
export type EventoAgrupado = {
  id: string;
  nuevo: boolean;
  tema: TemaEvento;
  claveAgenda: string | null;
  /** El título del primer ítem (un metadato), solo en los eventos nuevos. */
  tituloReferencia: string | null;
  primero: Date;
  ultimo: Date;
  puntaje: number;
};

export type ResultadoAgrupacion = {
  eventos: EventoAgrupado[];
  asignaciones: { itemId: string; eventoId: string }[];
};

export type EntradaAgrupacion = {
  items: readonly ItemNuevo[];
  abiertos: readonly EventoAbierto[];
  fuentes: readonly FuenteAgrupable[];
  ahora: Date;
  generarId: () => string;
};

/** La fecha de un ítem: la que declara el feed o, si falta, cuándo lo vio la ingesta. */
export const fechaDeItem = (item: Pick<ItemNuevo, "publicado" | "visto">): Date => item.publicado ?? item.visto;

/**
 * Tema de un ítem: los `temas` de su fuente afinados por el léxico del título. Cada acierto del léxico vale 2 y ser un
 * tema de la fuente, 1; gana el puntaje más alto si es único y viene de al menos un acierto, o de una fuente con un solo
 * tema. Empates y fuentes sin tema ni aciertos ⇒ `sin_tema` (va a la cola, nunca a la IA).
 */
export function temaDeItem(titulo: string, temasFuente: readonly Tema[]): TemaEvento {
  const aciertos = aciertosPorTema(titulo);
  const puntos = TEMAS.map((t) => ({ t, p: 2 * aciertos[t] + (temasFuente.includes(t) ? 1 : 0) }));
  const maximo = Math.max(...puntos.map((x) => x.p));
  const ganadores = puntos.filter((x) => x.p === maximo);
  if (maximo === 0 || ganadores.length > 1) return "sin_tema";
  return ganadores[0].t;
}

const PUNTOS_PRIORIDAD: Record<PrioridadFuente, number> = { A: 15, B: 10, C: 5 };
const ORDEN_PRIORIDAD: Record<PrioridadFuente, number> = { A: 3, B: 2, C: 1 };

export type Senales = {
  /** Organismos distintos (sin tildes, mayúsculas ni espacios extra). */
  organismos: number;
  decision: boolean;
  /** La prioridad más alta entre sus fuentes (`null` si ninguna está en el registro). */
  prioridad: PrioridadFuente | null;
  agenda: boolean;
  /** Algún ítem de las últimas 6 h respecto de `ahora`. */
  reciente: boolean;
};

/** Las señales simples de un evento a partir de sus ítems y del registro. */
export function senalesDeEvento(
  items: readonly ItemDeEvento[],
  claveAgenda: string | null,
  fuentes: readonly FuenteAgrupable[],
  ahora: Date,
): Senales {
  const porId = new Map(fuentes.map((f) => [f.id, f]));
  const organismos = new Set<string>();
  let prioridad: PrioridadFuente | null = null;
  for (const item of items) {
    const fuente = porId.get(item.sourceId);
    organismos.add(normalizarOrganismo(fuente?.organismo ?? item.sourceId));
    if (fuente && (!prioridad || ORDEN_PRIORIDAD[fuente.prioridad] > ORDEN_PRIORIDAD[prioridad])) prioridad = fuente.prioridad;
  }
  return {
    organismos: organismos.size,
    decision: items.some((i) => tieneDecision(i.titulo)),
    prioridad,
    agenda: claveAgenda !== null,
    reciente: items.some((i) => i.fecha.getTime() >= ahora.getTime() - RECIENTE_MS),
  };
}

/**
 * Puntaje 0–100: +25 por cada organismo desde el segundo, +30 con palabras de decisión, prioridad de la fuente (A 15,
 * B 10, C 5), +20 con clave de agenda y +10 si hay un ítem de las últimas 6 h. Se calcula cuando el evento cambia.
 */
export function puntajeDe(s: Senales): number {
  const total =
    25 * Math.max(0, s.organismos - 1) +
    (s.decision ? 30 : 0) +
    (s.prioridad ? PUNTOS_PRIORIDAD[s.prioridad] : 0) +
    (s.agenda ? 20 : 0) +
    (s.reciente ? 10 : 0);
  return Math.min(100, total);
}

type ItemTrabajo = ItemDeEvento & { palabras: ReadonlySet<string> };

type EventoTrabajo = {
  id: string;
  nuevo: boolean;
  tocado: boolean;
  tema: TemaEvento;
  claveAgenda: string | null;
  tituloReferencia: string | null;
  primero: number;
  ultimo: number;
  items: ItemTrabajo[];
};

const conPalabras = (item: ItemDeEvento): ItemTrabajo => ({ ...item, palabras: palabrasSignificativas(item.titulo) });

/** ¿El evento sigue recibiendo ítems? Se cierra 72 h después de su primer ítem. */
export const eventoAbierto = (e: Pick<EventoAbierto, "primero">, ahora: Date): boolean =>
  ahora.getTime() - e.primero.getTime() <= CIERRE_MS;

/**
 * Mismo evento si: mismo tema, todos los ítems dentro de 48 h, y títulos parecidos (Jaccard ≥ 0,35 contra alguno de sus
 * ítems) o la misma clave de agenda. Dos claves de agenda distintas nunca son el mismo evento. Entre varios candidatos
 * gana la misma clave de agenda, después la similitud más alta y, a igualdad, el que va antes en la lista.
 */
export function agrupar({ items, abiertos, fuentes, ahora, generarId }: EntradaAgrupacion): ResultadoAgrupacion {
  const temasPorFuente = new Map(fuentes.map((f) => [f.id, f.temas]));
  const eventos: EventoTrabajo[] = abiertos
    .filter((e) => eventoAbierto(e, ahora))
    .map((e) => ({
      id: e.id,
      nuevo: false,
      tocado: false,
      tema: e.tema,
      claveAgenda: e.claveAgenda,
      tituloReferencia: null,
      primero: e.primero.getTime(),
      ultimo: e.ultimo.getTime(),
      items: e.items.map(conPalabras),
    }))
    .sort((a, b) => a.primero - b.primero || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ordenados = [...items].sort(
    (a, b) => fechaDeItem(a).getTime() - fechaDeItem(b).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const asignaciones: ResultadoAgrupacion["asignaciones"] = [];

  for (const item of ordenados) {
    const fecha = fechaDeItem(item);
    const t = fecha.getTime();
    const tema = temaDeItem(item.titulo, temasPorFuente.get(item.sourceId) ?? []);
    const clave = claveDeAgenda(item.titulo);
    const trabajo: ItemTrabajo = conPalabras({ sourceId: item.sourceId, titulo: item.titulo, fecha });

    let elegido: EventoTrabajo | null = null;
    let mejor = { agenda: -1, sim: -1 };
    for (const e of eventos) {
      if (e.tema !== tema) continue;
      if (Math.max(e.ultimo, t) - Math.min(e.primero, t) > VENTANA_MS) continue;
      if (clave && e.claveAgenda && clave !== e.claveAgenda) continue;
      const agenda = clave !== null && clave === e.claveAgenda ? 1 : 0;
      const sim = Math.max(0, ...e.items.map((i) => similitud(trabajo.palabras, i.palabras)));
      if (!agenda && sim < UMBRAL_SIMILITUD) continue;
      // La lista va en orden fijo (abiertos del más antiguo al más nuevo y por id, después los nuevos en orden de
      // creación): solo una mejora estricta cambia la elección.
      if (agenda > mejor.agenda || (agenda === mejor.agenda && sim > mejor.sim)) {
        elegido = e;
        mejor = { agenda, sim };
      }
    }

    if (!elegido) {
      elegido = {
        id: generarId(),
        nuevo: true,
        tocado: true,
        tema,
        claveAgenda: clave,
        tituloReferencia: item.titulo,
        primero: t,
        ultimo: t,
        items: [],
      };
      eventos.push(elegido);
    }
    elegido.items.push(trabajo);
    elegido.tocado = true;
    elegido.primero = Math.min(elegido.primero, t);
    elegido.ultimo = Math.max(elegido.ultimo, t);
    elegido.claveAgenda ??= clave;
    asignaciones.push({ itemId: item.id, eventoId: elegido.id });
  }

  return {
    eventos: eventos
      .filter((e) => e.tocado)
      .map((e) => ({
        id: e.id,
        nuevo: e.nuevo,
        tema: e.tema,
        claveAgenda: e.claveAgenda,
        tituloReferencia: e.tituloReferencia,
        primero: new Date(e.primero),
        ultimo: new Date(e.ultimo),
        puntaje: puntajeDe(senalesDeEvento(e.items, e.claveAgenda, fuentes, ahora)),
      })),
    asignaciones,
  };
}
