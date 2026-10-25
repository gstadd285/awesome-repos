/**
 * Almacenamiento de las cuentas (migración 0006). Hay dos implementaciones con el mismo contrato, que comprueba el mismo
 * conjunto de pruebas (`contrato-almacen.ts`): `almacen-memoria.ts` (desarrollo y pruebas del servicio) y
 * `almacen-postgres.ts` (producción). Cada operación que toca varias filas es atómica.
 *
 * Todas las fechas viajan como texto ISO y el almacén no lee el reloj: quien llama pasa `ahora` (así las pruebas
 * controlan el tiempo). Lo que se guarda de los secretos son hashes o textos cifrados; el almacén nunca ve un token ni
 * un correo en claro.
 */

/** Los tipos de evento de actividad que guarda la base (la restricción de `cuenta_eventos` en la migración 0006 los repite). */
export const TIPOS_DE_EVENTO = [
  "alta",
  "acceso",
  "clave_cambiada",
  "clave_restablecida",
  "dos_pasos_activados",
  "dos_pasos_desactivados",
  "codigos_regenerados",
  "codigo_recuperacion",
  "sesiones_cerradas",
  "alta_repetida",
] as const;

export type TipoEvento = (typeof TIPOS_DE_EVENTO)[number];

export type CuentaGuardada = {
  id: string;
  correoIndice: string;
  correoCifrado: string;
  nombre: string | null;
  claveHash: string;
  claveCambiada: string;
  /** Puntos de intentos fallidos de la ventana que empezó en `fallosDesde` (ver `fallosVigentes` y `PUNTOS_MAX_CUENTA`). */
  fallos: number;
  fallosDesde: string | null;
  totpSecretoCifrado: string | null;
  totpPendienteCifrado: string | null;
  totpActivado: string | null;
  totpUltimoPaso: number | null;
  versionTextos: string;
  aceptado: string;
  temas: string[];
  resumenPrevio: boolean;
  creada: string;
};

export type PerfilNuevo = { nombre: string | null; temas: string[]; resumenPrevio: boolean };

export type AltaPendiente = {
  correoIndice: string;
  correoCifrado: string;
  versionTextos: string;
  aceptado: string;
};

export type SesionNueva = {
  tokenHash: string;
  /** `pendiente`: falta el código de la verificación en dos pasos. */
  fase: "pendiente" | "activa";
  ahora: string;
  expira: string;
  dispositivo: string | null;
};

/** Una sesión vigente con los datos de su cuenta que necesita cada página. */
export type SesionLeida = {
  id: string;
  cuentaId: string;
  fase: "pendiente" | "activa";
  creada: string;
  expira: string;
  nombre: string | null;
  dosPasos: boolean;
};

export type SesionListada = {
  id: string;
  creada: string;
  ultimoUso: string;
  dispositivo: string | null;
  esActual: boolean;
};

export type EventoGuardado = { tipo: TipoEvento; fecha: string };

/** Una invitación como la ve el panel. El código no está: no se guarda (solo su HMAC, que no sale del almacén). */
export type InvitacionGuardada = {
  id: string;
  alias: string;
  emitida: string;
  vence: string;
  /** Correos de alta que provocó (ver `ENVIOS_POR_INVITACION`). */
  envios: number;
  usada: string | null;
  revocada: string | null;
};

/** Una fila de la auditoría de las invitaciones. `actor` es el alias del panel; nulo cuando la usa la persona invitada. */
export type AuditoriaInvitacion = {
  invitacionId: string;
  alias: string;
  accion: "emitida" | "revocada" | "usada";
  actor: string | null;
  fecha: string;
};

export interface AlmacenCuentas {
  // ── Crear la cuenta ────────────────────────────────────────────────────
  /**
   * Deja un enlace de alta pendiente para el correo. `existente`: ya hay una cuenta con ese correo (no se guarda nada).
   * `reciente`: ya hay un enlace emitido después de `reenviarSiAnteriorA` (no hay que enviar otro correo). `renovado`:
   * había uno más viejo y se reemplazó. `nuevo`: no había. `invitacionId`: la invitación con que se pidió (modo
   * `invitacion`); el enlace la recuerda y al renovarlo se reemplaza.
   */
  emitirAlta(e: {
    correoIndice: string;
    correoCifrado: string;
    tokenHash: string;
    versionTextos: string;
    ahora: string;
    reenviarSiAnteriorA: string;
    invitacionId?: string | null;
  }): Promise<"nuevo" | "renovado" | "reciente" | "existente">;
  /** El alta pendiente de ese enlace, si no se usó y se emitió desde `vigenteDesde`. No lo gasta. */
  leerAlta(tokenHash: string, vigenteDesde: string): Promise<AltaPendiente | null>;
  /**
   * Gasta el enlace, crea la cuenta con esa contraseña y abre su primera sesión, todo o nada. `invalido`: el enlace no
   * existe, venció o ya se usó. `duplicado`: ya existe una cuenta con ese correo.
   *
   * Con `exigirInvitacion` (modo `invitacion`) además gasta la invitación del enlace en la misma transacción (`usada`, la
   * cuenta y una fila `usada` en la auditoría). `invitacion`: el enlace no tiene invitación o ya no vale (se usó, se
   * revocó o venció); entonces no cambia nada. Dos altas a la vez con la misma invitación: gana una sola.
   */
  activarAlta(a: {
    tokenHash: string;
    vigenteDesde: string;
    claveHash: string;
    ahora: string;
    sesion: Omit<SesionNueva, "fase" | "ahora">;
    exigirInvitacion?: boolean;
  }): Promise<{ cuentaId: string; sesionId: string } | "invalido" | "duplicado" | "invitacion">;

  /** Borra un enlace pendiente (el correo no pudo enviarse: se podrá pedir otro de inmediato). */
  descartarEnlace(tokenHash: string): Promise<void>;

  // ── Cuentas ────────────────────────────────────────────────────────────
  buscarPorCorreo(correoIndice: string): Promise<CuentaGuardada | null>;
  buscarPorId(id: string): Promise<CuentaGuardada | null>;
  /** Suma `puntos` de intentos fallidos a la ventana (la reinicia si empezó antes de `ventanaDesde`); devuelve cuántos lleva. */
  registrarFallo(cuentaId: string, ahora: string, ventanaDesde: string, puntos: number): Promise<number>;
  limpiarFallos(cuentaId: string): Promise<void>;
  actualizarPerfil(cuentaId: string, perfil: PerfilNuevo, ahora: string): Promise<void>;
  /** Cambia la contraseña, borra los fallos y cierra las sesiones (todas menos `conservarSesion`, si se indica). */
  cambiarClave(a: { cuentaId: string; claveHash: string; ahora: string; conservarSesion?: string }): Promise<void>;
  /** Guarda la contraseña con parámetros nuevos, solo si sigue siendo `claveHashAnterior` (al entrar). */
  renovarHashClave(cuentaId: string, claveHashAnterior: string, claveHashNueva: string): Promise<void>;
  /** Borra la cuenta y todo lo que depende de ella. */
  eliminarCuenta(cuentaId: string): Promise<void>;

  // ── Restablecer la contraseña ──────────────────────────────────────────
  emitirRestablecer(e: {
    cuentaId: string;
    tokenHash: string;
    ahora: string;
    reenviarSiAnteriorA: string;
  }): Promise<"nuevo" | "renovado" | "reciente">;
  /** La cuenta de ese enlace, si no se usó y se emitió desde `vigenteDesde`. No lo gasta. */
  leerRestablecer(tokenHash: string, vigenteDesde: string): Promise<{ cuentaId: string } | null>;
  /**
   * Gasta el enlace, cambia la contraseña y cierra TODAS las sesiones de la cuenta, todo o nada. `null`: el enlace no
   * existe, venció o ya se usó.
   */
  usarRestablecer(a: {
    tokenHash: string;
    vigenteDesde: string;
    claveHash: string;
    ahora: string;
  }): Promise<{ cuentaId: string } | null>;

  // ── Verificación en dos pasos ──────────────────────────────────────────
  guardarTotpPendiente(cuentaId: string, cifrado: string): Promise<void>;
  /**
   * Pasa el secreto pendiente a activo, anota el paso del código con que se confirmó y reemplaza los códigos de
   * recuperación. `false` si no había un secreto pendiente (o ya estaba activa).
   */
  activarTotp(a: { cuentaId: string; ahora: string; paso: number; codigosHash: string[] }): Promise<boolean>;
  /** Apaga la verificación en dos pasos: borra el secreto, el pendiente y los códigos de recuperación. */
  desactivarTotp(cuentaId: string, ahora: string): Promise<void>;
  /** Gasta el paso del código: `true` si es posterior al último usado (un código no se reutiliza). */
  gastarPasoTotp(cuentaId: string, paso: number): Promise<boolean>;
  /** Gasta un código de recuperación: `true` la primera vez. */
  gastarCodigoRecuperacion(cuentaId: string, codigoHash: string, ahora: string): Promise<boolean>;
  /** Cambia todos los códigos de recuperación por otros nuevos (los anteriores dejan de valer). */
  reemplazarCodigos(cuentaId: string, codigosHash: string[], ahora: string): Promise<void>;
  contarCodigosLibres(cuentaId: string): Promise<number>;

  // ── Sesiones ───────────────────────────────────────────────────────────
  /** Abre una sesión. Si la cuenta ya tiene `maximo` activas, cierra las más antiguas. */
  crearSesion(cuentaId: string, s: SesionNueva, maximo: number): Promise<{ id: string }>;
  /** La sesión si existe, no está revocada, no venció y se usó desde `usadaDesde`. */
  leerSesion(tokenHash: string, ahora: string, usadaDesde: string): Promise<SesionLeida | null>;
  /** Anota el último uso, solo si el anterior es más viejo que `anteriorA`. */
  tocarSesion(tokenHash: string, ahora: string, anteriorA: string): Promise<void>;
  /** Cambia una sesión pendiente por una activa nueva (cierra la pendiente), todo o nada. `null` si ya no valía. */
  ascenderSesion(a: {
    tokenHashPendiente: string;
    sesion: Omit<SesionNueva, "fase">;
    maximo: number;
  }): Promise<{ id: string; cuentaId: string } | null>;
  revocarSesion(tokenHash: string, ahora: string): Promise<void>;
  /** Cierra una sesión de la cuenta por su identificador público. `true` si estaba abierta. */
  revocarSesionPorId(cuentaId: string, id: string, ahora: string): Promise<boolean>;
  /** Cierra todas las sesiones de la cuenta menos la indicada; devuelve cuántas cerró. */
  revocarOtras(cuentaId: string, conservarTokenHash: string, ahora: string): Promise<number>;
  listarSesiones(cuentaId: string, ahora: string, usadaDesde: string, actualTokenHash: string): Promise<SesionListada[]>;

  // ── Actividad, cuota de correos y limpieza ─────────────────────────────
  registrarEvento(cuentaId: string, tipo: TipoEvento, ahora: string): Promise<void>;
  /** Los últimos eventos, el más nuevo primero. */
  eventosRecientes(cuentaId: string, limite: number): Promise<EventoGuardado[]>;
  /** Reserva un correo de la cuota del día (hora de Chile): `false` si ya se llegó a `tope`. */
  reservarCorreo(tope: number, ahora: string): Promise<boolean>;
  /** ¿El día (hora de Chile) ya llegó a `tope` correos? Solo lee: no reserva nada. */
  cuotaAgotada(tope: number, ahora: string): Promise<boolean>;
  /** Borra enlaces vencidos, sesiones terminadas y eventos viejos. */
  purgar(ahora: string): Promise<void>;

  // ── Invitaciones (migración 0009) ──────────────────────────────────────
  /**
   * Guarda una invitación nueva y su fila `emitida` en la auditoría, todo o nada. `tope`: ya hay `maximoVigentes` sin
   * usar, sin revocar y sin vencer (no se guarda nada).
   */
  emitirInvitacion(e: {
    codigoHash: string;
    alias: string;
    actor: string;
    ahora: string;
    vence: string;
    maximoVigentes: number;
  }): Promise<{ id: string } | "tope">;
  /**
   * Toma un correo de alta de la invitación de ese código, si sigue vigente (sin usar, sin revocar, sin vencer y con menos
   * de `maximoEnvios` correos): devuelve su id. `null` si no existe o ya no vale (sin decir por qué). No la gasta.
   */
  reservarInvitacion(codigoHash: string, ahora: string, maximoEnvios: number): Promise<string | null>;
  /** Revoca una invitación sin usar (y deja la fila en la auditoría). `false` si no existe o ya estaba usada o revocada. */
  revocarInvitacion(id: string, actor: string, ahora: string): Promise<boolean>;
  /** Las invitaciones, la más nueva primero. */
  listarInvitaciones(limite: number): Promise<InvitacionGuardada[]>;
  /** La auditoría de las invitaciones, lo más nuevo primero. */
  auditoriaInvitaciones(limite: number): Promise<AuditoriaInvitacion[]>;
  /** La invitación con que se creó la cuenta (para «Descargar mis datos»). */
  invitacionDeCuenta(cuentaId: string): Promise<{ alias: string; emitida: string; usada: string } | null>;
}
