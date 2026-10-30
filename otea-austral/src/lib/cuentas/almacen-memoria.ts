import { randomUUID } from "node:crypto";
import type {
  AlmacenCuentas,
  AuditoriaInvitacion,
  CuentaGuardada,
  EventoGuardado,
  SesionLeida,
  SesionListada,
  TipoEvento,
  InvitacionGuardada,
} from "./almacen";
import { MAX_SESIONES_POR_CUENTA, PLAZO_ALTAS_SIN_CONFIRMAR_MS, RETENCION_EVENTOS_MS, SESION_INACTIVA_MS } from "./constantes";

/**
 * Cuentas en memoria: solo para desarrollo (`CUENTAS_MODO=memoria`) y para probar el servicio sin base de datos. Se
 * pierde al reiniciar el servidor. Cumple el mismo contrato que el almacén de Postgres (`contrato-almacen.ts`).
 */
type Token = {
  proposito: "alta" | "restablecer";
  cuentaId: string | null;
  correoIndice: string | null;
  correoCifrado: string | null;
  versionTextos: string | null;
  aceptado: string | null;
  emitido: string;
  usado: string | null;
  invitacionId: string | null;
};

type Invitacion = InvitacionGuardada & { codigoHash: string; cuentaId: string | null };

type Sesion = {
  id: string;
  cuentaId: string;
  fase: "pendiente" | "activa";
  creada: string;
  ultimoUso: string;
  expira: string;
  revocada: string | null;
  dispositivo: string | null;
};

const ms = (iso: string) => Date.parse(iso);
const DIA_MS = 24 * 60 * 60_000;

/** Día de Chile (AAAA-MM-DD) de un instante: la cuota de correos se reinicia a medianoche de Chile. */
export function diaDeChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function crearAlmacenMemoria(): AlmacenCuentas & { cuentasGuardadas(): readonly CuentaGuardada[] } {
  const cuentas = new Map<string, CuentaGuardada>();
  const porCorreo = new Map<string, string>();
  const tokens = new Map<string, Token>();
  const sesiones = new Map<string, Sesion>();
  const codigos = new Map<string, Map<string, string | null>>();
  const eventos: { id: number; cuentaId: string; tipo: TipoEvento; fecha: string }[] = [];
  const cuota = new Map<string, number>();
  const invitaciones = new Map<string, Invitacion>();
  const auditoria: Omit<AuditoriaInvitacion, "alias">[] = [];
  let siguienteEvento = 1;
  const vigente = (i: Invitacion, ahora: string) => i.usada === null && i.revocada === null && ms(i.vence) > ms(ahora);
  const sinCodigo = (i: Invitacion): InvitacionGuardada => ({
    id: i.id,
    alias: i.alias,
    emitida: i.emitida,
    vence: i.vence,
    envios: i.envios,
    usada: i.usada,
    revocada: i.revocada,
  });

  const copia = (c: CuentaGuardada): CuentaGuardada => ({ ...c, temas: [...c.temas] });
  const evento = (cuentaId: string, tipo: TipoEvento, fecha: string) => {
    eventos.push({ id: siguienteEvento++, cuentaId, tipo, fecha });
  };

  function revocarDe(cuentaId: string, ahora: string, conservar?: string): number {
    let n = 0;
    for (const [hash, s] of sesiones) {
      if (s.cuentaId === cuentaId && s.revocada === null && hash !== conservar) {
        s.revocada = ahora;
        n++;
      }
    }
    return n;
  }

  function abrirSesion(cuentaId: string, s: { tokenHash: string; fase: "pendiente" | "activa"; ahora: string; expira: string; dispositivo: string | null }, maximo: number) {
    if (s.fase === "activa") {
      const abiertas = [...sesiones.values()]
        .filter((x) => x.cuentaId === cuentaId && x.fase === "activa" && x.revocada === null && ms(x.expira) > ms(s.ahora))
        .sort((a, b) => ms(a.creada) - ms(b.creada));
      for (const vieja of abiertas.slice(0, Math.max(0, abiertas.length - maximo + 1))) vieja.revocada = s.ahora;
    }
    const sesion: Sesion = {
      id: randomUUID(),
      cuentaId,
      fase: s.fase,
      creada: s.ahora,
      ultimoUso: s.ahora,
      expira: s.expira,
      revocada: null,
      dispositivo: s.dispositivo,
    };
    sesiones.set(s.tokenHash, sesion);
    if (s.fase === "activa") evento(cuentaId, "acceso", s.ahora);
    return sesion;
  }

  function emitir(
    pendiente: [string, Token] | undefined,
    token: { hash: string; datos: Token },
    reenviarSiAnteriorA: string,
  ): "nuevo" | "renovado" | "reciente" {
    if (pendiente) {
      if (ms(pendiente[1].emitido) >= ms(reenviarSiAnteriorA)) return "reciente";
      tokens.delete(pendiente[0]);
      tokens.set(token.hash, token.datos);
      return "renovado";
    }
    tokens.set(token.hash, token.datos);
    return "nuevo";
  }

  return {
    cuentasGuardadas: () => [...cuentas.values()].map(copia),

    async emitirAlta(e) {
      if (porCorreo.has(e.correoIndice)) return "existente";
      const pendiente = [...tokens].find(([, t]) => t.proposito === "alta" && t.correoIndice === e.correoIndice && t.usado === null);
      return emitir(
        pendiente,
        {
          hash: e.tokenHash,
          datos: {
            proposito: "alta",
            cuentaId: null,
            correoIndice: e.correoIndice,
            correoCifrado: e.correoCifrado,
            versionTextos: e.versionTextos,
            aceptado: e.ahora,
            emitido: e.ahora,
            usado: null,
            invitacionId: e.invitacionId ?? null,
          },
        },
        e.reenviarSiAnteriorA,
      );
    },

    async leerAlta(tokenHash, vigenteDesde) {
      const t = tokens.get(tokenHash);
      if (!t || t.proposito !== "alta" || t.usado !== null || ms(t.emitido) < ms(vigenteDesde)) return null;
      return { correoIndice: t.correoIndice!, correoCifrado: t.correoCifrado!, versionTextos: t.versionTextos!, aceptado: t.aceptado! };
    },

    async activarAlta({ tokenHash, vigenteDesde, claveHash, ahora, sesion, exigirInvitacion = false }) {
      const t = tokens.get(tokenHash);
      if (!t || t.proposito !== "alta" || t.usado !== null || ms(t.emitido) < ms(vigenteDesde)) return "invalido";
      // Todo lo que sigue es síncrono: comprobar y gastar la invitación no deja hueco para otra activación.
      // Mismo orden que en la base: primero el correo repetido, después la invitación.
      if (porCorreo.has(t.correoIndice!)) return "duplicado";
      const invitacion = exigirInvitacion ? (t.invitacionId ? invitaciones.get(t.invitacionId) : undefined) : undefined;
      if (exigirInvitacion && (!invitacion || !vigente(invitacion, ahora))) return "invitacion";
      const id = randomUUID();
      if (invitacion) {
        invitacion.usada = ahora;
        invitacion.cuentaId = id;
        auditoria.push({ invitacionId: invitacion.id, accion: "usada", actor: null, fecha: ahora });
      }
      cuentas.set(id, {
        id,
        correoIndice: t.correoIndice!,
        correoCifrado: t.correoCifrado!,
        nombre: null,
        claveHash,
        claveCambiada: ahora,
        fallos: 0,
        fallosDesde: null,
        totpSecretoCifrado: null,
        totpPendienteCifrado: null,
        totpActivado: null,
        totpUltimoPaso: null,
        versionTextos: t.versionTextos!,
        aceptado: t.aceptado!,
        temas: [],
        resumenPrevio: false,
        resumenDesde: null,
        creada: ahora,
      });
      porCorreo.set(t.correoIndice!, id);
      t.usado = ahora;
      evento(id, "alta", ahora);
      const abierta = abrirSesion(id, { ...sesion, fase: "activa", ahora }, MAX_SESIONES_POR_CUENTA);
      return { cuentaId: id, sesionId: abierta.id };
    },

    async descartarEnlace(tokenHash) {
      const t = tokens.get(tokenHash);
      if (t && t.usado === null) tokens.delete(tokenHash);
    },

    async buscarPorCorreo(correoIndice) {
      const id = porCorreo.get(correoIndice);
      const c = id ? cuentas.get(id) : undefined;
      return c ? copia(c) : null;
    },

    async buscarPorId(id) {
      const c = cuentas.get(id);
      return c ? copia(c) : null;
    },

    async registrarFallo(cuentaId, ahora, ventanaDesde, puntos) {
      const c = cuentas.get(cuentaId);
      if (!c) return 0;
      if (c.fallosDesde === null || ms(c.fallosDesde) <= ms(ventanaDesde)) {
        c.fallos = puntos;
        c.fallosDesde = ahora;
      } else {
        c.fallos += puntos;
      }
      return c.fallos;
    },

    async limpiarFallos(cuentaId) {
      const c = cuentas.get(cuentaId);
      if (c) {
        c.fallos = 0;
        c.fallosDesde = null;
      }
    },

    async actualizarPerfil(cuentaId, perfil, ahora) {
      const c = cuentas.get(cuentaId);
      if (c) {
        c.nombre = perfil.nombre;
        c.temas = [...perfil.temas];
        c.resumenDesde = perfil.resumenPrevio ? (c.resumenDesde ?? ahora) : null;
        c.resumenPrevio = perfil.resumenPrevio;
      }
    },

    async actualizarTemas(cuentaId, temas) {
      const c = cuentas.get(cuentaId);
      if (c) c.temas = [...temas];
    },

    async cambiarClave({ cuentaId, claveHash, ahora, conservarSesion }) {
      const c = cuentas.get(cuentaId);
      if (!c) return;
      c.claveHash = claveHash;
      c.claveCambiada = ahora;
      c.fallos = 0;
      c.fallosDesde = null;
      revocarDe(cuentaId, ahora, conservarSesion);
      evento(cuentaId, "clave_cambiada", ahora);
    },

    async renovarHashClave(cuentaId, claveHashAnterior, claveHashNueva) {
      const c = cuentas.get(cuentaId);
      if (c && c.claveHash === claveHashAnterior) c.claveHash = claveHashNueva;
    },

    async eliminarCuenta(cuentaId) {
      const c = cuentas.get(cuentaId);
      if (!c) return;
      cuentas.delete(cuentaId);
      porCorreo.delete(c.correoIndice);
      for (const [hash, t] of tokens) if (t.cuentaId === cuentaId) tokens.delete(hash);
      for (const [hash, s] of sesiones) if (s.cuentaId === cuentaId) sesiones.delete(hash);
      codigos.delete(cuentaId);
      for (let i = eventos.length - 1; i >= 0; i--) if (eventos[i].cuentaId === cuentaId) eventos.splice(i, 1);
      // Como `on delete set null` en la base: la invitación sigue en la auditoría, sin apuntar a la cuenta.
      for (const inv of invitaciones.values()) if (inv.cuentaId === cuentaId) inv.cuentaId = null;
    },

    async emitirRestablecer(e) {
      const pendiente = [...tokens].find(([, t]) => t.proposito === "restablecer" && t.cuentaId === e.cuentaId && t.usado === null);
      return emitir(
        pendiente,
        {
          hash: e.tokenHash,
          datos: {
            proposito: "restablecer",
            invitacionId: null,
            cuentaId: e.cuentaId,
            correoIndice: null,
            correoCifrado: null,
            versionTextos: null,
            aceptado: null,
            emitido: e.ahora,
            usado: null,
          },
        },
        e.reenviarSiAnteriorA,
      );
    },

    async leerRestablecer(tokenHash, vigenteDesde) {
      const t = tokens.get(tokenHash);
      if (!t || t.proposito !== "restablecer" || t.usado !== null || ms(t.emitido) < ms(vigenteDesde)) return null;
      return cuentas.has(t.cuentaId!) ? { cuentaId: t.cuentaId! } : null;
    },

    async usarRestablecer({ tokenHash, vigenteDesde, claveHash, ahora }) {
      const t = tokens.get(tokenHash);
      if (!t || t.proposito !== "restablecer" || t.usado !== null || ms(t.emitido) < ms(vigenteDesde)) return null;
      const c = cuentas.get(t.cuentaId!);
      if (!c) return null;
      t.usado = ahora;
      c.claveHash = claveHash;
      c.claveCambiada = ahora;
      c.fallos = 0;
      c.fallosDesde = null;
      revocarDe(c.id, ahora);
      evento(c.id, "clave_restablecida", ahora);
      return { cuentaId: c.id };
    },

    async guardarTotpPendiente(cuentaId, cifrado) {
      const c = cuentas.get(cuentaId);
      if (c && c.totpActivado === null) c.totpPendienteCifrado = cifrado;
    },

    async activarTotp({ cuentaId, ahora, paso, codigosHash }) {
      const c = cuentas.get(cuentaId);
      if (!c || !c.totpPendienteCifrado || c.totpActivado !== null) return false;
      c.totpSecretoCifrado = c.totpPendienteCifrado;
      c.totpPendienteCifrado = null;
      c.totpActivado = ahora;
      c.totpUltimoPaso = paso;
      codigos.set(cuentaId, new Map(codigosHash.map((h) => [h, null])));
      evento(cuentaId, "dos_pasos_activados", ahora);
      return true;
    },

    async desactivarTotp(cuentaId, ahora) {
      const c = cuentas.get(cuentaId);
      if (!c) return;
      c.totpSecretoCifrado = null;
      c.totpPendienteCifrado = null;
      c.totpActivado = null;
      c.totpUltimoPaso = null;
      codigos.delete(cuentaId);
      evento(cuentaId, "dos_pasos_desactivados", ahora);
    },

    async gastarPasoTotp(cuentaId, paso) {
      const c = cuentas.get(cuentaId);
      if (!c || (c.totpUltimoPaso !== null && paso <= c.totpUltimoPaso)) return false;
      c.totpUltimoPaso = paso;
      return true;
    },

    async gastarCodigoRecuperacion(cuentaId, codigoHash, ahora) {
      const lista = codigos.get(cuentaId);
      if (!lista || lista.get(codigoHash) !== null) return false; // no existe (undefined) o ya se usó
      lista.set(codigoHash, ahora);
      return true;
    },

    async reemplazarCodigos(cuentaId, codigosHash, ahora) {
      if (!cuentas.has(cuentaId)) return;
      codigos.set(cuentaId, new Map(codigosHash.map((h) => [h, null])));
      evento(cuentaId, "codigos_regenerados", ahora);
    },

    async contarCodigosLibres(cuentaId) {
      return [...(codigos.get(cuentaId)?.values() ?? [])].filter((u) => u === null).length;
    },

    async crearSesion(cuentaId, s, maximo) {
      return { id: abrirSesion(cuentaId, s, maximo).id };
    },

    async leerSesion(tokenHash, ahora, usadaDesde) {
      const s = sesiones.get(tokenHash);
      if (!s || s.revocada !== null || ms(s.expira) <= ms(ahora) || ms(s.ultimoUso) <= ms(usadaDesde)) return null;
      const c = cuentas.get(s.cuentaId);
      if (!c) return null;
      const leida: SesionLeida = {
        id: s.id,
        cuentaId: s.cuentaId,
        fase: s.fase,
        creada: s.creada,
        expira: s.expira,
        nombre: c.nombre,
        dosPasos: c.totpActivado !== null,
      };
      return leida;
    },

    async tocarSesion(tokenHash, ahora, anteriorA) {
      const s = sesiones.get(tokenHash);
      if (s && s.revocada === null && ms(s.ultimoUso) < ms(anteriorA)) s.ultimoUso = ahora;
    },

    async ascenderSesion({ tokenHashPendiente, sesion, maximo }) {
      const previa = sesiones.get(tokenHashPendiente);
      if (!previa || previa.fase !== "pendiente" || previa.revocada !== null || ms(previa.expira) <= ms(sesion.ahora)) return null;
      previa.revocada = sesion.ahora;
      const nueva = abrirSesion(previa.cuentaId, { ...sesion, fase: "activa" }, maximo);
      return { id: nueva.id, cuentaId: previa.cuentaId };
    },

    async revocarSesion(tokenHash, ahora) {
      const s = sesiones.get(tokenHash);
      if (s && s.revocada === null) s.revocada = ahora;
    },

    async revocarSesionPorId(cuentaId, id, ahora) {
      for (const s of sesiones.values()) {
        if (s.id === id && s.cuentaId === cuentaId && s.fase === "activa" && s.revocada === null && ms(s.expira) > ms(ahora)) {
          s.revocada = ahora;
          return true;
        }
      }
      return false;
    },

    async revocarOtras(cuentaId, conservarTokenHash, ahora) {
      const n = revocarDe(cuentaId, ahora, conservarTokenHash);
      if (n > 0) evento(cuentaId, "sesiones_cerradas", ahora);
      return n;
    },

    async listarSesiones(cuentaId, ahora, usadaDesde, actualTokenHash) {
      const lista: SesionListada[] = [];
      for (const [hash, s] of sesiones) {
        if (s.cuentaId !== cuentaId || s.fase !== "activa" || s.revocada !== null) continue;
        if (ms(s.expira) <= ms(ahora) || ms(s.ultimoUso) <= ms(usadaDesde)) continue;
        lista.push({ id: s.id, creada: s.creada, ultimoUso: s.ultimoUso, dispositivo: s.dispositivo, esActual: hash === actualTokenHash });
      }
      return lista.sort((a, b) => ms(b.creada) - ms(a.creada));
    },

    async registrarEvento(cuentaId, tipo, ahora) {
      if (cuentas.has(cuentaId)) evento(cuentaId, tipo, ahora);
    },

    async eventosRecientes(cuentaId, limite): Promise<EventoGuardado[]> {
      return eventos
        .filter((e) => e.cuentaId === cuentaId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limite)
        .map(({ tipo, fecha }) => ({ tipo, fecha }));
    },

    async reservarCorreo(tope, ahora) {
      const dia = diaDeChile(ahora);
      const usados = cuota.get(dia) ?? 0;
      if (usados >= tope) return false;
      cuota.set(dia, usados + 1);
      return true;
    },

    async cuotaAgotada(tope, ahora) {
      return (cuota.get(diaDeChile(ahora)) ?? 0) >= tope;
    },

    async emitirInvitacion(e) {
      if ([...invitaciones.values()].filter((i) => vigente(i, e.ahora)).length >= e.maximoVigentes) return "tope";
      if ([...invitaciones.values()].some((i) => i.codigoHash === e.codigoHash)) throw new Error("Código repetido.");
      const id = randomUUID();
      invitaciones.set(id, {
        id,
        codigoHash: e.codigoHash,
        alias: e.alias,
        emitida: e.ahora,
        vence: e.vence,
        envios: 0,
        usada: null,
        revocada: null,
        cuentaId: null,
      });
      auditoria.push({ invitacionId: id, accion: "emitida", actor: e.actor, fecha: e.ahora });
      return { id };
    },

    async reservarInvitacion(codigoHash, ahora, maximoEnvios) {
      const i = [...invitaciones.values()].find((x) => x.codigoHash === codigoHash);
      if (!i || !vigente(i, ahora) || i.envios >= maximoEnvios) return null;
      i.envios += 1;
      return i.id;
    },

    async revocarInvitacion(id, actor, ahora) {
      const i = invitaciones.get(id);
      if (!i || i.usada !== null || i.revocada !== null) return false;
      i.revocada = ahora;
      auditoria.push({ invitacionId: id, accion: "revocada", actor, fecha: ahora });
      return true;
    },

    async listarInvitaciones(limite) {
      return [...invitaciones.values()]
        .sort((a, b) => ms(b.emitida) - ms(a.emitida))
        .slice(0, limite)
        .map(sinCodigo);
    },

    async auditoriaInvitaciones(limite) {
      return auditoria
        .slice()
        .reverse()
        .slice(0, limite)
        .map((f) => ({ ...f, alias: invitaciones.get(f.invitacionId)?.alias ?? "" }));
    },

    async invitacionDeCuenta(cuentaId) {
      const i = [...invitaciones.values()].find((x) => x.cuentaId === cuentaId);
      return i && i.usada ? { alias: i.alias, emitida: i.emitida, usada: i.usada } : null;
    },

    async purgar(ahora) {
      const t = ms(ahora);
      for (const [hash, tk] of tokens) {
        if (ms(tk.emitido) < t - PLAZO_ALTAS_SIN_CONFIRMAR_MS || (tk.usado !== null && ms(tk.usado) < t - DIA_MS)) tokens.delete(hash);
      }
      for (const [hash, s] of sesiones) {
        if (
          ms(s.expira) < t - DIA_MS ||
          (s.revocada !== null && ms(s.revocada) < t - DIA_MS) ||
          ms(s.ultimoUso) < t - SESION_INACTIVA_MS - DIA_MS
        ) {
          sesiones.delete(hash);
        }
      }
      for (let i = eventos.length - 1; i >= 0; i--) if (ms(eventos[i].fecha) < t - RETENCION_EVENTOS_MS) eventos.splice(i, 1);
    },
  };
}
