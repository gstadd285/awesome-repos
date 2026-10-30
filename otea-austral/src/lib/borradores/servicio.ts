import { ErrorProveedor } from "@/lib/asistente/proveedor";
import { permiteLecturaIa, type Source } from "@/lib/domain/schemas";
import { hoyEnChile } from "@/lib/format";
import { costoDetalladoEnMicros, estimarTokens, FACTOR_CACHE_ESCRITA, type Precios, type Presupuesto } from "@/lib/ia/gasto";
import type { Descargador } from "@/lib/ingesta/descarga";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";
import type { AlmacenBorradores, EventoParaRedactar, ItemDeRedaccion } from "./almacen-postgres";
import { MAX_BYTES_CONTENIDO, type Bandera, type ModeloBorrador } from "./esquema";
import { leerDocumentos } from "./lectura";
import { armarMensaje, elegirLimite, SISTEMA_BORRADOR, tieneMarcasDeInyeccion, type EntradaMensaje } from "./prompt";
import { MAX_TOKENS_BORRADOR, type ProveedorBorrador } from "./proveedor-borrador";
import { REINTENTABLES, revisarBorrador } from "./revision";

/**
 * Redacción de borradores con IA al final de una corrida de la ingesta (`docs/alertas-reales.md` §1 y §4), con el turno
 * de la tarea tomado. Para cada evento elegible, en orden y de a uno:
 *
 *   fuentes con `lectura_ia` → marcas de inyección en los títulos → lectura transitoria (`lectura.ts`) → mensaje con
 *   límites aleatorios → **reserva del peor caso** → Claude (sin herramientas) → ajuste al uso real → revisión de la
 *   salida (`revision.ts`) → borrador `pendiente` en la cola, o un intento con su motivo.
 *
 * Nada de una fuente sin `lectura_ia` llega al modelo; un evento sin ninguna no se redacta (queda en la cola manual). Si
 * la reserva no alcanza (tope del mes, llamadas, tope total o la base caída) no se llama y la redacción termina. Ningún
 * texto de una fuente ni ningún borrador rechazado se guarda ni se registra. No lee el reloj ni la red por su cuenta.
 */

/** Tope del prompt: Haiku 5.5 cobra el doble pasado los 100.000 tokens; aquí no se pasa nunca de ~17.000. */
export const MAX_TOKENS_ENTRADA = 90_000;
/** Una redacción no empieza si quedan menos de esto antes del plazo (una llamada puede durar 60 s). */
export const MARGEN_LLAMADA_MS = 75_000;

export type ResumenRedaccion = {
  /** `ok`, `tope` (la reserva no alcanzó), `cortada` (se acabó el plazo) o `fallida` (la clave no sirve o la base cayó). */
  estado: "ok" | "tope" | "cortada" | "fallida";
  redactados: number;
  intentos: number;
  llamadas: number;
  costoMicros: number;
};

export type DependenciasRedaccion = {
  fuentes: readonly Source[];
  almacen: AlmacenBorradores;
  descargar: Descargador;
  proveedor: ProveedorBorrador;
  presupuesto: Presupuesto;
  precios: Precios;
  modelo: ModeloBorrador;
  porCorrida: number;
  reloj?: () => Date;
  registrar?: (evento: SecurityEvent) => void;
  /** Solo pruebas: el límite aleatorio de los documentos. */
  azar?: () => string;
};

type Fin = "redactado" | "intento" | "tope" | "fallida";

/** Lo que vio el modelo del evento: solo las fuentes con `lectura_ia` (las demás no viajan). */
function fuentesVisibles(evento: EventoParaRedactar, porId: ReadonlyMap<string, Source>): ItemDeRedaccion[] {
  return evento.items.filter((i) => {
    const f = porId.get(i.sourceId);
    return f !== undefined && permiteLecturaIa(f);
  });
}

export async function redactarBorradores(
  deps: DependenciasRedaccion,
  { senal, plazo }: { senal?: AbortSignal; plazo?: number } = {},
): Promise<ResumenRedaccion> {
  const reloj = deps.reloj ?? (() => new Date());
  const registrar = deps.registrar ?? logSecurityEvent;
  const resumen: ResumenRedaccion = { estado: "ok", redactados: 0, intentos: 0, llamadas: 0, costoMicros: 0 };
  const porId = new Map(deps.fuentes.map((f) => [f.id, f]));
  const conLectura = deps.fuentes.filter(permiteLecturaIa).map((f) => f.id);
  if (conLectura.length === 0) return resumen; // Hoy (2026-10-25) ninguna fuente lo permite: no se llama a nadie.

  let eventos: EventoParaRedactar[];
  try {
    eventos = await deps.almacen.elegibles(reloj(), deps.porCorrida, conLectura);
  } catch {
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "borradores_elegibles" });
    resumen.estado = "fallida";
    return resumen;
  }

  for (const evento of eventos) {
    if (senal?.aborted || (plazo !== undefined && plazo - reloj().getTime() < MARGEN_LLAMADA_MS)) {
      resumen.estado = "cortada";
      break;
    }
    let fin: Fin;
    try {
      fin = await redactarEvento(evento, deps, porId, resumen, registrar, reloj, senal);
    } catch {
      // La base falló al guardar: lo gastado ya quedó contado en la reserva.
      registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "borradores_guardar" });
      resumen.estado = "fallida";
      break;
    }
    if (fin === "redactado") resumen.redactados += 1;
    if (fin === "tope") {
      resumen.estado = "tope";
      registrar({ tipo: "borrador", resultado: "sin_presupuesto" });
      break;
    }
    if (fin === "fallida") {
      resumen.estado = "fallida";
      break;
    }
  }
  return resumen;
}

async function redactarEvento(
  evento: EventoParaRedactar,
  deps: DependenciasRedaccion,
  porId: ReadonlyMap<string, Source>,
  resumen: ResumenRedaccion,
  registrar: (e: SecurityEvent) => void,
  reloj: () => Date,
  senal?: AbortSignal,
): Promise<Fin> {
  const visibles = fuentesVisibles(evento, porId);
  const banderas = new Set<Bandera>();
  if (visibles.length < evento.items.length) banderas.add("fuentes_sin_lectura");
  let llamadas = 0;
  let costo = 0;

  const intento = async (
    resultado: "lectura_manual" | "rechazo" | "revision" | "error",
    motivo: string | null,
    extra: readonly Bandera[] = [],
  ): Promise<Fin> => {
    resumen.intentos += 1;
    registrar({ tipo: "borrador", resultado, ...(motivo ? { motivo } : {}) });
    await deps.almacen.registrarIntento({
      eventoId: evento.id,
      resultado,
      motivo,
      banderas: [...new Set([...banderas, ...extra])],
      llamadas,
      costoMicros: Math.min(costo, 1_000_000),
    });
    return "intento";
  };

  // 1 · Los títulos también llegan de afuera: con marcas de inyección, ni se lee ni se llama.
  if (visibles.length === 0) return "intento"; // no debería pasar: `elegibles` lo exige
  if (visibles.some((i) => tieneMarcasDeInyeccion(`${i.organismo} ${i.titulo}`))) {
    return intento("lectura_manual", "posible_inyeccion", ["posible_inyeccion"]);
  }

  // 2 · Lectura transitoria (en memoria).
  const lectura = await leerDocumentos(
    visibles.map((i) => ({ url: i.url, sourceId: i.sourceId })),
    deps.fuentes,
    deps.descargar,
    senal,
  );
  for (const b of lectura.banderas) if (b !== "posible_inyeccion") banderas.add(b);
  if (lectura.inyeccion) return intento("lectura_manual", "posible_inyeccion", ["posible_inyeccion"]);

  // 3 · El mensaje: metadatos de las fuentes visibles y los documentos entre límites que no aparecen en ellos.
  const entrada: EntradaMensaje = {
    tema: evento.tema,
    claveAgenda: evento.claveAgenda,
    desde: hoyEnChile(evento.primero),
    hasta: hoyEnChile(evento.ultimo),
    fuentes: visibles.map((i) => ({ organismo: i.organismo, tipo: i.tipo, fecha: hoyEnChile(i.fecha), titulo: i.titulo })),
    documentos: lectura.documentos.map((d) => ({ fuente: visibles.findIndex((i) => i.url === d.url) + 1, texto: d.texto })),
  };
  const textos = [...entrada.fuentes.map((f) => f.titulo), ...entrada.documentos.map((d) => d.texto)];
  const limite = elegirLimite(textos, deps.azar);
  if (!limite) return intento("error", "limite_documento");

  let reintento = false;
  let tokens = { entrada: 0, salida: 0, cache: 0 };
  for (;;) {
    const mensaje = armarMensaje(entrada, limite, reintento);
    if (!mensaje) return intento("error", "mensaje");
    const entradaEstimada = estimarTokens(SISTEMA_BORRADOR + mensaje);
    if (entradaEstimada > MAX_TOKENS_ENTRADA) return intento("error", "prompt_grande");

    // 4 · Reserva del peor caso: toda la entrada escrita en la caché y la salida completa.
    const reservado = Math.ceil(
      entradaEstimada * FACTOR_CACHE_ESCRITA * deps.precios.entrada + MAX_TOKENS_BORRADOR * deps.precios.salida,
    );
    let reservada = false;
    try {
      reservada = await deps.presupuesto.reservar(reservado);
    } catch {
      reservada = false;
    }
    if (!reservada) {
      // Si ya se pagó una primera llamada, el intento queda anotado; la redacción termina igual.
      if (llamadas > 0) await intento("revision", "sin_presupuesto_reintento");
      return "tope";
    }

    // 5 · Claude, sin herramientas. Hasta saber lo gastado, cuenta la reserva entera.
    llamadas += 1;
    resumen.llamadas += 1;
    let real = reservado;
    let respuesta;
    try {
      respuesta = await deps.proveedor.redactar({ sistema: SISTEMA_BORRADOR, mensaje, maxTokens: MAX_TOKENS_BORRADOR, senal });
      real = costoDetalladoEnMicros(respuesta.uso, deps.precios);
    } catch (error) {
      costo += real;
      resumen.costoMicros += real;
      const codigo = error instanceof ErrorProveedor ? error.codigo : "desconocido";
      await intento("error", codigo);
      // Con la clave rechazada, las siguientes también fallarían: se termina.
      return codigo === "autenticacion" ? "fallida" : "intento";
    } finally {
      try {
        await deps.presupuesto.ajustar(reservado, real);
      } catch {
        // Queda la reserva completa: es lo prudente.
      }
    }
    costo += real;
    resumen.costoMicros += real;
    tokens = {
      entrada: tokens.entrada + respuesta.uso.entrada + respuesta.uso.cacheEscrita,
      salida: tokens.salida + respuesta.uso.salida,
      cache: tokens.cache + respuesta.uso.cacheLeida,
    };

    if (respuesta.motivo === "rechazo") return intento("rechazo", respuesta.categoria ?? "sin_categoria");
    if (respuesta.motivo === "limite") return intento("revision", "max_tokens");

    // 6 · Revisión de la salida.
    const revisado = revisarBorrador(respuesta.texto, {
      tema: evento.tema,
      fuentes: evento.items.map((i) => ({ tipo: i.tipo, organismo: i.organismo })),
      respaldo: mensaje,
      textos: lectura.documentos.map((d) => d.texto),
      ahora: reloj().toISOString(),
    });
    if (!revisado.ok) {
      if (!reintento && REINTENTABLES.has(revisado.motivo)) {
        reintento = true;
        banderas.add("reintento");
        continue;
      }
      return intento("revision", revisado.motivo);
    }
    if (new TextEncoder().encode(JSON.stringify(revisado.borrador)).length > MAX_BYTES_CONTENIDO) {
      return intento("revision", "largo");
    }

    // 7 · A la cola: borrador pendiente y evento `con_borrador`, en una transacción.
    for (const b of revisado.banderas) banderas.add(b);
    const guardado = await deps.almacen.guardarBorrador({
      eventoId: evento.id,
      contenido: revisado.borrador,
      modelo: deps.modelo,
      entradaTokens: tokens.entrada,
      salidaTokens: tokens.salida,
      cacheTokens: tokens.cache,
      costoMicros: Math.min(costo, 1_000_000),
      copiaProporcion: revisado.copia.proporcion,
      copiaTramo: revisado.copia.tramo,
      documentos: lectura.documentos.length,
      banderas: [...banderas].filter((b) => b !== "posible_inyeccion"),
      llamadas,
    });
    if (!guardado) return "intento";
    registrar({ tipo: "borrador", resultado: "redactado" });
    resumen.intentos += 1;
    return "redactado";
  }
}
