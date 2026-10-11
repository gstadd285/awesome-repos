/**
 * El asistente de preguntas: de una pregunta, una secuencia de eventos (`EventoAsistente`). No sabe de HTTP ni de
 * configuración; quien lo usa le entrega un proveedor de IA opcional, el presupuesto y la base de conocimiento.
 *
 * Camino de una pregunta:
 *  1. Políticas de entrada (`politicas.ts`): saludos, datos personales, intentos de cambiar las instrucciones,
 *     consejos de inversión y pronósticos tienen respuesta fija y NUNCA llegan al modelo.
 *  2. Recuperación (`recuperar.ts`): si nada de la base se parece a la pregunta, se dice así.
 *  3. Sin IA configurada, o si la pregunta es exactamente una de las de la base: se responde con la base.
 *  4. Con IA: se reserva el gasto máximo, el modelo redacta SOLO con el contexto recuperado y cada frase se revisa
 *     (`salida.ts`) antes de salir.
 *  5. Si la IA falla, se rechaza lo que escribe, se agota el cupo o no responde, la persona recibe igualmente la
 *     respuesta de la base (el `error` explica por qué).
 */
import {
  BASE_CONOCIMIENTO,
  PREGUNTAS_SUGERIDAS,
  entradaPorId,
  type Entrada,
} from "./conocimiento";
import type { CodigoErrorEvento, Enlace, EventoAsistente } from "./limites";
import { MENSAJES } from "./mensajes";
import { clasificar, limpiarPregunta } from "./politicas";
import { costoEnMicros, costoMaximoEnMicros, type Precios, type Presupuesto } from "./presupuesto";
import { MAX_TOKENS, SISTEMA, armarMensaje, respaldoDeCifras } from "./prompt";
import type { MotivoFin, Proveedor } from "./proveedor";
import { ENTRADAS_DE_CONTEXTO, PUNTAJE_MINIMO, palabrasDesconocidas, recuperar, type Coincidencia } from "./recuperar";
import { crearFiltroSalida } from "./salida";
import { normalizar } from "./texto";

/** Lo que se anota de cada pregunta: solo categorías, nunca el texto ni quién preguntó. */
export type Registro = {
  resultado: "base" | "ia" | "sin_respuesta" | "negativa" | "degradada";
  /** Para `degradada`: `proveedor`, `salida`, `limite` o `interno`. Para `negativa`: el tipo de pregunta. */
  motivo?: string;
};

export type ConfiguracionIa = {
  proveedor: Proveedor;
  presupuesto: Presupuesto;
  precios: Precios;
  /** ¿Le queda cupo de IA a esta persona (clave opaca)? Si no, recibe la respuesta de la base. */
  cupoPersona?: (clave: string) => boolean;
  maxTokens?: number;
  /** Tiempo máximo de toda la respuesta con IA. */
  tiempoMaximoMs?: number;
};

export type Dependencias = {
  /** Sin esto el asistente responde solo con la base de conocimiento. */
  ia?: ConfiguracionIa;
  base?: readonly Entrada[];
  registrar?: (registro: Registro) => void;
};

export type Consulta = {
  /** Ya limpia (`limpiarPregunta`). */
  pregunta: string;
  anteriores: readonly string[];
  /** Identifica a la persona para sus cupos, sin ser un dato personal (p. ej. la IP cifrada). */
  clave: string;
};

export const TIEMPO_MAXIMO_MS = 20_000;
const MAX_SUGERENCIAS = 3;
const MAX_ENLACES = 3;

const ENLACES_SIN_RESPUESTA: Enlace[] = [
  { titulo: "Cómo funciona", href: "/#como-funciona" },
  { titulo: "Metodología", href: "/metodologia" },
];

// ── Armado de bloques ──────────────────────────────────────────────────────

function sugerencias(excluir: ReadonlySet<string>, relacionadas: readonly Coincidencia[]): string[] {
  const salida: string[] = [];
  const agregar = (texto: string) => {
    if (salida.length < MAX_SUGERENCIAS && !salida.includes(texto)) salida.push(texto);
  };
  for (const c of relacionadas) {
    if (c.puntaje >= 0.2 && !c.entrada.ejemplo && !excluir.has(c.entrada.id)) agregar(c.entrada.pregunta);
  }
  for (const p of PREGUNTAS_SUGERIDAS) if (!excluir.has(p.entrada)) agregar(p.texto);
  return salida;
}

function enlaces(entradas: readonly Entrada[]): Enlace[] {
  const unicos = new Map<string, Enlace>();
  for (const e of entradas) for (const f of e.fuentes) if (!unicos.has(f.href)) unicos.set(f.href, f);
  return [...unicos.values()].slice(0, MAX_ENLACES);
}

/** ¿Es la pregunta, tal cual, uno de los atajos de la interfaz y justo el de esta entrada? */
function esAtajoDe(pregunta: string, entrada: Entrada): boolean {
  const buscada = normalizar(pregunta);
  return PREGUNTAS_SUGERIDAS.some((p) => p.entrada === entrada.id && normalizar(p.texto) === buscada);
}

/** Una respuesta de la base: la pregunta frecuente, su texto, dónde ver más y qué más preguntar. */
function bloqueBase(entrada: Entrada, relacionadas: readonly Coincidencia[]): EventoAsistente[] {
  return [
    { t: "inicio", modo: "base", coincidencia: entrada.pregunta },
    { t: "texto", d: entrada.respuesta },
    { t: "fuentes", items: [...entrada.fuentes] },
    { t: "sugerencias", items: sugerencias(new Set([entrada.id]), relacionadas) },
    { t: "fin" },
  ];
}

/** Una respuesta fija, sin pregunta frecuente detrás. */
function bloqueFijo(texto: string, fuentes: Enlace[] = [], preguntas?: string[]): EventoAsistente[] {
  return [
    { t: "inicio", modo: "base" },
    { t: "texto", d: texto },
    ...(fuentes.length > 0 ? [{ t: "fuentes", items: fuentes } as const] : []),
    { t: "sugerencias", items: preguntas ?? sugerencias(new Set(), []) },
    { t: "fin" },
  ];
}

// ── Contexto ───────────────────────────────────────────────────────────────

/** Preguntas anteriores válidas; si alguna es un intento de manipulación o trae datos personales, ninguna. */
function anterioresValidas(anteriores: readonly string[]): string[] {
  const limpias: string[] = [];
  for (const bruta of anteriores) {
    const limpia = limpiarPregunta(bruta);
    if (!limpia.ok) continue;
    const intencion = clasificar(limpia.texto);
    if (intencion === "inyeccion" || intencion === "datos_personales") return [];
    limpias.push(limpia.texto);
  }
  return limpias;
}

/**
 * Busca por la pregunta y, si no basta, por la pregunta anterior más la actual: así se entiende un seguimiento como
 * «¿y eso por qué?». El historial solo ayuda cuando la pregunta no trae palabras que la base desconozca: si las trae
 * («¿cuál es la capital de Francia?») es otro tema, y rescatarla con la pregunta anterior repetiría esa respuesta.
 */
function buscar(pregunta: string, anteriores: readonly string[], base: readonly Entrada[]): Coincidencia[] {
  const directo = recuperar(pregunta, base);
  if ((directo[0]?.puntaje ?? 0) >= PUNTAJE_MINIMO || anteriores.length === 0) return directo;
  if (palabrasDesconocidas(pregunta, base).length > 0) return directo;
  const conHistorial = recuperar(`${anteriores[anteriores.length - 1]} ${pregunta}`, base);
  return (conHistorial[0]?.puntaje ?? 0) >= PUNTAJE_MINIMO ? conHistorial : directo;
}

/** Las entradas que ve el modelo: la mejor y, si se acercan, las siguientes. */
function elegirContexto(mejores: readonly Coincidencia[]): Entrada[] {
  const tope = mejores[0].puntaje;
  return mejores
    .filter((c, i) => i === 0 || (c.puntaje >= PUNTAJE_MINIMO / 2 && c.puntaje >= tope * 0.5))
    .slice(0, ENTRADAS_DE_CONTEXTO)
    .map((c) => c.entrada);
}

// ── El recorrido de una pregunta ───────────────────────────────────────────

export async function* responder(
  consulta: Consulta,
  { ia, base = BASE_CONOCIMIENTO, registrar = () => {} }: Dependencias = {},
  senal?: AbortSignal,
): AsyncGenerator<EventoAsistente, void, void> {
  const { pregunta } = consulta;
  const fija = (texto: string, resultado: Registro, fuentes?: Enlace[]) => {
    registrar(resultado);
    return bloqueFijo(texto, fuentes);
  };
  const deLaBase = (id: string, resultado: Registro): EventoAsistente[] | undefined => {
    const entrada = entradaPorId(id, base);
    if (!entrada) return undefined;
    registrar(resultado);
    return bloqueBase(entrada, []);
  };

  // 1 · Políticas: respuestas fijas que no pasan por el modelo.
  const intencion = clasificar(pregunta);
  let eventos: EventoAsistente[] | undefined;
  switch (intencion) {
    case "saludo":
      eventos = fija(MENSAJES.saludo, { resultado: "base", motivo: "saludo" });
      break;
    case "cortesia":
      eventos = fija(MENSAJES.cortesia, { resultado: "base", motivo: "cortesia" });
      break;
    case "datos_personales":
      eventos = fija(MENSAJES.datosPersonales, { resultado: "negativa", motivo: intencion }, [
        { titulo: "Privacidad", href: "/privacidad" },
      ]);
      break;
    case "inyeccion":
      eventos = fija(MENSAJES.inyeccion, { resultado: "negativa", motivo: intencion });
      break;
    case "consejo":
      eventos = deLaBase("recomendaciones", { resultado: "negativa", motivo: intencion });
      break;
    case "prediccion":
      eventos = deLaBase("predicciones", { resultado: "negativa", motivo: intencion });
      break;
    default:
      break;
  }
  if (eventos) {
    yield* eventos;
    return;
  }

  // 2 · Recuperación.
  const anteriores = anterioresValidas(consulta.anteriores);
  const mejores = buscar(pregunta, anteriores, base);
  if (mejores.length === 0 || mejores[0].puntaje < PUNTAJE_MINIMO) {
    registrar({ resultado: "sin_respuesta" });
    yield* bloqueFijo(MENSAJES.sinRespuesta, ENLACES_SIN_RESPUESTA);
    return;
  }
  const mejor = mejores[0].entrada;
  const relacionadas = mejores.slice(1);

  // 3 · Con la base basta si no hay IA o si preguntó, tal cual, una pregunta frecuente: la de la base o uno de los
  // atajos que ofrece la interfaz (que son preguntas frecuentes con otra redacción). Así los atajos nunca gastan IA.
  const esLaPreguntaDeLaBase = normalizar(pregunta) === normalizar(mejor.pregunta) || esAtajoDe(pregunta, mejor);
  if (!ia || esLaPreguntaDeLaBase) {
    registrar({ resultado: "base", motivo: esLaPreguntaDeLaBase ? "exacta" : "recuperada" });
    yield* bloqueBase(mejor, relacionadas);
    return;
  }

  // 4 · Con IA.
  const resultado = yield* conIa(consulta, anteriores, mejores, ia, senal);
  if (resultado.ok) {
    registrar({ resultado: "ia" });
    return;
  }
  registrar({ resultado: "degradada", motivo: resultado.codigo });
  yield { t: "error", codigo: resultado.codigo };
  yield* bloqueBase(mejor, relacionadas);
}

type ResultadoIa = { ok: true } | { ok: false; codigo: CodigoErrorEvento };

async function* conIa(
  consulta: Consulta,
  anteriores: readonly string[],
  mejores: readonly Coincidencia[],
  ia: ConfiguracionIa,
  senalExterna?: AbortSignal,
): AsyncGenerator<EventoAsistente, ResultadoIa, void> {
  const contexto = elegirContexto(mejores);
  const entradaPrompt = { contexto, anteriores, pregunta: consulta.pregunta };
  const mensaje = armarMensaje(entradaPrompt);
  const maxTokens = ia.maxTokens ?? MAX_TOKENS;

  // Cupo de la persona y del día, ANTES de gastar.
  if (ia.cupoPersona && !ia.cupoPersona(consulta.clave)) return { ok: false, codigo: "limite" };
  const reservado = costoMaximoEnMicros(SISTEMA + mensaje, maxTokens, ia.precios);
  let reservaHecha = false;
  try {
    reservaHecha = await ia.presupuesto.reservar(reservado);
  } catch {
    return { ok: false, codigo: "interno" };
  }
  if (!reservaHecha) return { ok: false, codigo: "limite" };

  // Hasta que se sepa lo que se gastó, se cuenta la reserva entera: es lo prudente si la llamada se corta.
  let real = reservado;
  const control = new AbortController();
  const alarma = setTimeout(() => control.abort(), ia.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);
  const cancelar = () => control.abort();
  if (senalExterna?.aborted) control.abort();
  senalExterna?.addEventListener("abort", cancelar, { once: true });

  const filtro = crearFiltroSalida(respaldoDeCifras(entradaPrompt));
  let motivoFin: MotivoFin | undefined;
  let empezo = false;
  let codigo: CodigoErrorEvento | undefined;
  let truncada = false;
  const aEnviar = function* (frases: string[]): Generator<EventoAsistente> {
    for (const frase of frases) {
      if (!empezo) {
        empezo = true;
        yield { t: "inicio", modo: "ia" };
      }
      yield { t: "texto", d: frase };
    }
  };

  try {
    for await (const evento of ia.proveedor.generar({ sistema: SISTEMA, mensaje, maxTokens, senal: control.signal })) {
      if (evento.tipo === "fin") {
        motivoFin = evento.motivo;
        if (evento.uso) real = costoEnMicros(evento.uso, ia.precios);
        continue;
      }
      const revision = filtro.empujar(evento.texto);
      yield* aEnviar(revision.frases);
      if (revision.rechazo) {
        codigo = "salida";
        break;
      }
      if (revision.truncada) {
        truncada = true;
        break;
      }
    }
    if (!codigo && !truncada) {
      if (motivoFin === "rechazo") {
        codigo = "proveedor";
      } else if (motivoFin === "completo" || motivoFin === "otro") {
        // Si se cortó por falta de tokens, lo que quedó sin cerrar se descarta en vez de mostrar media frase.
        const revision = filtro.terminar();
        yield* aEnviar(revision.frases);
        if (revision.rechazo) codigo = "salida";
      }
    }
  } catch {
    codigo = "proveedor";
  } finally {
    clearTimeout(alarma);
    senalExterna?.removeEventListener("abort", cancelar);
    control.abort();
    try {
      await ia.presupuesto.ajustar(reservado, real);
    } catch {
      // Quedó la reserva completa: es lo prudente.
    }
  }

  if (codigo) return { ok: false, codigo };
  if (!empezo) return { ok: false, codigo: "proveedor" }; // no escribió nada (p. ej. se le acabaron los tokens pensando)

  const principales = mejores.filter((c) => contexto.includes(c.entrada) && c.puntaje >= PUNTAJE_MINIMO).map((c) => c.entrada);
  yield { t: "fuentes", items: enlaces(principales.length > 0 ? principales : [contexto[0]]) };
  yield {
    t: "sugerencias",
    items: sugerencias(new Set(contexto.map((e) => e.id).slice(0, 1)), mejores.slice(1)),
  };
  yield { t: "fin" };
  return { ok: true };
}
