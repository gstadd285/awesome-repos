import type { EnviarCorreo } from "@/lib/correo/resend";
import { generarToken, hashToken } from "@/lib/cuentas/tokens";
import { logSecurityEvent, type SecurityEvent } from "@/lib/security/log";
import { correoResumen } from "./correo";
import { seleccionar, ventanaDe, type AlertaParaResumen } from "./seleccion";

/**
 * Corrida del resumen diario (`POST /api/tareas/resumen`, `docs/alertas-reales.md` §7). Con el turno de la tarea tomado:
 *
 * 1. Lee las cuentas que pidieron el resumen y todavía no tienen uno hoy, y las alertas reales publicadas en la ventana.
 * 2. Por cada cuenta con alertas en sus temas, **reserva** en la base, en una transacción: un lugar del cupo del día (si no
 *    queda, la corrida para), el resumen de hoy (clave `(cuenta, día)`: si ya existe, no se envía otro) y el token de baja.
 * 3. Envía y marca el resumen `enviado` o `fallido`. Un fallo no se reintenta ese día (un correo que quizá salió no se
 *    repite); al día siguiente la ventana empieza en el último que sí salió.
 *
 * El correo de cada cuenta se descifra solo para enviar y no se registra. Los registros llevan conteos, nunca correos.
 */

/** Una cuenta que pidió el resumen y aún no tiene el de hoy. `ultimoHasta`: fin de la ventana del último que salió. */
export type Suscrita = {
  cuentaId: string;
  correoCifrado: string;
  correoIndice: string;
  temas: string[];
  ultimoHasta: Date | null;
  /** Cuándo pidió el resumen (`resumen_alta`). */
  pedidoDesde: Date | null;
};

export type Reserva = "ok" | "ya_enviado" | "sin_cupo";

export interface AlmacenResumen {
  /** Las cuentas con `resumen_previo` y sin resumen hoy (día de Chile), las que llevan más tiempo sin uno primero. */
  suscritas(ahora: Date): Promise<Suscrita[]>;
  /** Alertas reales publicadas o corregidas con fecha de publicación en `(desde, hasta]`. */
  publicadas(desde: Date, hasta: Date): Promise<AlertaParaResumen[]>;
  /** Cupo, resumen del día y token de baja, todo o nada. */
  reservar(r: {
    cuentaId: string;
    desde: Date;
    hasta: Date;
    alertas: number;
    tokenHash: string;
    vence: Date;
    tope: number;
    ahora: Date;
  }): Promise<Reserva>;
  /** Marca el resumen reservado en `reservadoEn` (su día de Chile) como enviado o fallido. */
  resolver(cuentaId: string, reservadoEn: Date, estado: "enviado" | "fallido", ahora: Date): Promise<void>;
  /** Borra los tokens de baja vencidos y los resúmenes de más de 90 días. */
  purgar(ahora: Date): Promise<void>;
  registrarCorrida(c: { inicio: Date; fin: Date; cuentas: number; enviados: number; fallos: number; resultado: ResultadoResumen }): Promise<void>;
}

export interface TurnoResumen {
  tomar(): Promise<string | null>;
  soltar(ficha: string): Promise<void>;
}

export type ResultadoResumen = "ok" | "parcial" | "fallida" | "omitida";

export type ResumenDeLaCorrida = {
  resultado: ResultadoResumen;
  /** Cuentas que pidieron el resumen y no tenían el de hoy. */
  cuentas: number;
  enviados: number;
  /** Sin alertas nuevas en sus temas: no se les envía nada. */
  sinNovedades: number;
  fallos: number;
  /** El cupo del día se agotó antes de terminar: las que faltaron lo reciben mañana, con su ventana completa. */
  cupoAgotado: boolean;
};

/** Vigencia del token de baja de cada correo (la base no admite más de 61 días). */
export const VIGENCIA_BAJA_MS = 60 * 24 * 60 * 60_000;
/** La corrida no empieza una cuenta nueva pasado este plazo (Cloud Run corta a los 300 s). */
export const PLAZO_RESUMEN_MS = 240_000;

export type DependenciasResumen = {
  almacen: AlmacenResumen;
  turno: TurnoResumen;
  enviar: EnviarCorreo;
  /** Correo en claro de una cuenta, o `null` si no se puede descifrar. */
  descifrarCorreo: (s: Suscrita) => string | null;
  urlSitio: string;
  /** Resúmenes por día (`RESUMEN_ENVIOS_DIARIOS`). */
  topeDiario: number;
  reloj?: () => Date;
  plazoMs?: number;
  nuevoToken?: () => string;
  registrar?: (evento: SecurityEvent) => void;
};

export async function correrResumen(deps: DependenciasResumen): Promise<ResumenDeLaCorrida> {
  const reloj = deps.reloj ?? (() => new Date());
  const registrar = deps.registrar ?? logSecurityEvent;
  const nuevoToken = deps.nuevoToken ?? generarToken;
  const inicio = reloj();
  const r: ResumenDeLaCorrida = { resultado: "ok", cuentas: 0, enviados: 0, sinNovedades: 0, fallos: 0, cupoAgotado: false };

  const terminar = async () => {
    await deps.almacen
      .registrarCorrida({
        inicio,
        fin: new Date(Math.max(reloj().getTime(), inicio.getTime())),
        cuentas: r.cuentas,
        enviados: r.enviados,
        fallos: r.fallos,
        resultado: r.resultado,
      })
      .catch(() => registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_corrida" }));
    registrar({ tipo: "tarea", tarea: "resumen", resultado: r.resultado, cuentas: r.cuentas, enviados: r.enviados, fallos: r.fallos });
    return r;
  };

  let ficha: string | null;
  try {
    ficha = await deps.turno.tomar();
  } catch {
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_turno" });
    r.resultado = "fallida";
    registrar({ tipo: "tarea", tarea: "resumen", resultado: r.resultado });
    return r;
  }
  if (!ficha) {
    r.resultado = "omitida";
    return terminar();
  }

  try {
    await deps.almacen.purgar(inicio).catch(() => registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_purga" }));
    const suscritas = await deps.almacen.suscritas(inicio);
    r.cuentas = suscritas.length;
    if (suscritas.length === 0) return await terminar();

    const ventanas = new Map(suscritas.map((s) => [s.cuentaId, ventanaDe(s.ultimoHasta, inicio, s.pedidoDesde)]));
    const desdeMinimo = new Date(Math.min(...[...ventanas.values()].map((v) => v.desde.getTime())));
    const alertas = await deps.almacen.publicadas(desdeMinimo, inicio);
    const limite = inicio.getTime() + (deps.plazoMs ?? PLAZO_RESUMEN_MS);

    for (const s of suscritas) {
      if (reloj().getTime() > limite) {
        r.resultado = "parcial";
        break;
      }
      const ventana = ventanas.get(s.cuentaId)!;
      const elegidas = seleccionar(alertas, s.temas, ventana);
      if (elegidas.length === 0) {
        r.sinNovedades += 1;
        continue;
      }
      const para = deps.descifrarCorreo(s);
      if (!para) {
        r.fallos += 1;
        continue;
      }
      const token = nuevoToken();
      const ahora = reloj();
      const reserva = await deps.almacen.reservar({
        cuentaId: s.cuentaId,
        desde: ventana.desde,
        hasta: ventana.hasta,
        alertas: Math.min(elegidas.length, 200),
        tokenHash: hashToken(token),
        vence: new Date(ahora.getTime() + VIGENCIA_BAJA_MS),
        tope: deps.topeDiario,
        ahora,
      });
      if (reserva === "sin_cupo") {
        r.cupoAgotado = true;
        registrar({ tipo: "limite_excedido", recurso: "resumen_envios_diarios" });
        break;
      }
      if (reserva === "ya_enviado") continue;
      let enviado = false;
      try {
        await deps.enviar({ para, ...correoResumen(elegidas, deps.urlSitio, token) });
        enviado = true;
        r.enviados += 1;
      } catch {
        r.fallos += 1;
      }
      await deps.almacen
        .resolver(s.cuentaId, ahora, enviado ? "enviado" : "fallido", reloj())
        .catch(() => registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen_resolver" }));
    }
    if (r.resultado === "ok" && (r.fallos > 0 || r.cupoAgotado)) r.resultado = "parcial";
  } catch {
    registrar({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "resumen" });
    r.resultado = "fallida";
  } finally {
    await deps.turno.soltar(ficha).catch(() => undefined);
  }
  return terminar();
}
