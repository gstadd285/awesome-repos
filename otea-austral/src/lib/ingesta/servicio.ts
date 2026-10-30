import type { Feed, Source } from "@/lib/domain/schemas";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";
import { claveItem } from "./canonica";
import type { Descargador, FuenteDescarga } from "./descarga";
import { decodificar, leerFeed, normalizarItem } from "./feeds";
import { permitePorRobots } from "./robots";

/**
 * Una corrida de la ingesta (`docs/alertas-reales.md` §2): turno en la base → `robots.txt` → feeds verificados del
 * registro → `fuente_items` (solo metadatos). Secuencial, con presupuesto de tiempo; lo que no alcanza queda para la
 * siguiente. No lee el reloj ni la red por su cuenta: todo llega como dependencia (las pruebas usan dobles).
 */

export const PRESUPUESTO_CORRIDA_MS = 4 * 60_000;
/**
 * Plazo de toda la corrida, borradores incluidos: Cloud Run y Cloud Scheduler cortan a los 300 s (`--timeout=300`,
 * `--attempt-deadline=300s`). La redacción no empieza un borrador si no le alcanza antes de este plazo.
 */
export const PLAZO_CORRIDA_MS = 270_000;
export const FALLOS_PARA_PAUSA = 3;
export const PAUSA_MS = 24 * 60 * 60_000;
export const VIGENCIA_ROBOTS_MS = 24 * 60 * 60_000;

export type EstadoRobots = "sin_revisar" | "permitido" | "prohibido";

export type EstadoFeed = {
  feedUrl: string;
  sourceId: string;
  etag: string | null;
  ultimaModificacion: string | null;
  ultimoIntento: Date | null;
  ultimoOk: Date | null;
  fallosSeguidos: number;
  pausadoHasta: Date | null;
  robots: EstadoRobots;
  robotsRevisado: Date | null;
  /** Código (`tiempo`, `robots_prohibido`…), nunca un mensaje. */
  ultimoError: string | null;
};

/** Lo único que se guarda de un ítem: metadatos. */
export type ItemParaGuardar = {
  sourceId: string;
  feedUrl: string;
  clave: string;
  titulo: string;
  url: string;
  identificador: string | null;
  publicado: Date | null;
};

export type ResultadoCorrida = "ok" | "parcial" | "fallida" | "omitida";

export type Corrida = {
  tarea: "ingesta";
  inicio: Date;
  fin: Date;
  feeds: number;
  nuevos: number;
  fallos: number;
  /** Borradores con IA que la corrida dejó en la cola y lo que costaron (0 sin IA). */
  borradores: number;
  costoMicros: number;
  resultado: ResultadoCorrida;
};

export interface AlmacenIngesta {
  /** Estado guardado del feed; si no existe, lo crea sin historia. */
  estadoFeed(feedUrl: string, sourceId: string): Promise<EstadoFeed>;
  guardarEstado(estado: EstadoFeed): Promise<void>;
  /** Inserta los ítems que no estaban (por `source_id` y clave) y devuelve cuántos eran nuevos. */
  guardarItems(items: readonly ItemParaGuardar[]): Promise<number>;
  registrarCorrida(corrida: Corrida): Promise<void>;
}

export interface Turno {
  /** Toma el turno de la tarea; `null` si otra corrida lo tiene. */
  tomar(): Promise<string | null>;
  soltar(token: string): Promise<void>;
}

export type FeedElegible = { fuente: Source; feed: Feed };

/**
 * Solo fuentes activas, con acceso `rss` o `api`, condiciones de reutilización «Verificadas el …» y feeds con fecha de
 * verificación. Hoy (2026-10-25) ninguna fuente cumple: la ingesta no tiene nada que leer.
 */
export function feedsElegibles(fuentes: readonly Source[], hoy: string): FeedElegible[] {
  return fuentes
    .filter((f) => f.activa && (f.acceso === "rss" || f.acceso === "api") && /^Verificadas el \d{4}-\d{2}-\d{2}: /.test(f.condiciones_reutilizacion))
    .flatMap((fuente) => fuente.feeds.filter((feed) => feed.verificado <= hoy).map((feed) => ({ fuente, feed })));
}

/** Lo que deja la agrupación en eventos candidatos (`agrupar.ts`, §3). */
export type ResumenAgrupacion = { asignados: number; eventosNuevos: number };

/** Lo que deja la redacción de borradores con IA (`borradores/servicio.ts`, §4); la ingesta no sabe más que esto. */
export type ResumenRedaccionCorrida = { estado: string; redactados: number; costoMicros: number };

export type DependenciasIngesta = {
  fuentes: readonly Source[];
  almacen: AlmacenIngesta;
  turno: Turno;
  descargar: Descargador;
  /** Agrupa los ítems sin evento (con el turno todavía tomado). Sin ella, la corrida solo ingiere. */
  agrupar?: (ahora: Date) => Promise<ResumenAgrupacion>;
  /**
   * Redacta borradores con IA (con el turno tomado, después de agrupar). Solo existe con `BORRADORES_MODO=ia` en
   * `otea-tareas`; sin ella, la corrida no llama a ningún modelo.
   */
  redactar?: (opciones: { senal?: AbortSignal; plazo?: number }) => Promise<ResumenRedaccionCorrida>;
  reloj?: () => Date;
  presupuestoMs?: number;
  registrar?: (evento: SecurityEvent) => void;
};

export type ResumenCorrida = {
  resultado: ResultadoCorrida;
  /** Feeds elegibles que la corrida alcanzó a revisar (leídos, sin cambios, en pausa o fallidos). */
  feeds: number;
  nuevos: number;
  fallos: number;
  pausados: number;
  /** Ningún feed elegible en el registro. */
  sinFeeds: boolean;
  /** Solo si la corrida agrupó (la agrupación también corre sin feeds: puede haber ítems pendientes). */
  agrupacion?: ResumenAgrupacion;
  /** Solo con los borradores con IA activos. */
  redaccion?: ResumenRedaccionCorrida;
};

type Veredicto = { estado: "permitido" | "prohibido" | "no_disponible" };

export async function correrIngesta(deps: DependenciasIngesta): Promise<ResumenCorrida> {
  const reloj = deps.reloj ?? (() => new Date());
  const registrar = deps.registrar ?? logSecurityEvent;
  const inicio = reloj();
  const elegibles = feedsElegibles(deps.fuentes, inicio.toISOString().slice(0, 10));
  const resumen: ResumenCorrida = { resultado: "ok", feeds: 0, nuevos: 0, fallos: 0, pausados: 0, sinFeeds: elegibles.length === 0 };

  const anotar = () =>
    registrar({
      tipo: "tarea",
      tarea: "ingesta",
      resultado: resumen.sinFeeds && resumen.resultado === "ok" ? "sin_feeds" : resumen.resultado,
      feeds: resumen.feeds,
      nuevos: resumen.nuevos,
      fallos: resumen.fallos,
      ...(resumen.agrupacion ? { agrupados: resumen.agrupacion.asignados } : {}),
      ...(resumen.redaccion ? { borradores: resumen.redaccion.redactados } : {}),
    });
  const corrida = (): Corrida => ({
    tarea: "ingesta",
    inicio,
    fin: new Date(Math.max(reloj().getTime(), inicio.getTime())),
    feeds: resumen.feeds,
    nuevos: resumen.nuevos,
    fallos: resumen.fallos,
    borradores: resumen.redaccion?.redactados ?? 0,
    costoMicros: resumen.redaccion?.costoMicros ?? 0,
    resultado: resumen.resultado,
  });

  let token: string | null;
  try {
    token = await deps.turno.tomar();
  } catch {
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "ingesta_turno" });
    resumen.resultado = "fallida";
    anotar();
    return resumen;
  }
  if (!token) {
    resumen.resultado = "omitida";
    await deps.almacen.registrarCorrida(corrida()).catch(() => undefined);
    anotar();
    return resumen;
  }

  const presupuesto = new AbortController();
  const reloj4 = setTimeout(() => presupuesto.abort(), deps.presupuestoMs ?? PRESUPUESTO_CORRIDA_MS);
  let cortada = false;
  let intentados = 0;
  const robotsPorHost = new Map<string, Promise<{ texto: string | null } | null>>();

  /** `robots.txt` del host, una vez por corrida: texto, `{ texto: null }` si no existe (404) o `null` si no llegó. */
  const robotsDe = (fuente: FuenteDescarga, url: URL) => {
    let pendiente = robotsPorHost.get(url.host);
    if (!pendiente) {
      pendiente = deps
        .descargar({ fuente, url: `https://${url.host}/robots.txt`, clase: "robots", senal: presupuesto.signal })
        .then((r) => {
          if (r.estado === "ok") return { texto: decodificar(r.cuerpo, r.tipo) ?? "" };
          if (r.estado === "error" && r.codigo === "no_encontrado") return { texto: null };
          return null;
        });
      robotsPorHost.set(url.host, pendiente);
    }
    return pendiente;
  };

  const veredictoRobots = async (fuente: Source, url: URL): Promise<Veredicto> => {
    const robots = await robotsDe(fuente, url);
    if (!robots) return { estado: "no_disponible" };
    if (robots.texto === null) return { estado: "permitido" };
    return { estado: permitePorRobots(robots.texto, url) ? "permitido" : "prohibido" };
  };

  try {
    for (const { fuente, feed } of elegibles) {
      if (presupuesto.signal.aborted) {
        cortada = true;
        break;
      }
      resumen.feeds += 1;
      const ahora = reloj();
      const estado = await deps.almacen.estadoFeed(feed.url, fuente.id);
      if (estado.pausadoHasta && estado.pausadoHasta > ahora) {
        resumen.pausados += 1;
        continue;
      }
      intentados += 1;
      estado.ultimoIntento = ahora;

      const fallar = async (codigo: string, reintentarDesde?: Date) => {
        resumen.fallos += 1;
        estado.fallosSeguidos += 1;
        estado.ultimoError = codigo;
        if (reintentarDesde) estado.pausadoHasta = reintentarDesde;
        if (estado.fallosSeguidos >= FALLOS_PARA_PAUSA) {
          const pausa = new Date(ahora.getTime() + PAUSA_MS);
          if (!estado.pausadoHasta || estado.pausadoHasta < pausa) estado.pausadoHasta = pausa;
          registrar({ tipo: "ingesta_feed", fuente: fuente.id, evento: "pausa", codigo });
        }
        await deps.almacen.guardarEstado(estado);
      };

      const url = new URL(feed.url);
      const revisado = estado.robotsRevisado?.getTime() ?? -Infinity;
      if (estado.robots !== "permitido" || ahora.getTime() - revisado >= VIGENCIA_ROBOTS_MS) {
        const veredicto = await veredictoRobots(fuente, url);
        if (presupuesto.signal.aborted) {
          cortada = true;
          break;
        }
        if (veredicto.estado === "no_disponible") {
          // Sin poder leer `robots.txt` no se lee el feed.
          await fallar("robots_no_disponible");
          continue;
        }
        estado.robots = veredicto.estado;
        estado.robotsRevisado = ahora;
        if (veredicto.estado === "prohibido") {
          estado.pausadoHasta = new Date(ahora.getTime() + PAUSA_MS);
          estado.ultimoError = "robots_prohibido";
          resumen.pausados += 1;
          registrar({ tipo: "ingesta_feed", fuente: fuente.id, evento: "robots_prohibido", codigo: "robots_prohibido" });
          await deps.almacen.guardarEstado(estado);
          continue;
        }
      }

      const descarga = await deps.descargar({
        fuente,
        url: feed.url,
        clase: feed.formato === "api" ? "feed_json" : "feed_xml",
        etag: estado.etag,
        ultimaModificacion: estado.ultimaModificacion,
        senal: presupuesto.signal,
      });
      if (descarga.estado === "error") {
        if (presupuesto.signal.aborted && descarga.codigo === "tiempo") {
          // Se acabó el tiempo de la corrida, no es culpa del feed.
          cortada = true;
          break;
        }
        await fallar(descarga.codigo, descarga.reintentarDesde);
        continue;
      }

      if (descarga.estado === "ok") {
        const texto = decodificar(descarga.cuerpo, descarga.tipo);
        if (texto === null) {
          await fallar("codificacion");
          continue;
        }
        const lectura = leerFeed(texto, feed.formato);
        if (!lectura.ok) {
          await fallar(lectura.codigo);
          continue;
        }
        const porClave = new Map<string, ItemParaGuardar>();
        for (const crudo of lectura.items) {
          const item = normalizarItem(crudo, { urlFeed: descarga.url, urlBase: fuente.url_base, ahora });
          if (!item) continue;
          const clave = claveItem(fuente.id, item.guid, item.url);
          if (!clave || porClave.has(clave)) continue;
          porClave.set(clave, {
            sourceId: fuente.id,
            feedUrl: feed.url,
            clave,
            titulo: item.titulo,
            url: item.url,
            identificador: item.identificador,
            publicado: item.publicado,
          });
        }
        resumen.nuevos += porClave.size > 0 ? await deps.almacen.guardarItems([...porClave.values()]) : 0;
        estado.etag = descarga.etag;
        estado.ultimaModificacion = descarga.ultimaModificacion;
      }

      estado.ultimoOk = ahora;
      estado.fallosSeguidos = 0;
      estado.pausadoHasta = null;
      estado.ultimoError = null;
      await deps.almacen.guardarEstado(estado);
    }

    if (cortada) resumen.resultado = "parcial";
    else if (resumen.fallos === 0) resumen.resultado = "ok";
    else resumen.resultado = resumen.fallos < intentados ? "parcial" : "fallida";
  } catch {
    // La base falló a mitad de camino: lo ya guardado queda; la corrida se cuenta como fallida.
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "ingesta" });
    resumen.resultado = "fallida";
  } finally {
    clearTimeout(reloj4);
  }

  if (deps.agrupar) {
    // Los ítems que no se agrupen quedan sin evento y la siguiente corrida los vuelve a intentar.
    try {
      resumen.agrupacion = await deps.agrupar(reloj());
    } catch {
      registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "ingesta_agrupar" });
      if (resumen.resultado === "ok") resumen.resultado = "parcial";
    }
  }

  if (deps.redactar && resumen.resultado !== "fallida") {
    // Con el turno todavía tomado: dos corridas nunca redactan a la vez. Lo que no alcanza queda para la siguiente.
    const plazo = inicio.getTime() + PLAZO_CORRIDA_MS;
    const senal = AbortSignal.timeout(Math.max(1, plazo - reloj().getTime()));
    try {
      resumen.redaccion = await deps.redactar({ senal, plazo });
    } catch {
      registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "borradores" });
      resumen.redaccion = { estado: "fallida", redactados: 0, costoMicros: 0 };
    }
  }

  await deps.almacen.registrarCorrida(corrida()).catch(() => {
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "ingesta_corrida" });
  });
  await deps.turno.soltar(token).catch(() => undefined);
  anotar();
  return resumen;
}
