import { verificarTotp } from "@/lib/admin/totp";
import { logSecurityEvent } from "@/lib/security/log";
import { createFixedWindowLimiter, type FixedWindowLimiter } from "@/lib/security/rate-limit";
import type { AlmacenCuentas, CuentaGuardada, EventoGuardado, SesionListada } from "./almacen";
import { ClaveSaturada } from "./clave";
import type { CifradorCuentas } from "./cifrado";
import {
  CODIGOS_DE_RECUPERACION,
  ENVIOS_POR_INVITACION,
  ESPERA_REENVIO_MS,
  FORMATO_TOKEN,
  INTENTOS_INVITACION_DIA,
  INTENTOS_INVITACION_HORA,
  INTENTOS_POR_CODIGO_HORA,
  INTENTOS_POR_CORREO_Y_CLIENTE,
  MAX_SESIONES_POR_CUENTA,
  PARTE_DE_CUOTA_PARA_ALTAS,
  PUNTOS_CLAVE,
  PUNTOS_CODIGO,
  PUNTOS_MAX_CUENTA,
  SESION_ABSOLUTA_MS,
  SESION_INACTIVA_MS,
  SESION_PENDIENTE_MS,
  VENTANA_FALLOS_MS,
  VIGENCIA_ALTA_MS,
  VIGENCIA_RESTABLECER_MS,
} from "./constantes";
import {
  correoActivar,
  correoAltaExistente,
  correoClaveCambiada,
  correoCuentaEliminada,
  correoDosPasos,
  correoRestablecer,
  enlaceCuenta,
} from "./correo";
import type { CorreoArmado } from "@/lib/correo/plantilla";
import type { EnviarCorreo } from "@/lib/correo/resend";
import { evaluarClave, MENSAJES_CLAVE } from "./politica-clave";
import { AltaSchema, CodigoSchema, CorreoSchema, EntrarSchema, PerfilSchema, VERSION_TEXTOS } from "./schema";
import { generarCodigoRecuperacion, generarToken, hashCodigoRecuperacion, hashToken } from "./tokens";
import { generarSecretoTotp, uriTotp } from "./totp-cuenta";
import { enmascararCorreo } from "./formato";
import { CodigoInvitacionSchema } from "./invitaciones";

/**
 * `cerradas`: las cuentas no existen todavía (no se guarda nada). `memoria`: desarrollo y pruebas, sin correo real.
 * `abiertas`: Postgres y correo de verdad. `invitacion`: como `abiertas`, pero una cuenta solo se crea con un código de
 * invitación de un solo uso (acceso anticipado privado, `docs/alertas-reales.md` §6).
 */
export type ModoCuentas = "cerradas" | "memoria" | "abiertas" | "invitacion";

/** Qué campo de un formulario falló y por qué (el texto se muestra tal cual). */
export type Errores = Partial<
  Record<"correo" | "condiciones" | "privacidad" | "clave" | "repetir" | "actual" | "nueva" | "nombre" | "temas" | "codigo" | "invitacion", string>
>;

export type SesionEmitida = { token: string; expira: Date };

/** Lo que cada acción sabe de quien la hace: su clave de límites (hash de la IP) y una etiqueta de su dispositivo. */
export type Contexto = { claveCliente: string; dispositivo: string | null };

/** Quien tiene una sesión completa: lo que necesitan las páginas y las acciones de la cuenta. */
export type SesionVigente = {
  id: string;
  cuentaId: string;
  nombre: string | null;
  dosPasos: boolean;
  /** Hash del token de la cookie (lo que se guarda); sirve para saber cuál es «esta» sesión. */
  tokenHash: string;
  csrf: string;
};

export type ResultadoAlta =
  | { estado: "ok"; prueba: boolean }
  | { estado: "cerrada" }
  | { estado: "invalida"; errores: Errores }
  | { estado: "limite" }
  | { estado: "reintentar" }
  /** Se alcanzó la cuota diaria de correos: volver a intentar otro día. */
  | { estado: "saturada" }
  /** La marca de tiempo del formulario falta, venció o se envió demasiado rápido. */
  | { estado: "espera" };

export type ResultadoRestablecer = ResultadoAlta;

export type ConsultaEnlace = { estado: "valido"; correoEnmascarado: string | null } | { estado: "invalido" } | { estado: "limite" } | { estado: "cerrada" };

export type ResultadoClaveNueva =
  | { estado: "ok" }
  | { estado: "cerrada" }
  | { estado: "enlace" }
  | { estado: "invalida"; errores: Errores }
  | { estado: "limite" }
  | { estado: "reintentar" };

export type ResultadoActivar =
  | { estado: "ok"; sesion: SesionEmitida }
  | Exclude<ResultadoClaveNueva, { estado: "ok" }>
  /** Modo `invitacion`: la invitación del enlace ya no vale (se usó, se revocó o venció). No se creó nada. */
  | { estado: "invitacion" };

export type ResultadoEntrar =
  | { estado: "ok"; sesion: SesionEmitida }
  | { estado: "dos_pasos"; sesion: SesionEmitida }
  | { estado: "rechazado" }
  | { estado: "limite" }
  | { estado: "cerrada" }
  | { estado: "reintentar" };

export type ResultadoSegundoPaso =
  | { estado: "ok"; sesion: SesionEmitida; codigosRestantes: number | null }
  | { estado: "invalido"; errores: Errores }
  | { estado: "rechazado" }
  | { estado: "sin_sesion" }
  | { estado: "limite" }
  | { estado: "cerrada" }
  | { estado: "reintentar" };

/** Lo que quedó guardado (ya normalizado: sin espacios de más ni temas repetidos) vuelve al formulario. */
export type ResultadoPerfil = { estado: "ok"; guardado: { nombre: string | null; temas: string[]; resumenPrevio: boolean } } | { estado: "invalida"; errores: Errores };

/** Resultado de una acción que pide la contraseña (y el código, si hay dos pasos) para confirmar que es la persona. */
export type ResultadoConfirmado<T = Record<never, never>> =
  | ({ estado: "ok" } & T)
  | { estado: "invalida"; errores: Errores }
  | { estado: "limite" }
  | { estado: "reintentar" };

export type PerfilVista = {
  correo: string | null;
  nombre: string | null;
  temas: string[];
  resumenPrevio: boolean;
  dosPasos: boolean;
  dosPasosDesde: string | null;
  creada: string;
  claveCambiada: string;
  versionTextos: string;
  aceptado: string;
  codigosLibres: number;
};

export type DatosExportados = {
  exportado: string;
  cuenta: {
    correo: string | null;
    nombre: string | null;
    creada: string;
    claveCambiada: string;
    temas: string[];
    resumenPrevio: boolean;
    verificacionEnDosPasos: boolean;
    aceptaste: { versionDeLosTextos: string; fecha: string };
    /** La invitación con que se creó la cuenta (acceso anticipado), o `null`. Su alias es la etiqueta interna del panel. */
    invitacion: { alias: string; emitida: string; usada: string } | null;
  };
  sesionesAbiertas: { dispositivo: string | null; iniciada: string; ultimoUso: string }[];
  actividad: EventoGuardado[];
  nota: string;
};

export type DependenciasClave = {
  hashear(clave: string): Promise<string>;
  verificar(clave: string, hash: string): Promise<boolean>;
  necesitaRehash(hash: string): boolean;
  /** Gasta el trabajo de una verificación cuando el correo no tiene cuenta. */
  senuelo(clave: string): Promise<false>;
};

type ParLimite = { cliente: FixedWindowLimiter; global: FixedWindowLimiter };
export type Limitadores = {
  alta: ParLimite;
  /**
   * Solo en modo `invitacion`: pedidos de alta por cliente (por hora y por día) y por código (su HMAC, desde todos los
   * clientes). Cuentan todos los pedidos, el código sirva o no: así el límite tampoco dice nada del código.
   */
  invitacion: { hora: FixedWindowLimiter; dia: FixedWindowLimiter; codigo: FixedWindowLimiter };
  activar: FixedWindowLimiter;
  /** `correoYCliente`: un correo desde un cliente (frena a quien prueba, no a la dueña de la cuenta). `correo`: ese correo desde todos. */
  entrar: ParLimite & { correoYCliente: FixedWindowLimiter; correo: FixedWindowLimiter };
  segundoPaso: FixedWindowLimiter;
  olvide: ParLimite;
  restablecer: FixedWindowLimiter;
};

export type DependenciasServicio = {
  modo: ModoCuentas;
  almacen: AlmacenCuentas;
  cifrador: CifradorCuentas;
  /** Envía un correo. En modo `memoria` lo reemplaza una función que lo deja en el registro del servidor. */
  enviar: EnviarCorreo;
  /** URL base pública (https) sobre la que se arman los enlaces de los correos. */
  urlSitio: string;
  clave: DependenciasClave;
  limitadores?: Partial<Limitadores>;
  /** `true` si la marca de tiempo del formulario es válida y no llegó demasiado rápido. Sin ella no se exige marca. */
  marcaValida?: (marca: unknown, ahora: Date) => boolean;
  maximoEnviosDiarios?: number;
  generarToken?: () => string;
  ahora?: () => Date;
  /** Las respuestas que pasan por el almacenamiento tardan al menos esto: el tiempo no delata si el correo existe. */
  duracionMinimaMs?: number;
};

const HORA_MS = 60 * 60_000;
const INTERVALO_PURGA_MS = HORA_MS;
const MENSAJE_REPETIR = "Las contraseñas no coinciden.";

const iso = (d: Date) => d.toISOString();
const antes = (d: Date, ms: number) => new Date(d.getTime() - ms);

function crearLimitadores(parcial: Partial<Limitadores> = {}): Limitadores {
  return {
    alta: parcial.alta ?? {
      cliente: createFixedWindowLimiter({ limite: 5, ventanaMs: 10 * 60_000 }),
      global: createFixedWindowLimiter({ limite: 300, ventanaMs: 10 * 60_000 }),
    },
    invitacion: parcial.invitacion ?? {
      hora: createFixedWindowLimiter({ limite: INTENTOS_INVITACION_HORA, ventanaMs: HORA_MS }),
      dia: createFixedWindowLimiter({ limite: INTENTOS_INVITACION_DIA, ventanaMs: 24 * HORA_MS }),
      codigo: createFixedWindowLimiter({ limite: INTENTOS_POR_CODIGO_HORA, ventanaMs: HORA_MS }),
    },
    activar: parcial.activar ?? createFixedWindowLimiter({ limite: 20, ventanaMs: 10 * 60_000 }),
    entrar: parcial.entrar ?? {
      cliente: createFixedWindowLimiter({ limite: 10, ventanaMs: VENTANA_FALLOS_MS }),
      global: createFixedWindowLimiter({ limite: 600, ventanaMs: VENTANA_FALLOS_MS }),
      correoYCliente: createFixedWindowLimiter({ limite: INTENTOS_POR_CORREO_Y_CLIENTE, ventanaMs: VENTANA_FALLOS_MS }),
      correo: createFixedWindowLimiter({ limite: PUNTOS_MAX_CUENTA, ventanaMs: VENTANA_FALLOS_MS }),
    },
    segundoPaso: parcial.segundoPaso ?? createFixedWindowLimiter({ limite: 10, ventanaMs: VENTANA_FALLOS_MS }),
    olvide: parcial.olvide ?? {
      cliente: createFixedWindowLimiter({ limite: 5, ventanaMs: HORA_MS }),
      global: createFixedWindowLimiter({ limite: 200, ventanaMs: HORA_MS }),
    },
    restablecer: parcial.restablecer ?? createFixedWindowLimiter({ limite: 20, ventanaMs: 10 * 60_000 }),
  };
}

/**
 * Cuentas de personas usuarias. Reglas que recorren todo el servicio:
 *
 *   · **Sin enumeración**: pedir una cuenta, restablecer una contraseña o entrar responden lo mismo exista o no el correo,
 *     y tardan parecido (tiempo mínimo, y una contraseña «señuelo» cuando no hay cuenta). En modo `invitacion`, el alta
 *     responde lo mismo también sirva o no el código: uno que no sirve no envía nada y no lo dice.
 *   · **Una cuenta no existe hasta que se confirma el correo**: la contraseña se elige en el segundo paso, con el enlace
 *     del correo. Así nadie puede crear una cuenta con el correo de otra persona y quedarse con la contraseña.
 *   · **Los intentos se cuentan**: por IP, por correo desde cada IP y por correo en total (en memoria, primera barrera) y por
 *     cuenta (en la base, para todas las instancias, en «puntos»: ver `PUNTOS_MAX_CUENTA`). El tope fino va por (correo,
 *     IP) para que quien prueba contraseñas se bloquee a sí mismo y no a la dueña de la cuenta; el tope por cuenta es alto
 *     (100, el máximo de NIST) y solo frena lo que logra repartirse entre muchas IP. Pasado el tope no se prueba nada más
 *     hasta que termina la ventana, sin importar si la contraseña era la correcta; restablecer la contraseña lo borra.
 *   · **Las acciones delicadas piden la contraseña de nuevo** (y el código, si hay dos pasos), aunque la sesión sea válida.
 *   · Nunca se registra ni se devuelve un token, una contraseña, un código o un correo en claro.
 */
export function crearServicioCuentas({
  modo,
  almacen,
  cifrador,
  enviar,
  urlSitio,
  clave,
  limitadores,
  marcaValida,
  maximoEnviosDiarios = 20,
  generarToken: generar = generarToken,
  ahora = () => new Date(),
  duracionMinimaMs = 1200,
}: DependenciasServicio) {
  const lim = crearLimitadores(limitadores);
  let ultimaPurga = 0;

  const fallaDeBase = (codigo: string) => logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo });
  const prueba = modo === "memoria";

  async function conDuracionMinima<T>(fn: () => Promise<T>): Promise<T> {
    const inicio = performance.now();
    try {
      return await fn();
    } finally {
      const resto = duracionMinimaMs - (performance.now() - inicio);
      if (resto > 0) await new Promise((r) => setTimeout(r, resto));
    }
  }

  /** Borra lo vencido como mucho una vez por hora; si falla, ya habrá otra ocasión. */
  async function purgarSiToca(instante: Date) {
    if (instante.getTime() - ultimaPurga < INTERVALO_PURGA_MS) return;
    ultimaPurga = instante.getTime();
    await almacen.purgar(iso(instante)).catch(() => fallaDeBase("cuentas_purga"));
  }

  /**
   * Reserva un correo de la cuota diaria. Sin base no se sabe cuánto se envió: no se envía.
   *
   * Hay dos clases. Las `altas` (crear una cuenta y avisarle a quien ya la tiene) las puede provocar cualquiera con solo
   * escribir un correo, así que no pueden pasar de una parte del cupo; lo que queda es de `seguridad` (restablecer la
   * contraseña y avisos de cambios hechos con sesión): llenar el cupo desde fuera no deja a nadie sin su correo de recuperación.
   */
  const topeAltas = Math.max(1, Math.floor(maximoEnviosDiarios * PARTE_DE_CUOTA_PARA_ALTAS));
  async function reservarCorreo(instante: Date, clase: "altas" | "seguridad"): Promise<boolean> {
    try {
      return await almacen.reservarCorreo(clase === "altas" ? topeAltas : maximoEnviosDiarios, iso(instante));
    } catch {
      fallaDeBase("cuentas_cuota");
      return false;
    }
  }

  /** Aviso de seguridad: si no se puede enviar, no se rompe lo que ya se hizo. */
  async function avisar(correo: string | null, plantilla: CorreoArmado, clase: "altas" | "seguridad" = "seguridad") {
    if (!correo) return;
    try {
      if (!(await reservarCorreo(ahora(), clase))) return;
      await enviar({ para: correo, ...plantilla });
    } catch {
      // El envío ya registró su falla (sin datos personales).
    }
  }

  const correoDe = (c: CuentaGuardada): string | null => {
    try {
      return cifrador.descifrarCorreo(c.correoCifrado, c.correoIndice);
    } catch {
      logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "cuentas_descifrar" });
      return null;
    }
  };

  /** Puntos de fallos de la ventana vigente (0 si la ventana ya terminó). */
  const fallosVigentes = (c: CuentaGuardada, instante: Date): number =>
    c.fallosDesde !== null && Date.parse(c.fallosDesde) > instante.getTime() - VENTANA_FALLOS_MS ? c.fallos : 0;
  const bloqueada = (c: CuentaGuardada, instante: Date): boolean => fallosVigentes(c, instante) >= PUNTOS_MAX_CUENTA;
  const sumarFallo = (c: CuentaGuardada, instante: Date, puntos: number) =>
    almacen.registrarFallo(c.id, iso(instante), iso(antes(instante, VENTANA_FALLOS_MS)), puntos);

  const emitirSesion = (): { token: string; hash: string } => {
    const token = generar();
    return { token, hash: hashToken(token) };
  };

  function erroresDeClave(cuentaCorreo: string | null, nombre: string | null, nueva: unknown, repetir: unknown, campo: "clave" | "nueva"): Errores {
    const errores: Errores = {};
    if (typeof nueva !== "string" || nueva === "") {
      errores[campo] = "Escribe una contraseña.";
      return errores;
    }
    const motivo = evaluarClave(nueva, { correo: cuentaCorreo ?? undefined, nombre: nombre ?? undefined });
    if (motivo) errores[campo] = MENSAJES_CLAVE[motivo];
    else if (nueva !== repetir) errores.repetir = MENSAJE_REPETIR;
    return errores;
  }

  /**
   * Comprueba el segundo factor de una cuenta con la verificación en dos pasos: un código de la app (seis dígitos, que no
   * se puede reutilizar) o uno de recuperación (que se gasta). `null` = la entrada no tiene forma de código.
   */
  async function verificarSegundoFactor(
    cuenta: CuentaGuardada,
    entrada: unknown,
    instante: Date,
  ): Promise<{ ok: boolean; recuperacion: boolean } | null> {
    const parsed = CodigoSchema.safeParse(entrada);
    if (!parsed.success || !cuenta.totpSecretoCifrado) return null;
    const codigo = parsed.data;
    if (/^\d{6}$/.test(codigo)) {
      let secreto: string;
      try {
        secreto = cifrador.descifrarTotp(cuenta.totpSecretoCifrado, cuenta.id);
      } catch {
        logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "cuentas_descifrar" });
        return { ok: false, recuperacion: false };
      }
      const paso = verificarTotp(secreto, codigo, instante.getTime());
      return { ok: paso !== null && (await almacen.gastarPasoTotp(cuenta.id, paso)), recuperacion: false };
    }
    return { ok: await almacen.gastarCodigoRecuperacion(cuenta.id, hashCodigoRecuperacion(codigo), iso(instante)), recuperacion: true };
  }

  /**
   * Vuelve a pedir la contraseña (y el código de la verificación en dos pasos, si la cuenta la tiene) antes de una acción
   * delicada. Cuenta los fallos igual que al entrar. Si lo que escribió la persona no tiene forma de código no se cuenta
   * como intento: no se probó nada.
   */
  async function reautenticar(
    cuenta: CuentaGuardada,
    actual: unknown,
    codigo: unknown,
    instante: Date,
  ): Promise<{ estado: "ok" } | { estado: "invalida"; errores: Errores } | { estado: "limite" } | { estado: "reintentar" }> {
    if (typeof actual !== "string" || actual === "") return { estado: "invalida", errores: { actual: "Escribe tu contraseña actual." } };
    if (bloqueada(cuenta, instante)) return { estado: "limite" };
    const fallo = (puntos: number) => sumarFallo(cuenta, instante, puntos).catch(() => fallaDeBase("cuentas_fallo"));
    let bien: boolean;
    try {
      bien = await clave.verificar(actual, cuenta.claveHash);
    } catch (error) {
      if (error instanceof ClaveSaturada) return { estado: "reintentar" };
      throw error;
    }
    if (!bien) {
      await fallo(PUNTOS_CLAVE);
      return { estado: "invalida", errores: { actual: "La contraseña no es correcta." } };
    }
    if (cuenta.totpActivado) {
      const r = await verificarSegundoFactor(cuenta, codigo, instante);
      if (r === null) return { estado: "invalida", errores: { codigo: "Escribe el código de tu app de autenticación o un código de recuperación." } };
      if (!r.ok) {
        await fallo(PUNTOS_CODIGO);
        return { estado: "invalida", errores: { codigo: "El código no es correcto o ya se usó." } };
      }
    }
    if (cuenta.fallos > 0) await almacen.limpiarFallos(cuenta.id).catch(() => fallaDeBase("cuentas_fallo"));
    return { estado: "ok" };
  }

  async function cuentaDe(cuentaId: string): Promise<CuentaGuardada | null> {
    try {
      return await almacen.buscarPorId(cuentaId);
    } catch {
      fallaDeBase("cuentas_leer");
      return null;
    }
  }

  const nuevosCodigos = () => Array.from({ length: CODIGOS_DE_RECUPERACION }, generarCodigoRecuperacion);

  async function sesionesAbiertas(sesion: Pick<SesionVigente, "cuentaId" | "tokenHash">): Promise<SesionListada[]> {
    const instante = ahora();
    return almacen.listarSesiones(sesion.cuentaId, iso(instante), iso(antes(instante, SESION_INACTIVA_MS)), sesion.tokenHash).catch(() => []);
  }

  return {
    modo,

    // ── Crear la cuenta (dos pasos: el correo y, con el enlace, la contraseña) ──────────────────────────────────────

    async solicitarAlta(
      entrada: { correo: unknown; condiciones: unknown; privacidad: unknown; sitio_web: unknown; tiempo?: unknown; invitacion?: unknown },
      claveCliente: string,
    ): Promise<ResultadoAlta> {
      if (!lim.alta.cliente.tryConsume(claveCliente) || !lim.alta.global.tryConsume()) return { estado: "limite" };
      const porInvitacion = modo === "invitacion";
      if (porInvitacion && (!lim.invitacion.hora.tryConsume(claveCliente) || !lim.invitacion.dia.tryConsume(claveCliente))) {
        logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_invitacion" });
        return { estado: "limite" };
      }

      const validada = AltaSchema.safeParse({ correo: entrada.correo, condiciones: entrada.condiciones, privacidad: entrada.privacidad });
      // Del código solo se mira la forma: si existe o no, no se dice.
      const codigo = porInvitacion ? CodigoInvitacionSchema.safeParse(entrada.invitacion ?? "") : null;
      if (!validada.success || (codigo && !codigo.success)) {
        const errores: Errores = {};
        for (const issue of validada.success ? [] : validada.error.issues) {
          const campo = issue.path[0];
          if ((campo === "correo" || campo === "condiciones" || campo === "privacidad") && !errores[campo]) errores[campo] = issue.message;
        }
        if (codigo && !codigo.success) errores.invitacion = codigo.error.issues[0]?.message;
        return { estado: "invalida", errores };
      }

      const trampa = typeof entrada.sitio_web === "string" && entrada.sitio_web.trim() !== "";
      if (modo === "cerradas" && !trampa) return { estado: "cerrada" };
      const ok: ResultadoAlta = { estado: "ok", prueba };

      return conDuracionMinima(async () => {
        if (trampa) return ok;
        const instante = ahora();
        if (marcaValida && !marcaValida(entrada.tiempo, instante)) {
          logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_marca_de_tiempo" });
          return { estado: "espera" } as const;
        }
        // Con la cuota de altas agotada se responde igual a todos (correo con cuenta o sin ella, código bueno o no), antes
        // de mirar nada más: «saturada» no puede distinguir unos de otros.
        try {
          if (await almacen.cuotaAgotada(topeAltas, iso(instante))) {
            logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_envios_diarios" });
            return { estado: "saturada" } as const;
          }
        } catch {
          fallaDeBase("cuentas_cuota");
          return { estado: "reintentar" } as const;
        }

        let invitacionId: string | null = null;
        if (codigo?.success) {
          const codigoHash = cifrador.hashInvitacion(codigo.data);
          if (!lim.invitacion.codigo.tryConsume(codigoHash)) {
            logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_invitacion_codigo" });
            return { estado: "limite" } as const;
          }
          try {
            invitacionId = await almacen.reservarInvitacion(codigoHash, iso(instante), ENVIOS_POR_INVITACION);
          } catch {
            fallaDeBase("cuentas_invitacion");
            return { estado: "reintentar" } as const;
          }
          // Un código que no existe, venció, se usó, se revocó o agotó sus correos: la misma respuesta y ningún correo.
          if (!invitacionId) {
            logSecurityEvent({ tipo: "invitacion", evento: "rechazada" });
            return ok;
          }
        }

        const correo = validada.data.correo;
        const { indice, cifrado } = cifrador.cifrarCorreo(correo);
        const token = generar();
        const tokenHash = hashToken(token);
        let resultado: Awaited<ReturnType<AlmacenCuentas["emitirAlta"]>>;
        try {
          resultado = await almacen.emitirAlta({
            correoIndice: indice,
            correoCifrado: cifrado,
            tokenHash,
            versionTextos: VERSION_TEXTOS,
            ahora: iso(instante),
            reenviarSiAnteriorA: iso(antes(instante, ESPERA_REENVIO_MS)),
            invitacionId,
          });
        } catch {
          fallaDeBase("cuentas_alta");
          return { estado: "reintentar" } as const;
        }

        if (resultado === "reciente") return ok;
        if (resultado === "existente") {
          // Se avisa a quien ya tiene la cuenta, como mucho una vez por hora, y la respuesta es la misma de siempre.
          try {
            const cuenta = await almacen.buscarPorCorreo(indice);
            const hace = instante.getTime() - HORA_MS;
            const reciente = cuenta && (await almacen.eventosRecientes(cuenta.id, 10)).some((e) => e.tipo === "alta_repetida" && Date.parse(e.fecha) > hace);
            if (cuenta && !reciente) {
              await almacen.registrarEvento(cuenta.id, "alta_repetida", iso(instante));
              logSecurityEvent({ tipo: "cuenta", evento: "alta_repetida" });
              await avisar(correo, correoAltaExistente(enlaceCuenta(urlSitio, "/cuenta/entrar"), enlaceCuenta(urlSitio, "/cuenta/olvide")), "altas");
            }
          } catch {
            fallaDeBase("cuentas_alta_repetida");
          }
          return ok;
        }

        if (!(await reservarCorreo(instante, "altas"))) {
          logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_envios_diarios" });
          await almacen.descartarEnlace(tokenHash).catch(() => {});
          return { estado: "saturada" } as const;
        }
        try {
          await enviar({ para: correo, ...correoActivar(enlaceCuenta(urlSitio, "/cuenta/activar", token)) });
        } catch {
          await almacen.descartarEnlace(tokenHash).catch(() => {});
          return { estado: "reintentar" } as const;
        }
        logSecurityEvent({ tipo: "cuenta", evento: "alta_pedida" });
        await purgarSiToca(instante);
        return ok;
      });
    },

    /** Para mostrar la página del segundo paso: ¿el enlace sirve? No lo gasta. */
    async consultarAlta(token: unknown, claveCliente: string): Promise<ConsultaEnlace> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.activar.tryConsume(claveCliente)) return { estado: "limite" };
      const t = typeof token === "string" && FORMATO_TOKEN.test(token) ? token : null;
      if (!t) return { estado: "invalido" };
      try {
        const alta = await almacen.leerAlta(hashToken(t), iso(antes(ahora(), VIGENCIA_ALTA_MS)));
        if (!alta) return { estado: "invalido" };
        let correoEnmascarado: string | null = null;
        try {
          correoEnmascarado = enmascararCorreo(cifrador.descifrarCorreo(alta.correoCifrado, alta.correoIndice));
        } catch {
          fallaDeBase("cuentas_descifrar");
        }
        return { estado: "valido", correoEnmascarado };
      } catch {
        fallaDeBase("cuentas_leer_alta");
        return { estado: "invalido" };
      }
    },

    /** Paso 2: con el enlace del correo se elige la contraseña, se crea la cuenta y se entra. */
    async activar(entrada: { token: unknown; clave: unknown; repetir: unknown }, ctx: Contexto): Promise<ResultadoActivar> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.activar.tryConsume(ctx.claveCliente)) return { estado: "limite" };
      const token = typeof entrada.token === "string" && FORMATO_TOKEN.test(entrada.token) ? entrada.token : null;
      if (!token) return { estado: "enlace" };
      const instante = ahora();
      const tokenHash = hashToken(token);
      const vigenteDesde = iso(antes(instante, VIGENCIA_ALTA_MS));
      let alta;
      try {
        alta = await almacen.leerAlta(tokenHash, vigenteDesde);
      } catch {
        fallaDeBase("cuentas_leer_alta");
        return { estado: "reintentar" };
      }
      if (!alta) return { estado: "enlace" };

      let correo: string;
      try {
        correo = cifrador.descifrarCorreo(alta.correoCifrado, alta.correoIndice);
      } catch {
        fallaDeBase("cuentas_descifrar");
        return { estado: "enlace" };
      }
      const errores = erroresDeClave(correo, null, entrada.clave, entrada.repetir, "clave");
      if (Object.keys(errores).length > 0) return { estado: "invalida", errores };

      let claveHash: string;
      try {
        claveHash = await clave.hashear(entrada.clave as string);
      } catch (error) {
        if (error instanceof ClaveSaturada) return { estado: "reintentar" };
        throw error;
      }
      const sesion = emitirSesion();
      const expira = new Date(instante.getTime() + SESION_ABSOLUTA_MS);
      let resultado;
      try {
        resultado = await almacen.activarAlta({
          tokenHash,
          vigenteDesde,
          claveHash,
          ahora: iso(instante),
          sesion: { tokenHash: sesion.hash, expira: iso(expira), dispositivo: ctx.dispositivo },
          exigirInvitacion: modo === "invitacion",
        });
      } catch {
        fallaDeBase("cuentas_activar");
        return { estado: "reintentar" };
      }
      if (resultado === "invalido" || resultado === "duplicado") return { estado: "enlace" };
      if (resultado === "invitacion") {
        // El enlace ya no sirve: se borra, para que la persona pueda pedir otro de inmediato con una invitación nueva.
        await almacen.descartarEnlace(tokenHash).catch(() => fallaDeBase("cuentas_descartar"));
        logSecurityEvent({ tipo: "invitacion", evento: "rechazada" });
        return { estado: "invitacion" };
      }
      if (modo === "invitacion") logSecurityEvent({ tipo: "invitacion", evento: "usada" });
      logSecurityEvent({ tipo: "cuenta", evento: "alta" });
      return { estado: "ok", sesion: { token: sesion.token, expira } };
    },

    // ── Entrar y salir ─────────────────────────────────────────────────────────────────────────────────────────────

    async entrar(entrada: { correo: unknown; clave: unknown }, ctx: Contexto): Promise<ResultadoEntrar> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.entrar.cliente.tryConsume(ctx.claveCliente) || !lim.entrar.global.tryConsume()) {
        logSecurityEvent({ tipo: "acceso_cuenta", resultado: "limite" });
        return { estado: "limite" };
      }
      const datos = EntrarSchema.safeParse(entrada);
      if (!datos.success) return { estado: "rechazado" };
      const instante = ahora();
      const indice = cifrador.indiceCorreo(datos.data.correo);
      // Mismos topes para cualquier correo, exista o no: la respuesta no delata cuáles tienen cuenta. El primero es por
      // (correo, cliente): quien insiste con un correo se bloquea a sí mismo, no a la dueña de la cuenta desde su casa.
      if (!lim.entrar.correoYCliente.tryConsume(`${indice}:${ctx.claveCliente}`) || !lim.entrar.correo.tryConsume(indice)) {
        logSecurityEvent({ tipo: "acceso_cuenta", resultado: "limite" });
        return { estado: "limite" };
      }

      let cuenta: CuentaGuardada | null;
      try {
        cuenta = await almacen.buscarPorCorreo(indice);
      } catch {
        fallaDeBase("cuentas_entrar");
        return { estado: "reintentar" };
      }

      try {
        if (!cuenta) {
          await clave.senuelo(datos.data.clave);
          logSecurityEvent({ tipo: "acceso_cuenta", resultado: "rechazado" });
          return { estado: "rechazado" };
        }
        if (bloqueada(cuenta, instante)) {
          logSecurityEvent({ tipo: "acceso_cuenta", resultado: "limite" });
          return { estado: "limite" };
        }
        if (!(await clave.verificar(datos.data.clave, cuenta.claveHash))) {
          await sumarFallo(cuenta, instante, PUNTOS_CLAVE).catch(() => fallaDeBase("cuentas_fallo"));
          logSecurityEvent({ tipo: "acceso_cuenta", resultado: "rechazado" });
          return { estado: "rechazado" };
        }
      } catch (error) {
        if (error instanceof ClaveSaturada) return { estado: "reintentar" };
        throw error;
      }

      // La contraseña es correcta: se cierra la ventana de fallos y, si los parámetros del hash quedaron viejos, se renueva.
      // Con dos pasos todavía falta el código: los fallos se borran recién cuando se pasa (si no, quien conoce la contraseña
      // reiniciaría el contador de códigos equivocados con solo volver a entrar).
      try {
        if (cuenta.fallos > 0 && cuenta.totpActivado === null) await almacen.limpiarFallos(cuenta.id);
        if (clave.necesitaRehash(cuenta.claveHash)) {
          await almacen.renovarHashClave(cuenta.id, cuenta.claveHash, await clave.hashear(datos.data.clave)).catch(() => {});
        }
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_fallo");
      }

      const sesion = emitirSesion();
      const dosPasos = cuenta.totpActivado !== null;
      const expira = new Date(instante.getTime() + (dosPasos ? SESION_PENDIENTE_MS : SESION_ABSOLUTA_MS));
      try {
        await almacen.crearSesion(
          cuenta.id,
          { tokenHash: sesion.hash, fase: dosPasos ? "pendiente" : "activa", ahora: iso(instante), expira: iso(expira), dispositivo: ctx.dispositivo },
          MAX_SESIONES_POR_CUENTA,
        );
      } catch {
        fallaDeBase("cuentas_sesion");
        return { estado: "reintentar" };
      }
      logSecurityEvent({ tipo: "acceso_cuenta", resultado: dosPasos ? "dos_pasos" : "correcto" });
      await purgarSiToca(instante);
      return { estado: dosPasos ? "dos_pasos" : "ok", sesion: { token: sesion.token, expira } };
    },

    /** Sesión pendiente (contraseña correcta, falta el código) → sesión completa. */
    async segundoPaso(entrada: { token: unknown; codigo: unknown }, ctx: Contexto): Promise<ResultadoSegundoPaso> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.segundoPaso.tryConsume(ctx.claveCliente)) {
        logSecurityEvent({ tipo: "acceso_cuenta", resultado: "limite" });
        return { estado: "limite" };
      }
      const token = typeof entrada.token === "string" && FORMATO_TOKEN.test(entrada.token) ? entrada.token : null;
      if (!token) return { estado: "sin_sesion" };
      const instante = ahora();
      const hash = hashToken(token);
      try {
        const sesion = await almacen.leerSesion(hash, iso(instante), iso(antes(instante, SESION_INACTIVA_MS)));
        if (!sesion || sesion.fase !== "pendiente") return { estado: "sin_sesion" };
        const cuenta = await almacen.buscarPorId(sesion.cuentaId);
        if (!cuenta || cuenta.totpActivado === null) return { estado: "sin_sesion" };
        if (bloqueada(cuenta, instante)) {
          logSecurityEvent({ tipo: "acceso_cuenta", resultado: "limite" });
          return { estado: "limite" };
        }
        const r = await verificarSegundoFactor(cuenta, entrada.codigo, instante);
        if (r === null) return { estado: "invalido", errores: { codigo: "Revisa el código: son seis dígitos de tu app o un código de recuperación." } };
        if (!r.ok) {
          await sumarFallo(cuenta, instante, PUNTOS_CODIGO);
          logSecurityEvent({ tipo: "acceso_cuenta", resultado: "dos_pasos_rechazado" });
          return { estado: "rechazado" };
        }
        if (cuenta.fallos > 0) await almacen.limpiarFallos(cuenta.id);
        const nueva = emitirSesion();
        const expira = new Date(instante.getTime() + SESION_ABSOLUTA_MS);
        const ascendida = await almacen.ascenderSesion({
          tokenHashPendiente: hash,
          sesion: { tokenHash: nueva.hash, ahora: iso(instante), expira: iso(expira), dispositivo: ctx.dispositivo },
          maximo: MAX_SESIONES_POR_CUENTA,
        });
        if (!ascendida) return { estado: "sin_sesion" };
        logSecurityEvent({ tipo: "acceso_cuenta", resultado: "correcto" });
        if (r.recuperacion) {
          // Queda en la actividad que ve la persona: si no fue ella, es la señal de que alguien tiene sus códigos.
          await almacen.registrarEvento(cuenta.id, "codigo_recuperacion", iso(instante)).catch(() => fallaDeBase("cuentas_evento"));
          logSecurityEvent({ tipo: "cuenta", evento: "codigo_recuperacion" });
        }
        return {
          estado: "ok",
          sesion: { token: nueva.token, expira },
          codigosRestantes: r.recuperacion ? await almacen.contarCodigosLibres(cuenta.id) : null,
        };
      } catch {
        fallaDeBase("cuentas_segundo_paso");
        return { estado: "reintentar" };
      }
    },

    /** La sesión completa de esa cookie, o `null`. Falla cerrado: si la base no responde, no hay sesión. */
    async leerSesion(token: string | undefined): Promise<SesionVigente | null> {
      if (modo === "cerradas" || !token || !FORMATO_TOKEN.test(token)) return null;
      const instante = ahora();
      const hash = hashToken(token);
      try {
        const s = await almacen.leerSesion(hash, iso(instante), iso(antes(instante, SESION_INACTIVA_MS)));
        if (!s || s.fase !== "activa") return null;
        await almacen.tocarSesion(hash, iso(instante), iso(antes(instante, 10 * 60_000))).catch(() => {});
        return { id: s.id, cuentaId: s.cuentaId, nombre: s.nombre, dosPasos: s.dosPasos, tokenHash: hash, csrf: cifrador.tokenCsrf(hash) };
      } catch {
        fallaDeBase("cuentas_sesion");
        return null;
      }
    },

    /** ¿Hay una sesión a medias (contraseña correcta, falta el código) con esta cookie? */
    async haySesionPendiente(token: string | undefined): Promise<boolean> {
      if (modo === "cerradas" || !token || !FORMATO_TOKEN.test(token)) return false;
      const instante = ahora();
      try {
        const s = await almacen.leerSesion(hashToken(token), iso(instante), iso(antes(instante, SESION_INACTIVA_MS)));
        return s?.fase === "pendiente";
      } catch {
        fallaDeBase("cuentas_sesion");
        return false;
      }
    },

    /** Cierra la sesión de verdad (la cookie borrada del navegador no basta: la revocación está en la base). */
    async cerrarSesion(token: string | undefined): Promise<void> {
      if (!token || !FORMATO_TOKEN.test(token)) return;
      await almacen.revocarSesion(hashToken(token), iso(ahora())).catch(() => fallaDeBase("cuentas_cierre"));
      logSecurityEvent({ tipo: "acceso_cuenta", resultado: "cierre" });
    },

    // ── Olvidé mi contraseña ───────────────────────────────────────────────────────────────────────────────────────

    async solicitarRestablecer(entrada: { correo: unknown; sitio_web: unknown; tiempo?: unknown }, claveCliente: string): Promise<ResultadoRestablecer> {
      if (!lim.olvide.cliente.tryConsume(claveCliente) || !lim.olvide.global.tryConsume()) return { estado: "limite" };
      const validado = CorreoSchema.safeParse(entrada.correo);
      if (!validado.success) return { estado: "invalida", errores: { correo: validado.error.issues[0]?.message ?? "Escribe un correo válido." } };
      const trampa = typeof entrada.sitio_web === "string" && entrada.sitio_web.trim() !== "";
      if (modo === "cerradas" && !trampa) return { estado: "cerrada" };
      const ok: ResultadoRestablecer = { estado: "ok", prueba };

      return conDuracionMinima(async () => {
        if (trampa) return ok;
        const instante = ahora();
        if (marcaValida && !marcaValida(entrada.tiempo, instante)) {
          logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_marca_de_tiempo" });
          return { estado: "espera" } as const;
        }
        // Desde aquí la respuesta es siempre la misma: que el correo tenga cuenta, o que algo falle, no se nota.
        try {
          const cuenta = await almacen.buscarPorCorreo(cifrador.indiceCorreo(validado.data));
          if (!cuenta) return ok;
          const token = generar();
          const tokenHash = hashToken(token);
          const emision = await almacen.emitirRestablecer({
            cuentaId: cuenta.id,
            tokenHash,
            ahora: iso(instante),
            reenviarSiAnteriorA: iso(antes(instante, ESPERA_REENVIO_MS)),
          });
          if (emision === "reciente") return ok;
          if (!(await reservarCorreo(instante, "seguridad"))) {
            logSecurityEvent({ tipo: "limite_excedido", recurso: "cuentas_envios_diarios" });
            await almacen.descartarEnlace(tokenHash);
            return ok;
          }
          try {
            await enviar({ para: validado.data, ...correoRestablecer(enlaceCuenta(urlSitio, "/cuenta/restablecer", token)) });
            logSecurityEvent({ tipo: "cuenta", evento: "restablecer_pedido" });
          } catch {
            await almacen.descartarEnlace(tokenHash).catch(() => {});
          }
        } catch {
          fallaDeBase("cuentas_restablecer");
        }
        return ok;
      });
    },

    async consultarRestablecer(token: unknown, claveCliente: string): Promise<ConsultaEnlace> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.restablecer.tryConsume(claveCliente)) return { estado: "limite" };
      const t = typeof token === "string" && FORMATO_TOKEN.test(token) ? token : null;
      if (!t) return { estado: "invalido" };
      try {
        const r = await almacen.leerRestablecer(hashToken(t), iso(antes(ahora(), VIGENCIA_RESTABLECER_MS)));
        return r ? { estado: "valido", correoEnmascarado: null } : { estado: "invalido" };
      } catch {
        fallaDeBase("cuentas_leer_restablecer");
        return { estado: "invalido" };
      }
    },

    /** Elige la contraseña nueva con el enlace del correo. Cierra todas las sesiones; no inicia ninguna. */
    async restablecer(entrada: { token: unknown; clave: unknown; repetir: unknown }, ctx: Contexto): Promise<ResultadoClaveNueva> {
      if (modo === "cerradas") return { estado: "cerrada" };
      if (!lim.restablecer.tryConsume(ctx.claveCliente)) return { estado: "limite" };
      const token = typeof entrada.token === "string" && FORMATO_TOKEN.test(entrada.token) ? entrada.token : null;
      if (!token) return { estado: "enlace" };
      const instante = ahora();
      const tokenHash = hashToken(token);
      const vigenteDesde = iso(antes(instante, VIGENCIA_RESTABLECER_MS));
      try {
        const enlace = await almacen.leerRestablecer(tokenHash, vigenteDesde);
        if (!enlace) return { estado: "enlace" };
        const cuenta = await cuentaDe(enlace.cuentaId);
        if (!cuenta) return { estado: "enlace" };
        const correo = correoDe(cuenta);
        const errores = erroresDeClave(correo, cuenta.nombre, entrada.clave, entrada.repetir, "clave");
        if (Object.keys(errores).length > 0) return { estado: "invalida", errores };
        const claveHash = await clave.hashear(entrada.clave as string);
        const usado = await almacen.usarRestablecer({ tokenHash, vigenteDesde, claveHash, ahora: iso(instante) });
        if (!usado) return { estado: "enlace" };
        logSecurityEvent({ tipo: "cuenta", evento: "clave_restablecida" });
        await avisar(correo, correoClaveCambiada(enlaceCuenta(urlSitio, "/cuenta/olvide")));
        return { estado: "ok" };
      } catch (error) {
        if (error instanceof ClaveSaturada) return { estado: "reintentar" };
        fallaDeBase("cuentas_restablecer");
        return { estado: "reintentar" };
      }
    },

    // ── Perfil ─────────────────────────────────────────────────────────────────────────────────────────────────────

    async perfil(cuentaId: string): Promise<PerfilVista | null> {
      const c = await cuentaDe(cuentaId);
      if (!c) return null;
      return {
        correo: correoDe(c),
        nombre: c.nombre,
        temas: c.temas,
        resumenPrevio: c.resumenPrevio,
        dosPasos: c.totpActivado !== null,
        dosPasosDesde: c.totpActivado,
        creada: c.creada,
        claveCambiada: c.claveCambiada,
        versionTextos: c.versionTextos,
        aceptado: c.aceptado,
        codigosLibres: c.totpActivado ? await almacen.contarCodigosLibres(c.id).catch(() => 0) : 0,
      };
    },

    async guardarPerfil(cuentaId: string, entrada: { nombre: unknown; temas: unknown; resumenPrevio: unknown }): Promise<ResultadoPerfil> {
      const v = PerfilSchema.safeParse({
        nombre: typeof entrada.nombre === "string" ? entrada.nombre : "",
        temas: Array.isArray(entrada.temas) ? entrada.temas : [],
        resumenPrevio: entrada.resumenPrevio === true,
      });
      if (!v.success) {
        const errores: Errores = {};
        for (const issue of v.error.issues) {
          const campo = issue.path[0];
          if ((campo === "nombre" || campo === "temas") && !errores[campo]) errores[campo] = issue.message;
        }
        return { estado: "invalida", errores };
      }
      await almacen.actualizarPerfil(cuentaId, v.data, iso(ahora()));
      return { estado: "ok", guardado: { nombre: v.data.nombre, temas: v.data.temas, resumenPrevio: v.data.resumenPrevio } };
    },

    // ── Seguridad de la cuenta ─────────────────────────────────────────────────────────────────────────────────────

    async cambiarClave(
      sesion: Pick<SesionVigente, "cuentaId" | "tokenHash">,
      entrada: { actual: unknown; nueva: unknown; repetir: unknown; codigo?: unknown },
    ): Promise<ResultadoConfirmado> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta) return { estado: "reintentar" };
      const instante = ahora();
      const correo = correoDe(cuenta);
      const errores = erroresDeClave(correo, cuenta.nombre, entrada.nueva, entrada.repetir, "nueva");
      if (!errores.nueva && !errores.repetir && entrada.nueva === entrada.actual) errores.nueva = "La contraseña nueva debe ser distinta de la actual.";
      if (Object.keys(errores).length > 0) return { estado: "invalida", errores };

      try {
        const r = await reautenticar(cuenta, entrada.actual, entrada.codigo, instante);
        if (r.estado !== "ok") return r;
        const claveHash = await clave.hashear(entrada.nueva as string);
        await almacen.cambiarClave({ cuentaId: cuenta.id, claveHash, ahora: iso(instante), conservarSesion: sesion.tokenHash });
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_cambiar_clave");
        return { estado: "reintentar" };
      }
      logSecurityEvent({ tipo: "cuenta", evento: "clave_cambiada" });
      await avisar(correo, correoClaveCambiada(enlaceCuenta(urlSitio, "/cuenta/olvide")));
      return { estado: "ok" };
    },

    sesionesAbiertas,

    async cerrarOtrasSesiones(sesion: Pick<SesionVigente, "cuentaId" | "tokenHash">): Promise<number> {
      const n = await almacen.revocarOtras(sesion.cuentaId, sesion.tokenHash, iso(ahora())).catch(() => 0);
      if (n > 0) logSecurityEvent({ tipo: "cuenta", evento: "sesiones_cerradas" });
      return n;
    },

    async cerrarSesionPorId(cuentaId: string, id: unknown): Promise<boolean> {
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false;
      const cerrada = await almacen.revocarSesionPorId(cuentaId, id, iso(ahora())).catch(() => false);
      if (cerrada) logSecurityEvent({ tipo: "cuenta", evento: "sesiones_cerradas" });
      return cerrada;
    },

    async actividad(cuentaId: string): Promise<EventoGuardado[]> {
      return almacen.eventosRecientes(cuentaId, 10).catch(() => []);
    },

    // ── Verificación en dos pasos ──────────────────────────────────────────────────────────────────────────────────

    /** El secreto que se está agregando a la app, si la persona dejó la configuración a medias. */
    async dosPasosPendiente(cuentaId: string): Promise<{ secreto: string; uri: string } | null> {
      const c = await cuentaDe(cuentaId);
      if (!c || c.totpActivado || !c.totpPendienteCifrado) return null;
      const correo = correoDe(c);
      if (!correo) return null;
      try {
        const secreto = cifrador.descifrarTotp(c.totpPendienteCifrado, c.id);
        return { secreto, uri: uriTotp(secreto, correo) };
      } catch {
        fallaDeBase("cuentas_descifrar");
        return null;
      }
    },

    /** Empieza a configurar los dos pasos: pide la contraseña, crea el secreto y lo deja pendiente hasta confirmar. */
    async iniciarDosPasos(
      sesion: Pick<SesionVigente, "cuentaId">,
      entrada: { actual: unknown },
    ): Promise<ResultadoConfirmado<{ secreto: string; uri: string }> | { estado: "ya_activa" }> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta) return { estado: "reintentar" };
      if (cuenta.totpActivado) return { estado: "ya_activa" };
      const correo = correoDe(cuenta);
      if (!correo) return { estado: "reintentar" };
      try {
        const r = await reautenticar(cuenta, entrada.actual, undefined, ahora());
        if (r.estado !== "ok") return r;
        const secreto = generarSecretoTotp();
        await almacen.guardarTotpPendiente(cuenta.id, cifrador.cifrarTotp(secreto, cuenta.id));
        return { estado: "ok", secreto, uri: uriTotp(secreto, correo) };
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_dos_pasos");
        return { estado: "reintentar" };
      }
    },

    /** Confirma que la app quedó bien configurada con un código; entrega los códigos de recuperación (una sola vez). */
    async confirmarDosPasos(
      sesion: Pick<SesionVigente, "cuentaId">,
      entrada: { codigo: unknown },
    ): Promise<ResultadoConfirmado<{ codigos: string[] }> | { estado: "sin_pendiente" }> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta || cuenta.totpActivado || !cuenta.totpPendienteCifrado) return { estado: "sin_pendiente" };
      const instante = ahora();
      if (bloqueada(cuenta, instante)) return { estado: "limite" };
      const codigo = typeof entrada.codigo === "string" ? entrada.codigo.replace(/\s/g, "") : "";
      if (!/^\d{6}$/.test(codigo)) return { estado: "invalida", errores: { codigo: "Escribe los seis dígitos que muestra tu app." } };
      try {
        const secreto = cifrador.descifrarTotp(cuenta.totpPendienteCifrado, cuenta.id);
        const paso = verificarTotp(secreto, codigo, instante.getTime());
        if (paso === null) {
          // Es el código de una app que la propia persona está agregando, no una puerta de entrada: pesa como una contraseña.
          await sumarFallo(cuenta, instante, PUNTOS_CLAVE);
          return { estado: "invalida", errores: { codigo: "Ese código no coincide. Revisa que la hora de tu teléfono sea la correcta e inténtalo con el siguiente." } };
        }
        const codigos = nuevosCodigos();
        const activada = await almacen.activarTotp({ cuentaId: cuenta.id, ahora: iso(instante), paso, codigosHash: codigos.map(hashCodigoRecuperacion) });
        if (!activada) return { estado: "sin_pendiente" };
        logSecurityEvent({ tipo: "cuenta", evento: "dos_pasos_activados" });
        await avisar(correoDe(cuenta), correoDosPasos(true, enlaceCuenta(urlSitio, "/cuenta/seguridad")));
        return { estado: "ok", codigos };
      } catch {
        fallaDeBase("cuentas_dos_pasos");
        return { estado: "reintentar" };
      }
    },

    async desactivarDosPasos(
      sesion: Pick<SesionVigente, "cuentaId">,
      entrada: { actual: unknown; codigo: unknown },
    ): Promise<ResultadoConfirmado> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta || !cuenta.totpActivado) return { estado: "reintentar" };
      const instante = ahora();
      try {
        const r = await reautenticar(cuenta, entrada.actual, entrada.codigo, instante);
        if (r.estado !== "ok") return r;
        await almacen.desactivarTotp(cuenta.id, iso(instante));
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_dos_pasos");
        return { estado: "reintentar" };
      }
      logSecurityEvent({ tipo: "cuenta", evento: "dos_pasos_desactivados" });
      await avisar(correoDe(cuenta), correoDosPasos(false, enlaceCuenta(urlSitio, "/cuenta/seguridad")));
      return { estado: "ok" };
    },

    async regenerarCodigos(
      sesion: Pick<SesionVigente, "cuentaId">,
      entrada: { actual: unknown; codigo: unknown },
    ): Promise<ResultadoConfirmado<{ codigos: string[] }>> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta || !cuenta.totpActivado) return { estado: "reintentar" };
      const instante = ahora();
      try {
        const r = await reautenticar(cuenta, entrada.actual, entrada.codigo, instante);
        if (r.estado !== "ok") return r;
        const codigos = nuevosCodigos();
        await almacen.reemplazarCodigos(cuenta.id, codigos.map(hashCodigoRecuperacion), iso(instante));
        logSecurityEvent({ tipo: "cuenta", evento: "codigos_regenerados" });
        return { estado: "ok", codigos };
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_dos_pasos");
        return { estado: "reintentar" };
      }
    },

    // ── Tus datos ──────────────────────────────────────────────────────────────────────────────────────────────────

    /** Todo lo que se guarda de la cuenta, para que la persona lo descargue. Sin contraseña, secretos ni códigos. */
    async exportar(sesion: Pick<SesionVigente, "cuentaId" | "tokenHash">): Promise<DatosExportados | null> {
      const c = await cuentaDe(sesion.cuentaId);
      if (!c) return null;
      const instante = ahora();
      const [abiertas, actividad, invitacion] = await Promise.all([
        sesionesAbiertas(sesion),
        almacen.eventosRecientes(c.id, 200).catch(() => []),
        almacen.invitacionDeCuenta(c.id).catch(() => null),
      ]);
      logSecurityEvent({ tipo: "cuenta", evento: "datos_exportados" });
      return {
        exportado: iso(instante),
        cuenta: {
          correo: correoDe(c),
          nombre: c.nombre,
          creada: c.creada,
          claveCambiada: c.claveCambiada,
          temas: c.temas,
          resumenPrevio: c.resumenPrevio,
          verificacionEnDosPasos: c.totpActivado !== null,
          aceptaste: { versionDeLosTextos: c.versionTextos, fecha: c.aceptado },
          invitacion: invitacion ? { alias: invitacion.alias, emitida: invitacion.emitida, usada: invitacion.usada } : null,
        },
        sesionesAbiertas: abiertas.map((s) => ({ dispositivo: s.dispositivo, iniciada: s.creada, ultimoUso: s.ultimoUso })),
        actividad,
        nota: "Esto es todo lo que Otea Austral guarda de tu cuenta. La contraseña se guarda solo como un hash que no se puede revertir, y el correo y el secreto de la verificación en dos pasos, cifrados.",
      };
    },

    /** Borra la cuenta y todo lo que depende de ella. Pide la contraseña (y el código, si hay dos pasos). */
    async eliminar(sesion: Pick<SesionVigente, "cuentaId">, entrada: { actual: unknown; codigo: unknown }): Promise<ResultadoConfirmado> {
      const cuenta = await cuentaDe(sesion.cuentaId);
      if (!cuenta) return { estado: "reintentar" };
      const correo = correoDe(cuenta);
      try {
        const r = await reautenticar(cuenta, entrada.actual, entrada.codigo, ahora());
        if (r.estado !== "ok") return r;
        await almacen.eliminarCuenta(cuenta.id);
      } catch (error) {
        if (!(error instanceof ClaveSaturada)) fallaDeBase("cuentas_eliminar");
        return { estado: "reintentar" };
      }
      logSecurityEvent({ tipo: "cuenta", evento: "eliminada" });
      await avisar(correo, correoCuentaEliminada());
      return { estado: "ok" };
    },
  };
}

export type ServicioCuentas = ReturnType<typeof crearServicioCuentas>;
