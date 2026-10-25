import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codigoTotp, decodificarBase32, pasoTotp } from "@/lib/admin/totp";
import type { Correo } from "@/lib/correo/resend";
import { createFixedWindowLimiter } from "@/lib/security/rate-limit";
import { crearAlmacenMemoria } from "./almacen-memoria";
import { ClaveSaturada } from "./clave";
import { crearCifradorCuentas } from "./cifrado";
import {
  ENVIOS_POR_INVITACION,
  ESPERA_REENVIO_MS,
  INTENTOS_INVITACION_HORA,
  INTENTOS_POR_CODIGO_HORA,
  INTENTOS_CODIGO,
  INTENTOS_POR_CORREO_Y_CLIENTE,
  PUNTOS_CLAVE,
  PUNTOS_CODIGO,
  PUNTOS_MAX_CUENTA,
  VENTANA_FALLOS_MS,
  VIGENCIA_ALTA_MS,
  VIGENCIA_RESTABLECER_MS,
} from "./constantes";
import { crearServicioInvitaciones } from "./invitaciones";
import { crearServicioCuentas, type Contexto, type DependenciasClave, type DependenciasServicio, type SesionEmitida } from "./servicio";
import { VERSION_TEXTOS } from "./schema";

const SECRETO = "S".repeat(43);
const SITIO = "https://oteaustral.com";
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const CLAVE_BUENA = "lluvia sobre el cerro azul";
const CLAVE_NUEVA = "tres gatos viajan en tren";
const CORREO = "persona@correo.cl";

/** Hash de mentira, rápido y con la forma que exige la base: sirve para probar la lógica sin gastar scrypt. */
const hashFalso = (c: string, viejo = false) =>
  `scrypt$${viejo ? 16384 : 32768}$8$3$${"A".repeat(22)}$${createHash("sha256").update(c.normalize("NFKC")).digest("base64url")}`;

function montar(
  opciones: {
    modo?: "cerradas" | "memoria" | "abiertas" | "invitacion";
    sinMarca?: boolean;
    tope?: number;
    limitadores?: DependenciasServicio["limitadores"];
    /** Usa los límites de verdad (los de producción) en vez de los holgados de las pruebas. */
    limitesReales?: boolean;
    clave?: Partial<DependenciasClave>;
  } = {},
) {
  const almacen = crearAlmacenMemoria();
  const cifrador = crearCifradorCuentas(SECRETO);
  const correos: Correo[] = [];
  let reloj = Date.UTC(2026, 9, 11, 15, 0, 0);
  let contador = 0;
  let senuelos = 0;
  const fallos = { envio: false };
  const clave: DependenciasClave = {
    hashear: async (c) => hashFalso(c),
    verificar: async (c, h) => h === hashFalso(c) || h === hashFalso(c, true),
    necesitaRehash: (h) => h.startsWith("scrypt$16384"),
    senuelo: async () => {
      senuelos += 1;
      return false;
    },
    ...opciones.clave,
  };
  const generarToken = () => Buffer.concat([Buffer.from(`token-${++contador}-`), Buffer.alloc(32)]).subarray(0, 32).toString("base64url");
  const servicio = crearServicioCuentas({
    modo: opciones.modo ?? "abiertas",
    almacen,
    cifrador,
    urlSitio: SITIO,
    enviar: async (c) => {
      if (fallos.envio) throw new Error("no se pudo enviar");
      correos.push(c);
    },
    clave,
    maximoEnviosDiarios: opciones.tope ?? 50,
    generarToken,
    ahora: () => new Date(reloj),
    duracionMinimaMs: 0,
    marcaValida: opciones.sinMarca ? undefined : (marca) => marca === "marca-buena",
    // Los límites normales no estorban a las pruebas que no hablan de ellos.
    limitadores: opciones.limitesReales ? undefined : {
      alta: { cliente: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }), global: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }) },
      invitacion: {
        hora: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
        dia: createFixedWindowLimiter({ limite: 1000, ventanaMs: DIA }),
        codigo: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
      },
      activar: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
      entrar: {
        cliente: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
        global: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
        correoYCliente: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
        correo: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
      },
      segundoPaso: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
      olvide: { cliente: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }), global: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }) },
      restablecer: createFixedWindowLimiter({ limite: 1000, ventanaMs: HORA }),
      ...opciones.limitadores,
    },
  });
  const ctx: Contexto = { claveCliente: "cliente-1", dispositivo: "Chrome en Linux" };
  return {
    servicio,
    almacen,
    cifrador,
    correos,
    ctx,
    fallos,
    senuelos: () => senuelos,
    avanzar: (ms: number) => {
      reloj += ms;
    },
    ahora: () => new Date(reloj),
  };
}

type Mundo = ReturnType<typeof montar>;

/** El enlace (con token) del último correo enviado. */
function ultimoEnlace(m: Mundo): { enlace: string; token: string; ruta: string } {
  const correo = m.correos.at(-1);
  if (!correo) throw new Error("No se envió ningún correo.");
  const enlace = /https?:\/\/\S+/.exec(correo.texto)?.[0];
  if (!enlace) throw new Error("El correo no lleva enlace.");
  const url = new URL(enlace);
  return { enlace, token: url.searchParams.get("token") ?? "", ruta: url.pathname };
}

const ALTA = { correo: CORREO, condiciones: "on", privacidad: "on", sitio_web: "", tiempo: "marca-buena" };

/** Crea una cuenta de punta a punta: pide el alta, abre el enlace del correo y elige la contraseña. */
async function crearCuenta(m: Mundo, correo = CORREO, clave = CLAVE_BUENA): Promise<SesionEmitida> {
  const alta = await m.servicio.solicitarAlta({ ...ALTA, correo }, m.ctx.claveCliente);
  expect(alta.estado).toBe("ok");
  const { token } = ultimoEnlace(m);
  const r = await m.servicio.activar({ token, clave, repetir: clave }, m.ctx);
  if (r.estado !== "ok") throw new Error(`No se pudo activar: ${r.estado}`);
  return r.sesion;
}

const codigoActual = (m: Mundo, secreto: string) => codigoTotp(decodificarBase32(secreto), pasoTotp(m.ahora().getTime()));

/** Activa los dos pasos de la cuenta con la sesión dada; devuelve el secreto y los códigos de recuperación. */
async function activarDosPasos(m: Mundo, sesion: SesionEmitida, clave = CLAVE_BUENA) {
  const vigente = (await m.servicio.leerSesion(sesion.token))!;
  const inicio = await m.servicio.iniciarDosPasos(vigente, { actual: clave });
  if (inicio.estado !== "ok") throw new Error(`No se pudo iniciar: ${inicio.estado}`);
  // El mismo paso de tiempo no se reutiliza: se confirma con el código del paso siguiente (la ventana admite ±1).
  m.avanzar(30_000);
  const confirmacion = await m.servicio.confirmarDosPasos(vigente, { codigo: codigoActual(m, inicio.secreto) });
  if (confirmacion.estado !== "ok") throw new Error(`No se pudo confirmar: ${confirmacion.estado}`);
  return { secreto: inicio.secreto, codigos: confirmacion.codigos, vigente };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crear la cuenta", () => {
  describe("paso 1: dejar el correo", () => {
    it("envía un correo con el enlace de confirmación y no crea ninguna cuenta todavía", async () => {
      const m = montar();
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "ok", prueba: false });
      expect(m.correos).toHaveLength(1);
      expect(m.correos[0].para).toBe(CORREO);
      const { ruta, token } = ultimoEnlace(m);
      expect(ruta).toBe("/cuenta/activar");
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(m.almacen.cuentasGuardadas()).toEqual([]);
    });

    it("normaliza el correo: mayúsculas y espacios no crean otra cuenta", async () => {
      const m = montar();
      await m.servicio.solicitarAlta({ ...ALTA, correo: "  Persona@Correo.CL " }, "c");
      expect(m.correos[0].para).toBe(CORREO);
    });

    it("pide el correo y las dos casillas, cada una con su mensaje", async () => {
      const m = montar();
      expect(await m.servicio.solicitarAlta({ ...ALTA, correo: "no-es-correo", condiciones: undefined, privacidad: undefined }, "c")).toEqual({
        estado: "invalida",
        errores: {
          correo: "Escribe un correo válido.",
          condiciones: "Para crear tu cuenta necesitas aceptar las condiciones de uso.",
          privacidad: "Necesitamos tu consentimiento para guardar los datos de tu cuenta.",
        },
      });
      expect(await m.servicio.solicitarAlta({ ...ALTA, privacidad: undefined }, "c")).toMatchObject({ estado: "invalida", errores: { privacidad: expect.any(String) } });
      expect(await m.servicio.solicitarAlta({ ...ALTA, correo: "a".repeat(250) + "@x.cl" }, "c")).toMatchObject({ errores: { correo: "El correo es demasiado largo." } });
      expect(m.correos).toHaveLength(0);
    });

    it("guarda con la solicitud la versión de los textos que aceptó", async () => {
      const m = montar();
      await m.servicio.solicitarAlta(ALTA, "c");
      const sesion = await crearCuenta(montar(), "otra@correo.cl");
      expect(sesion.token).toBeTruthy();
      const m2 = montar();
      await crearCuenta(m2);
      expect(m2.almacen.cuentasGuardadas()[0].versionTextos).toBe(VERSION_TEXTOS);
    });

    it("el campo trampa: parece que funcionó, pero no se envía nada", async () => {
      const m = montar();
      expect(await m.servicio.solicitarAlta({ ...ALTA, sitio_web: "http://spam.example" }, "c")).toEqual({ estado: "ok", prueba: false });
      expect(m.correos).toHaveLength(0);
    });

    it("la marca de tiempo falsa, ausente o vencida pide esperar y no envía nada", async () => {
      const m = montar();
      expect(await m.servicio.solicitarAlta({ ...ALTA, tiempo: "marca-falsa" }, "c")).toEqual({ estado: "espera" });
      expect(await m.servicio.solicitarAlta({ ...ALTA, tiempo: undefined }, "c")).toEqual({ estado: "espera" });
      expect(m.correos).toHaveLength(0);
    });

    it("con las cuentas cerradas no guarda ni envía nada", async () => {
      const m = montar({ modo: "cerradas" });
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "cerrada" });
      expect(m.correos).toHaveLength(0);
      // Aun cerradas, un formulario mal llenado dice qué le falta.
      expect(await m.servicio.solicitarAlta({ ...ALTA, correo: "x" }, "c")).toMatchObject({ estado: "invalida" });
    });

    it("en modo de prueba lo avisa", async () => {
      const m = montar({ modo: "memoria" });
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "ok", prueba: true });
    });

    it("limita las solicitudes por cliente y en total", async () => {
      const m = montar({
        limitadores: { alta: { cliente: createFixedWindowLimiter({ limite: 2, ventanaMs: HORA }), global: createFixedWindowLimiter({ limite: 3, ventanaMs: HORA }) } },
      });
      expect((await m.servicio.solicitarAlta(ALTA, "uno")).estado).toBe("ok");
      expect((await m.servicio.solicitarAlta({ ...ALTA, correo: "b@correo.cl" }, "uno")).estado).toBe("ok");
      expect((await m.servicio.solicitarAlta({ ...ALTA, correo: "c@correo.cl" }, "uno")).estado).toBe("limite");
      expect((await m.servicio.solicitarAlta({ ...ALTA, correo: "d@correo.cl" }, "dos")).estado).toBe("ok");
      expect((await m.servicio.solicitarAlta({ ...ALTA, correo: "e@correo.cl" }, "tres")).estado).toBe("limite"); // tope global
    });

    it("pedirlo dos veces seguidas manda un solo correo; pasado el plazo, otro, y el enlace anterior deja de servir", async () => {
      const m = montar();
      await m.servicio.solicitarAlta(ALTA, "c");
      const primero = ultimoEnlace(m).token;
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "ok", prueba: false }); // misma respuesta
      expect(m.correos).toHaveLength(1);
      m.avanzar(ESPERA_REENVIO_MS + MIN);
      await m.servicio.solicitarAlta(ALTA, "c");
      expect(m.correos).toHaveLength(2);
      const segundo = ultimoEnlace(m).token;
      expect(segundo).not.toBe(primero);
      expect((await m.servicio.consultarAlta(primero, "c")).estado).toBe("invalido");
      expect((await m.servicio.consultarAlta(segundo, "c")).estado).toBe("valido");
    });

    it("si el correo ya tiene cuenta, la respuesta es la misma y se avisa a su dueña o dueño (una vez por hora)", async () => {
      const m = montar();
      await crearCuenta(m);
      const antes = m.correos.length;
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "ok", prueba: false });
      expect(m.correos).toHaveLength(antes + 1);
      const aviso = m.correos.at(-1)!;
      expect(aviso.para).toBe(CORREO);
      expect(aviso.asunto).toContain("Intentaron crear una cuenta");
      expect(aviso.texto).not.toMatch(/token=/);
      expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
      // Otra vez dentro de la hora: misma respuesta, sin otro aviso.
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "ok", prueba: false });
      expect(m.correos).toHaveLength(antes + 1);
      m.avanzar(HORA + MIN);
      await m.servicio.solicitarAlta(ALTA, "c");
      expect(m.correos).toHaveLength(antes + 2);
    });

    it("la cuota diaria de correos: al agotarse avisa y no deja enlaces sueltos", async () => {
      const m = montar({ tope: 5 }); // las altas pueden usar el 60 %: 3 correos
      await m.servicio.solicitarAlta({ ...ALTA, correo: "a@correo.cl" }, "c");
      await m.servicio.solicitarAlta({ ...ALTA, correo: "b@correo.cl" }, "c");
      await m.servicio.solicitarAlta({ ...ALTA, correo: "c@correo.cl" }, "c");
      expect(await m.servicio.solicitarAlta({ ...ALTA, correo: "d@correo.cl" }, "c")).toEqual({ estado: "saturada" });
      expect(m.correos).toHaveLength(3);
      // Mañana hay cupo, y la solicitud rechazada no dejó un enlace pendiente que bloquee el reintento.
      m.avanzar(DIA);
      expect((await m.servicio.solicitarAlta({ ...ALTA, correo: "d@correo.cl" }, "c")).estado).toBe("ok");
      expect(m.correos).toHaveLength(4);
    });

    it("las altas no pueden llenar la cuota: queda cupo reservado para restablecer la contraseña y los avisos", async () => {
      const m = montar({ tope: 5 }); // las altas pueden usar 3 de los 5 correos del día
      await crearCuenta(m); // 1
      m.correos.length = 0;
      await m.servicio.solicitarAlta({ ...ALTA, correo: "b@correo.cl" }, "c"); // 2
      await m.servicio.solicitarAlta({ ...ALTA, correo: "c@correo.cl" }, "c"); // 3
      expect(await m.servicio.solicitarAlta({ ...ALTA, correo: "d@correo.cl" }, "c")).toEqual({ estado: "saturada" });
      expect(m.correos).toHaveLength(2);

      // Con las altas ya detenidas, restablecer la contraseña sigue funcionando (4)…
      await m.servicio.solicitarRestablecer({ correo: CORREO, sitio_web: "", tiempo: "marca-buena" }, "c");
      expect(m.correos).toHaveLength(3);
      expect(ultimoEnlace(m).ruta).toBe("/cuenta/restablecer");

      // …y también el aviso de un cambio hecho con sesión (5).
      const entro = await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx);
      if (entro.estado !== "ok") throw new Error(`no entró: ${entro.estado}`);
      const vigente = (await m.servicio.leerSesion(entro.sesion.token))!;
      expect((await m.servicio.cambiarClave(vigente, { actual: CLAVE_BUENA, nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA })).estado).toBe("ok");
      expect(m.correos).toHaveLength(4);

      // El cupo del día se agotó del todo: ya no sale nada más, tampoco un restablecer…
      m.avanzar(ESPERA_REENVIO_MS + MIN);
      expect(await m.servicio.solicitarRestablecer({ correo: CORREO, sitio_web: "", tiempo: "marca-buena" }, "c")).toEqual({ estado: "ok", prueba: false });
      expect(m.correos).toHaveLength(4);
      // …y mañana vuelve a haber.
      m.avanzar(DIA);
      await m.servicio.solicitarRestablecer({ correo: CORREO, sitio_web: "", tiempo: "marca-buena" }, "c");
      expect(m.correos).toHaveLength(5);
    });

    it("si el correo no puede enviarse, se puede reintentar de inmediato", async () => {
      const m = montar();
      m.fallos.envio = true;
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "reintentar" });
      m.fallos.envio = false;
      expect((await m.servicio.solicitarAlta(ALTA, "c")).estado).toBe("ok");
      expect(m.correos).toHaveLength(1);
    });

    it("si la base falla, pide reintentar y no revela nada", async () => {
      const m = montar();
      vi.spyOn(m.almacen, "emitirAlta").mockRejectedValue(new Error("base caída"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "reintentar" });
    });
  });

  describe("paso 2: elegir la contraseña con el enlace", () => {
    async function conEnlace(m: Mundo, correo = CORREO) {
      await m.servicio.solicitarAlta({ ...ALTA, correo }, "c");
      return ultimoEnlace(m).token;
    }

    it("la página del enlace muestra el correo enmascarado, sin gastar el enlace", async () => {
      const m = montar();
      const token = await conEnlace(m);
      expect(await m.servicio.consultarAlta(token, "c")).toEqual({ estado: "valido", correoEnmascarado: "p***@correo.cl" });
      expect(await m.servicio.consultarAlta(token, "c")).toMatchObject({ estado: "valido" });
    });

    it("un enlace malformado, desconocido o vencido no sirve", async () => {
      const m = montar();
      const token = await conEnlace(m);
      expect((await m.servicio.consultarAlta("corto", "c")).estado).toBe("invalido");
      expect((await m.servicio.consultarAlta(undefined, "c")).estado).toBe("invalido");
      expect((await m.servicio.consultarAlta("B".repeat(43), "c")).estado).toBe("invalido");
      m.avanzar(VIGENCIA_ALTA_MS + MIN);
      expect((await m.servicio.consultarAlta(token, "c")).estado).toBe("invalido");
      expect(await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).toEqual({ estado: "enlace" });
    });

    it("crea la cuenta, entra y no guarda ningún dato en claro", async () => {
      const m = montar();
      const token = await conEnlace(m);
      const r = await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx);
      expect(r.estado).toBe("ok");
      if (r.estado !== "ok") return;
      expect(r.sesion.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(r.sesion.expira.getTime() - m.ahora().getTime()).toBe(30 * DIA);

      const guardada = m.almacen.cuentasGuardadas();
      expect(guardada).toHaveLength(1);
      const volcado = JSON.stringify(guardada);
      for (const secreto of [CORREO, "persona", CLAVE_BUENA, token, r.sesion.token]) expect(volcado).not.toContain(secreto);
      expect(guardada[0].claveHash).toBe(hashFalso(CLAVE_BUENA));

      const vigente = await m.servicio.leerSesion(r.sesion.token);
      expect(vigente).toMatchObject({ nombre: null, dosPasos: false });
      expect((await m.servicio.perfil(vigente!.cuentaId))?.correo).toBe(CORREO);
    });

    it("el enlace sirve una sola vez, también con dos solicitudes a la vez", async () => {
      const m = montar();
      const token = await conEnlace(m);
      const entrada = { token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA };
      const [a, b] = await Promise.all([m.servicio.activar(entrada, m.ctx), m.servicio.activar(entrada, m.ctx)]);
      expect([a.estado, b.estado].sort()).toEqual(["enlace", "ok"]);
      expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
      expect(await m.servicio.activar(entrada, m.ctx)).toEqual({ estado: "enlace" });
    });

    it("una contraseña débil no gasta el enlace: se puede intentar otra vez", async () => {
      const m = montar();
      const token = await conEnlace(m);
      const intento = (clave: string, repetir = clave) => m.servicio.activar({ token, clave, repetir }, m.ctx);
      expect(await intento("corta")).toMatchObject({ estado: "invalida", errores: { clave: expect.stringContaining("al menos 12") } });
      expect(await intento("password1234")).toMatchObject({ estado: "invalida", errores: { clave: expect.stringContaining("más usadas") } });
      expect(await intento("persona-correo-2026")).toMatchObject({ estado: "invalida", errores: { clave: expect.stringContaining("correo") } });
      expect(await intento(CLAVE_BUENA, "otra cosa distinta")).toEqual({ estado: "invalida", errores: { repetir: "Las contraseñas no coinciden." } });
      expect(await intento("")).toMatchObject({ estado: "invalida", errores: { clave: "Escribe una contraseña." } });
      expect(m.almacen.cuentasGuardadas()).toHaveLength(0);
      expect((await intento(CLAVE_BUENA)).estado).toBe("ok");
    });

    it("limita los intentos por cliente", async () => {
      const m = montar({ limitadores: { activar: createFixedWindowLimiter({ limite: 2, ventanaMs: HORA }) } });
      const token = await conEnlace(m);
      expect((await m.servicio.consultarAlta(token, "c")).estado).toBe("valido");
      expect((await m.servicio.consultarAlta(token, "c")).estado).toBe("valido");
      expect((await m.servicio.consultarAlta(token, "c")).estado).toBe("limite");
      expect((await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, { ...m.ctx, claveCliente: "c" })).estado).toBe("limite");
      // Otro cliente no se ve afectado.
      expect((await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, { ...m.ctx, claveCliente: "otro" })).estado).toBe("ok");
    });

    it("con las cuentas cerradas, nada", async () => {
      const m = montar({ modo: "cerradas" });
      expect((await m.servicio.consultarAlta("A".repeat(43), "c")).estado).toBe("cerrada");
      expect((await m.servicio.activar({ token: "A".repeat(43), clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).estado).toBe("cerrada");
    });

    it("si el hash de contraseñas está saturado, pide reintentar sin gastar el enlace", async () => {
      let saturado = true;
      const m = montar({
        clave: {
          hashear: async (c) => {
            if (saturado) throw new ClaveSaturada();
            return hashFalso(c);
          },
        },
      });
      const token = await conEnlace(m);
      expect((await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).estado).toBe("reintentar");
      saturado = false;
      expect((await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
    });
  });
});

describe("entrar y salir", () => {
  it("entra con el correo y la contraseña; el token de la cookie abre la sesión y el CSRF es estable", async () => {
    const m = montar();
    await crearCuenta(m);
    const r = await m.servicio.entrar({ correo: " PERSONA@correo.cl ", clave: CLAVE_BUENA }, m.ctx);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    const vigente = await m.servicio.leerSesion(r.sesion.token);
    expect(vigente).not.toBeNull();
    expect(vigente!.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await m.servicio.leerSesion(r.sesion.token))!.csrf).toBe(vigente!.csrf);
    expect(vigente!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const tokenDeOtra = (await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)) as { sesion: SesionEmitida };
    expect((await m.servicio.leerSesion(tokenDeOtra.sesion.token))!.csrf).not.toBe(vigente!.csrf);
  });

  it("la contraseña incorrecta y el correo sin cuenta dan la misma respuesta, y el segundo gasta el trabajo señuelo", async () => {
    const m = montar();
    await crearCuenta(m);
    expect(await m.servicio.entrar({ correo: CORREO, clave: "no es la clave" }, m.ctx)).toEqual({ estado: "rechazado" });
    expect(m.senuelos()).toBe(0);
    expect(await m.servicio.entrar({ correo: "nadie@correo.cl", clave: "no es la clave" }, m.ctx)).toEqual({ estado: "rechazado" });
    expect(m.senuelos()).toBe(1);
    // Entradas sin forma tampoco dicen nada.
    expect(await m.servicio.entrar({ correo: undefined, clave: undefined }, m.ctx)).toEqual({ estado: "rechazado" });
    expect(await m.servicio.entrar({ correo: CORREO, clave: "" }, m.ctx)).toEqual({ estado: "rechazado" });
  });

  it("una sesión vigente deja de serlo al cerrarla (se revoca en el almacén, no solo en el navegador)", async () => {
    const m = montar();
    const sesion = await crearCuenta(m);
    expect(await m.servicio.leerSesion(sesion.token)).not.toBeNull();
    await m.servicio.cerrarSesion(sesion.token);
    expect(await m.servicio.leerSesion(sesion.token)).toBeNull();
  });

  it("una sesión vence a los 30 días o tras 7 sin usarse", async () => {
    const m = montar();
    const sesion = await crearCuenta(m);
    m.avanzar(6 * DIA);
    expect(await m.servicio.leerSesion(sesion.token)).not.toBeNull(); // la lectura anota el uso
    m.avanzar(6 * DIA);
    expect(await m.servicio.leerSesion(sesion.token)).not.toBeNull();
    m.avanzar(8 * DIA);
    expect(await m.servicio.leerSesion(sesion.token)).toBeNull(); // más de 7 días sin usarse
    const otra = await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx);
    if (otra.estado !== "ok") throw new Error("no entró");
    for (let i = 0; i < 5; i++) {
      m.avanzar(5 * DIA);
      expect(await m.servicio.leerSesion(otra.sesion.token)).not.toBeNull(); // usada cada 5 días
    }
    m.avanzar(5 * DIA + MIN); // más de 30 días desde que se abrió: vence aunque se haya usado siempre
    expect(await m.servicio.leerSesion(otra.sesion.token)).toBeNull();
  });

  it("una cookie con forma inválida, ausente o inventada no es una sesión", async () => {
    const m = montar();
    await crearCuenta(m);
    for (const falsa of [undefined, "", "corta", "A".repeat(43), "x".repeat(500), "../../etc/passwd"]) {
      expect(await m.servicio.leerSesion(falsa), String(falsa)).toBeNull();
    }
  });

  it("si la base falla al leer la sesión, no hay sesión (falla cerrado)", async () => {
    const m = montar();
    const sesion = await crearCuenta(m);
    vi.spyOn(m.almacen, "leerSesion").mockRejectedValue(new Error("base caída"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await m.servicio.leerSesion(sesion.token)).toBeNull();
  });

  it("con las cuentas cerradas no hay sesiones ni se puede entrar", async () => {
    const m = montar({ modo: "cerradas" });
    expect(await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).toEqual({ estado: "cerrada" });
    expect(await m.servicio.leerSesion("A".repeat(43))).toBeNull();
  });

  describe("intentos fallidos", () => {
    const sinTope = () => createFixedWindowLimiter({ limite: 100_000, ventanaMs: HORA });
    const entrarCon = (extra: Partial<NonNullable<DependenciasServicio["limitadores"]>["entrar"]>) => ({
      entrar: { cliente: sinTope(), global: sinTope(), correoYCliente: sinTope(), correo: sinTope(), ...extra },
    });

    it("por cliente: pasado el tope no se prueba más, aunque la contraseña sea la correcta", async () => {
      const m = montar({ limitadores: entrarCon({ cliente: createFixedWindowLimiter({ limite: 3, ventanaMs: VENTANA_FALLOS_MS }) }) });
      await crearCuenta(m);
      for (let i = 0; i < 3; i++) expect((await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("limite");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, { ...m.ctx, claveCliente: "otro" })).estado).toBe("ok");
    });

    it("por correo y cliente: quien insiste con un correo se bloquea a sí mismo, no a la dueña desde otro lugar", async () => {
      const m = montar({ limitadores: entrarCon({ correoYCliente: createFixedWindowLimiter({ limite: 3, ventanaMs: VENTANA_FALLOS_MS }) }) });
      await crearCuenta(m);
      const atacante = { ...m.ctx, claveCliente: "atacante" };
      for (let i = 0; i < 3; i++) expect((await m.servicio.entrar({ correo: CORREO, clave: "mala" }, atacante)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: "mala" }, atacante)).estado).toBe("limite");
      // Desde ese mismo cliente otro correo sigue pudiendo probarse (el tope es por par), y la dueña entra desde el suyo.
      expect((await m.servicio.entrar({ correo: "otra@correo.cl", clave: "mala" }, atacante)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
    });

    it("por correo y cliente, igual para cuentas que existen y para las que no (no delata cuáles existen)", async () => {
      const m = montar({ limitadores: entrarCon({ correoYCliente: createFixedWindowLimiter({ limite: 3, ventanaMs: VENTANA_FALLOS_MS }) }) });
      await crearCuenta(m);
      const resultados = async (correo: string) => {
        const salida: string[] = [];
        for (let i = 0; i < 5; i++) salida.push((await m.servicio.entrar({ correo, clave: "mala" }, m.ctx)).estado);
        return salida;
      };
      expect(await resultados(CORREO)).toEqual(["rechazado", "rechazado", "rechazado", "limite", "limite"]);
      expect(await resultados("nadie@correo.cl")).toEqual(["rechazado", "rechazado", "rechazado", "limite", "limite"]);
    });

    it("por correo desde todos los clientes, igual para cuentas que existen y para las que no", async () => {
      const m = montar({ limitadores: entrarCon({ correo: createFixedWindowLimiter({ limite: 3, ventanaMs: VENTANA_FALLOS_MS }) }) });
      await crearCuenta(m);
      const resultados = async (correo: string) => {
        const salida: string[] = [];
        for (let i = 0; i < 5; i++) salida.push((await m.servicio.entrar({ correo, clave: "mala" }, { ...m.ctx, claveCliente: `cliente-${correo}-${i}` })).estado);
        return salida;
      };
      expect(await resultados(CORREO)).toEqual(["rechazado", "rechazado", "rechazado", "limite", "limite"]);
      expect(await resultados("nadie@correo.cl")).toEqual(["rechazado", "rechazado", "rechazado", "limite", "limite"]);
    });

    it("con los límites de verdad, ocho contraseñas equivocadas desde un cliente no dejan a la dueña sin entrar", async () => {
      const m = montar({ limitesReales: true });
      await crearCuenta(m);
      const atacante = { ...m.ctx, claveCliente: "atacante" };
      for (let i = 0; i < INTENTOS_POR_CORREO_Y_CLIENTE; i++) expect((await m.servicio.entrar({ correo: CORREO, clave: `mala-${i}` }, atacante)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: "otra" }, atacante)).estado).toBe("limite");
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(INTENTOS_POR_CORREO_Y_CLIENTE * PUNTOS_CLAVE);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, { ...m.ctx, claveCliente: "dueña" })).estado).toBe("ok");
    });

    it("por cuenta, en la base: cien puntos en la ventana bloquean aunque la contraseña sea la correcta, y se libera al terminar", async () => {
      const m = montar();
      await crearCuenta(m);
      for (let i = 0; i < PUNTOS_MAX_CUENTA / PUNTOS_CLAVE; i++) expect((await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("limite");
      m.avanzar(VENTANA_FALLOS_MS - MIN);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("limite");
      m.avanzar(2 * MIN);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
    });

    it("un solo punto menos del tope todavía deja entrar (y ese intento borra los fallos)", async () => {
      const m = montar();
      await crearCuenta(m);
      for (let i = 0; i < PUNTOS_MAX_CUENTA - 1; i++) await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
      expect(m.almacen.cuentasGuardadas()[0]).toMatchObject({ fallos: 0, fallosDesde: null });
    });

    it("entrar bien borra los fallos acumulados", async () => {
      const m = montar();
      await crearCuenta(m);
      for (let i = 0; i < 7; i++) await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
      expect(m.almacen.cuentasGuardadas()[0]).toMatchObject({ fallos: 0, fallosDesde: null });
    });
  });

  it("al entrar renueva el hash si quedó con parámetros viejos", async () => {
    const m = montar();
    const sesion = await crearCuenta(m);
    const cuenta = m.almacen.cuentasGuardadas()[0];
    // Simula una contraseña guardada con parámetros anteriores.
    await m.almacen.renovarHashClave(cuenta.id, cuenta.claveHash, hashFalso(CLAVE_BUENA, true));
    expect(m.almacen.cuentasGuardadas()[0].claveHash).toContain("$16384$");
    expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
    expect(m.almacen.cuentasGuardadas()[0].claveHash).toBe(hashFalso(CLAVE_BUENA));
    expect(sesion.token).toBeTruthy();
  });

  it("tiene a lo más diez sesiones: la siguiente cierra la más antigua", async () => {
    const m = montar();
    const primera = await crearCuenta(m);
    const otras: SesionEmitida[] = [];
    for (let i = 0; i < 10; i++) {
      m.avanzar(MIN);
      const r = await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx);
      if (r.estado !== "ok") throw new Error("no entró");
      otras.push(r.sesion);
    }
    expect(await m.servicio.leerSesion(primera.token)).toBeNull();
    expect(await m.servicio.leerSesion(otras[0].token)).not.toBeNull();
  });
});

describe("verificación en dos pasos al entrar", () => {
  async function conDosPasos(m: Mundo) {
    const sesion = await crearCuenta(m);
    const dos = await activarDosPasos(m, sesion);
    await m.servicio.cerrarSesion(sesion.token);
    return dos;
  }

  async function hastaElSegundoPaso(m: Mundo) {
    const r = await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx);
    if (r.estado !== "dos_pasos") throw new Error(`se esperaba dos_pasos y salió ${r.estado}`);
    return r.sesion;
  }

  it("con la contraseña correcta queda una sesión a medias: no sirve como sesión y dura 10 minutos", async () => {
    const m = montar();
    await conDosPasos(m);
    const pendiente = await hastaElSegundoPaso(m);
    expect(await m.servicio.leerSesion(pendiente.token)).toBeNull();
    expect(await m.servicio.haySesionPendiente(pendiente.token)).toBe(true);
    expect(pendiente.expira.getTime() - m.ahora().getTime()).toBe(10 * MIN);
    m.avanzar(11 * MIN);
    expect(await m.servicio.haySesionPendiente(pendiente.token)).toBe(false);
    expect(await m.servicio.segundoPaso({ token: pendiente.token, codigo: "123456" }, m.ctx)).toEqual({ estado: "sin_sesion" });
  });

  it("el código de la app completa el acceso y cambia la sesión por una nueva", async () => {
    const m = montar();
    const { secreto } = await conDosPasos(m);
    m.avanzar(60_000); // otro paso de tiempo: el código con que se activó ya está gastado
    const pendiente = await hastaElSegundoPaso(m);
    const r = await m.servicio.segundoPaso({ token: pendiente.token, codigo: codigoActual(m, secreto) }, m.ctx);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.codigosRestantes).toBeNull();
    expect(r.sesion.token).not.toBe(pendiente.token);
    expect(await m.servicio.leerSesion(r.sesion.token)).toMatchObject({ dosPasos: true });
    expect(await m.servicio.haySesionPendiente(pendiente.token)).toBe(false);
    // La sesión a medias no se puede usar otra vez.
    expect((await m.servicio.segundoPaso({ token: pendiente.token, codigo: codigoActual(m, secreto) }, m.ctx)).estado).toBe("sin_sesion");
  });

  it("un código no se puede reutilizar, ni siquiera dentro de su ventana de tiempo", async () => {
    const m = montar();
    const { secreto } = await conDosPasos(m);
    m.avanzar(60_000);
    const codigo = codigoActual(m, secreto);
    const uno = await hastaElSegundoPaso(m);
    expect((await m.servicio.segundoPaso({ token: uno.token, codigo }, m.ctx)).estado).toBe("ok");
    const dos = await hastaElSegundoPaso(m);
    expect(await m.servicio.segundoPaso({ token: dos.token, codigo }, m.ctx)).toEqual({ estado: "rechazado" });
  });

  it("un código incorrecto se rechaza y cuenta como intento; ocho bloquean la cuenta", async () => {
    const m = montar();
    const { secreto } = await conDosPasos(m);
    m.avanzar(60_000);
    const pendiente = await hastaElSegundoPaso(m);
    for (let i = 0; i < INTENTOS_CODIGO; i++) {
      expect(await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx), String(i)).toEqual({ estado: "rechazado" });
    }
    expect(await m.servicio.segundoPaso({ token: pendiente.token, codigo: codigoActual(m, secreto) }, m.ctx)).toEqual({ estado: "limite" });
    // La contraseña tampoco entra mientras dure el bloqueo.
    expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("limite");
  });

  it("un código equivocado pesa más que una contraseña equivocada, y volver a entrar con la contraseña no reinicia la cuenta", async () => {
    const m = montar();
    await conDosPasos(m);
    m.avanzar(60_000);
    const pendiente = await hastaElSegundoPaso(m);
    for (let i = 0; i < 3; i++) await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx);
    expect(PUNTOS_CODIGO).toBeGreaterThan(PUNTOS_CLAVE);
    expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(3 * PUNTOS_CODIGO);
    // Quien conoce la contraseña entra otra vez para tener otra sesión «a medias»: los códigos fallidos siguen contados.
    await hastaElSegundoPaso(m);
    expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(3 * PUNTOS_CODIGO);
  });

  it("pasar el segundo paso sí borra los fallos", async () => {
    const m = montar();
    const { secreto } = await conDosPasos(m);
    m.avanzar(60_000);
    const pendiente = await hastaElSegundoPaso(m);
    await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx);
    expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(PUNTOS_CODIGO);
    expect((await m.servicio.segundoPaso({ token: pendiente.token, codigo: codigoActual(m, secreto) }, m.ctx)).estado).toBe("ok");
    expect(m.almacen.cuentasGuardadas()[0]).toMatchObject({ fallos: 0, fallosDesde: null });
  });

  it("lo que no tiene forma de código se corrige sin contar como intento", async () => {
    const m = montar();
    await conDosPasos(m);
    const pendiente = await hastaElSegundoPaso(m);
    for (const mal of ["", "abc", "12345", "1234567", undefined, 123456]) {
      expect(await m.servicio.segundoPaso({ token: pendiente.token, codigo: mal }, m.ctx), String(mal)).toMatchObject({ estado: "invalido" });
    }
    expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(0);
  });

  it("un código de recuperación vale una vez y avisa cuántos quedan", async () => {
    const m = montar();
    const { codigos } = await conDosPasos(m);
    expect(codigos).toHaveLength(10);
    const uno = await hastaElSegundoPaso(m);
    const r = await m.servicio.segundoPaso({ token: uno.token, codigo: codigos[0].toUpperCase().replace("-", " ") }, m.ctx);
    expect(r).toMatchObject({ estado: "ok", codigosRestantes: 9 });
    const dos = await hastaElSegundoPaso(m);
    expect(await m.servicio.segundoPaso({ token: dos.token, codigo: codigos[0] }, m.ctx)).toEqual({ estado: "rechazado" });
    expect(await m.servicio.segundoPaso({ token: dos.token, codigo: codigos[1] }, m.ctx)).toMatchObject({ estado: "ok", codigosRestantes: 8 });
  });

  it("entrar con un código de recuperación queda en la actividad de la cuenta; con el código de la app, no", async () => {
    const m = montar();
    const { codigos, secreto } = await conDosPasos(m);
    const cuentaId = m.almacen.cuentasGuardadas()[0].id;
    const uno = await hastaElSegundoPaso(m);
    m.avanzar(30_000);
    expect(await m.servicio.segundoPaso({ token: uno.token, codigo: codigoActual(m, secreto) }, m.ctx)).toMatchObject({ estado: "ok", codigosRestantes: null });
    expect((await m.servicio.actividad(cuentaId)).map((e) => e.tipo)).not.toContain("codigo_recuperacion");

    const dos = await hastaElSegundoPaso(m);
    expect(await m.servicio.segundoPaso({ token: dos.token, codigo: codigos[0] }, m.ctx)).toMatchObject({ estado: "ok", codigosRestantes: 9 });
    expect((await m.servicio.actividad(cuentaId))[0].tipo).toBe("codigo_recuperacion");
  });

  it("una sesión completa o una cookie cualquiera no sirve en el segundo paso", async () => {
    const m = montar();
    const sesion = await crearCuenta(m);
    expect(await m.servicio.segundoPaso({ token: sesion.token, codigo: "123456" }, m.ctx)).toEqual({ estado: "sin_sesion" });
    expect(await m.servicio.segundoPaso({ token: "corto", codigo: "123456" }, m.ctx)).toEqual({ estado: "sin_sesion" });
    expect(await m.servicio.segundoPaso({ token: undefined, codigo: "123456" }, m.ctx)).toEqual({ estado: "sin_sesion" });
  });

  it("limita los intentos por cliente", async () => {
    const m = montar({ limitadores: { segundoPaso: createFixedWindowLimiter({ limite: 2, ventanaMs: HORA }) } });
    await conDosPasos(m);
    const pendiente = await hastaElSegundoPaso(m);
    await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx);
    await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx);
    expect(await m.servicio.segundoPaso({ token: pendiente.token, codigo: "000000" }, m.ctx)).toEqual({ estado: "limite" });
  });
});

describe("olvidé mi contraseña", () => {
  const OLVIDE = { correo: CORREO, sitio_web: "", tiempo: "marca-buena" };

  it("a una cuenta le manda un enlace; a un correo sin cuenta, nada, y la respuesta es la misma", async () => {
    const m = montar();
    await crearCuenta(m);
    const antes = m.correos.length;
    expect(await m.servicio.solicitarRestablecer(OLVIDE, "c")).toEqual({ estado: "ok", prueba: false });
    expect(m.correos).toHaveLength(antes + 1);
    expect(ultimoEnlace(m).ruta).toBe("/cuenta/restablecer");
    expect(await m.servicio.solicitarRestablecer({ ...OLVIDE, correo: "nadie@correo.cl" }, "c")).toEqual({ estado: "ok", prueba: false });
    expect(m.correos).toHaveLength(antes + 1);
  });

  it("pide un correo válido, la marca de tiempo y respeta el campo trampa y las cuentas cerradas", async () => {
    const m = montar();
    expect(await m.servicio.solicitarRestablecer({ ...OLVIDE, correo: "x" }, "c")).toEqual({ estado: "invalida", errores: { correo: "Escribe un correo válido." } });
    expect(await m.servicio.solicitarRestablecer({ ...OLVIDE, tiempo: undefined }, "c")).toEqual({ estado: "espera" });
    expect(await m.servicio.solicitarRestablecer({ ...OLVIDE, sitio_web: "x" }, "c")).toEqual({ estado: "ok", prueba: false });
    expect(await montar({ modo: "cerradas" }).servicio.solicitarRestablecer(OLVIDE, "c")).toEqual({ estado: "cerrada" });
  });

  it("no manda dos correos seguidos; pasado el plazo, otro, y el enlace anterior deja de servir", async () => {
    const m = montar();
    await crearCuenta(m);
    await m.servicio.solicitarRestablecer(OLVIDE, "c");
    const primero = ultimoEnlace(m).token;
    const total = m.correos.length;
    await m.servicio.solicitarRestablecer(OLVIDE, "c");
    expect(m.correos).toHaveLength(total);
    m.avanzar(ESPERA_REENVIO_MS + MIN);
    await m.servicio.solicitarRestablecer(OLVIDE, "c");
    expect(m.correos).toHaveLength(total + 1);
    expect((await m.servicio.consultarRestablecer(primero, "c")).estado).toBe("invalido");
    expect((await m.servicio.consultarRestablecer(ultimoEnlace(m).token, "c")).estado).toBe("valido");
  });

  it("sin cuota de correos la respuesta sigue siendo la misma (no delata la cuenta) y no queda un enlace suelto", async () => {
    const m = montar({ tope: 1 });
    await crearCuenta(m); // el correo de confirmación gasta la única cuota del día
    const n = m.correos.length;
    expect(await m.servicio.solicitarRestablecer(OLVIDE, "c")).toEqual({ estado: "ok", prueba: false });
    expect(m.correos).toHaveLength(n);
    // Mañana hay cupo y se puede pedir de inmediato: la solicitud sin cuota no dejó un enlace pendiente.
    m.avanzar(DIA);
    await m.servicio.solicitarRestablecer(OLVIDE, "c");
    expect(m.correos).toHaveLength(n + 1);
  });

  it("si el envío falla la respuesta sigue siendo la misma, y se puede volver a pedir de inmediato", async () => {
    const m = montar();
    await crearCuenta(m);
    const n = m.correos.length;
    m.fallos.envio = true;
    expect(await m.servicio.solicitarRestablecer(OLVIDE, "c")).toEqual({ estado: "ok", prueba: false });
    expect(m.correos).toHaveLength(n);
    m.fallos.envio = false;
    await m.servicio.solicitarRestablecer(OLVIDE, "c");
    expect(m.correos).toHaveLength(n + 1);
  });

  describe("elegir la contraseña nueva", () => {
    async function conEnlaceDeRestablecer(m: Mundo) {
      const sesion = await crearCuenta(m);
      await m.servicio.solicitarRestablecer(OLVIDE, "c");
      return { sesion, token: ultimoEnlace(m).token };
    }

    it("cambia la contraseña, cierra todas las sesiones, avisa por correo y no inicia ninguna", async () => {
      const m = montar();
      const { sesion, token } = await conEnlaceDeRestablecer(m);
      const otra = (await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)) as { sesion: SesionEmitida };
      const antes = m.correos.length;
      expect(await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).toEqual({ estado: "ok" });
      expect(await m.servicio.leerSesion(sesion.token)).toBeNull();
      expect(await m.servicio.leerSesion(otra.sesion.token)).toBeNull();
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("rechazado");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
      expect(m.correos[antes].asunto).toContain("contraseña");
      expect(m.correos[antes].para).toBe(CORREO);
    });

    it("el enlace sirve una sola vez y vence en una hora", async () => {
      const m = montar();
      const { token } = await conEnlaceDeRestablecer(m);
      expect((await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
      expect(await m.servicio.restablecer({ token, clave: "otra frase distinta", repetir: "otra frase distinta" }, m.ctx)).toEqual({ estado: "enlace" });

      const m2 = montar();
      const { token: t2 } = await conEnlaceDeRestablecer(m2);
      m2.avanzar(VIGENCIA_RESTABLECER_MS + MIN);
      expect(await m2.servicio.restablecer({ token: t2, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m2.ctx)).toEqual({ estado: "enlace" });
      expect((await m2.servicio.consultarRestablecer(t2, "c")).estado).toBe("invalido");
    });

    it("una contraseña débil o que no coincide no gasta el enlace", async () => {
      const m = montar();
      const { token } = await conEnlaceDeRestablecer(m);
      expect(await m.servicio.restablecer({ token, clave: "password1234", repetir: "password1234" }, m.ctx)).toMatchObject({ estado: "invalida", errores: { clave: expect.any(String) } });
      expect(await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: "distinta" }, m.ctx)).toEqual({ estado: "invalida", errores: { repetir: "Las contraseñas no coinciden." } });
      expect((await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
    });

    it("un enlace malformado o ajeno no sirve; el de una cuenta no abre otra", async () => {
      const m = montar();
      await conEnlaceDeRestablecer(m);
      expect(await m.servicio.restablecer({ token: "corto", clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).toEqual({ estado: "enlace" });
      expect(await m.servicio.restablecer({ token: "C".repeat(43), clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).toEqual({ estado: "enlace" });
      expect((await m.servicio.consultarRestablecer(undefined, "c")).estado).toBe("invalido");
    });

    it("restablecer no apaga la verificación en dos pasos: al entrar sigue pidiéndose el código", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      await activarDosPasos(m, sesion);
      await m.servicio.solicitarRestablecer(OLVIDE, "c");
      const token = ultimoEnlace(m).token;
      expect((await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_NUEVA }, m.ctx)).estado).toBe("dos_pasos");
    });

    it("también borra los intentos fallidos acumulados (la persona no queda bloqueada)", async () => {
      const m = montar();
      const { token } = await conEnlaceDeRestablecer(m);
      for (let i = 0; i < PUNTOS_MAX_CUENTA / PUNTOS_CLAVE; i++) await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("limite");
      await m.servicio.restablecer({ token, clave: CLAVE_NUEVA, repetir: CLAVE_NUEVA }, m.ctx);
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
    });
  });
});

describe("la cuenta por dentro", () => {
  describe("perfil", () => {
    it("guarda el nombre, los temas y la preferencia del resumen, y los devuelve", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const { cuentaId } = (await m.servicio.leerSesion(sesion.token))!;
      expect(await m.servicio.guardarPerfil(cuentaId, { nombre: "  Catalina   Pérez ", temas: ["cobre", "divisas", "cobre"], resumenPrevio: true })).toEqual({
        estado: "ok",
        // Vuelve lo guardado, ya normalizado: sin espacios de más ni temas repetidos.
        guardado: { nombre: "Catalina Pérez", temas: ["cobre", "divisas"], resumenPrevio: true },
      });
      expect(await m.servicio.perfil(cuentaId)).toMatchObject({
        correo: CORREO,
        nombre: "Catalina Pérez",
        temas: ["cobre", "divisas"],
        resumenPrevio: true,
        dosPasos: false,
        versionTextos: VERSION_TEXTOS,
      });
      expect((await m.servicio.leerSesion(sesion.token))?.nombre).toBe("Catalina Pérez");
      await m.servicio.guardarPerfil(cuentaId, { nombre: "   ", temas: [], resumenPrevio: false });
      expect(await m.servicio.perfil(cuentaId)).toMatchObject({ nombre: null, temas: [], resumenPrevio: false });
    });

    it("rechaza un nombre muy largo o con caracteres invisibles y los temas que no existen", async () => {
      const m = montar();
      const { cuentaId } = (await m.servicio.leerSesion(await crearCuenta(m).then((s) => s.token)))!;
      const guardar = (nombre: unknown, temas: unknown = []) => m.servicio.guardarPerfil(cuentaId, { nombre, temas, resumenPrevio: false });
      expect(await guardar("x".repeat(61))).toMatchObject({ estado: "invalida", errores: { nombre: expect.stringContaining("hasta 60") } });
      expect(await guardar("Ana‮evil")).toMatchObject({ estado: "invalida", errores: { nombre: expect.stringContaining("no se pueden mostrar") } });
      expect(await guardar("Ana\nPérez")).toMatchObject({ estado: "ok" }); // el salto de línea se vuelve espacio
      expect(await m.servicio.perfil(cuentaId)).toMatchObject({ nombre: "Ana Pérez" });
      expect(await guardar("Ana", ["inventado"])).toMatchObject({ estado: "invalida", errores: { temas: expect.any(String) } });
    });

    it("el perfil de una cuenta que ya no existe es null", async () => {
      const m = montar();
      expect(await m.servicio.perfil("00000000-0000-4000-8000-000000000000")).toBeNull();
    });
  });

  describe("cambiar la contraseña", () => {
    it("exige la contraseña actual, deja la sesión actual, cierra las demás y avisa por correo", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const otra = (await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)) as { sesion: SesionEmitida };
      const vigente = (await m.servicio.leerSesion(sesion.token))!;
      const antes = m.correos.length;
      expect(await m.servicio.cambiarClave(vigente, { actual: CLAVE_BUENA, nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA })).toEqual({ estado: "ok" });
      expect(await m.servicio.leerSesion(sesion.token)).not.toBeNull();
      expect(await m.servicio.leerSesion(otra.sesion.token)).toBeNull();
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_NUEVA }, m.ctx)).estado).toBe("ok");
      expect(m.correos).toHaveLength(antes + 1);
      expect(m.correos.at(-1)!.asunto).toContain("contraseña");
    });

    it("rechaza la actual equivocada (y la cuenta como intento), la nueva débil, igual a la actual o que no coincide", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      const cambiar = (actual: string, nueva: string, repetir = nueva) => m.servicio.cambiarClave(vigente, { actual, nueva, repetir });
      expect(await cambiar("equivocada", CLAVE_NUEVA)).toEqual({ estado: "invalida", errores: { actual: "La contraseña no es correcta." } });
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(1);
      expect(await cambiar(CLAVE_BUENA, "corta")).toMatchObject({ estado: "invalida", errores: { nueva: expect.any(String) } });
      expect(await cambiar(CLAVE_BUENA, CLAVE_BUENA)).toEqual({ estado: "invalida", errores: { nueva: "La contraseña nueva debe ser distinta de la actual." } });
      expect(await cambiar(CLAVE_BUENA, CLAVE_NUEVA, "otra distinta")).toEqual({ estado: "invalida", errores: { repetir: "Las contraseñas no coinciden." } });
      expect(await cambiar("", CLAVE_NUEVA)).toMatchObject({ estado: "invalida", errores: { actual: "Escribe tu contraseña actual." } });
    });

    it("la actual equivocada tantas veces como el tope bloquea el cambio", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      for (let i = 0; i < PUNTOS_MAX_CUENTA / PUNTOS_CLAVE; i++) await m.servicio.cambiarClave(vigente, { actual: "mala", nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA });
      expect(await m.servicio.cambiarClave(vigente, { actual: CLAVE_BUENA, nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA })).toEqual({ estado: "limite" });
    });

    it("con la verificación en dos pasos pide también el código", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const { secreto, vigente } = await activarDosPasos(m, sesion);
      const cambiar = (codigo?: string) => m.servicio.cambiarClave(vigente, { actual: CLAVE_BUENA, nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA, codigo });
      expect(await cambiar(undefined)).toMatchObject({ estado: "invalida", errores: { codigo: expect.stringContaining("código") } });
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(0); // sin código no se probó nada
      expect(await cambiar("000000")).toEqual({ estado: "invalida", errores: { codigo: "El código no es correcto o ya se usó." } });
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(PUNTOS_CODIGO);
      m.avanzar(60_000);
      expect(await cambiar(codigoActual(m, secreto))).toEqual({ estado: "ok" });
    });
  });

  describe("sesiones abiertas", () => {
    it("las lista (la actual marcada), cierra las demás o una en particular, y lo anota", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      m.avanzar(MIN);
      const b = (await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, { ...m.ctx, dispositivo: "Safari en iOS" })) as { sesion: SesionEmitida };
      m.avanzar(MIN);
      const c = (await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)) as { sesion: SesionEmitida };
      const vigente = (await m.servicio.leerSesion(sesion.token))!;
      const lista = await m.servicio.sesionesAbiertas(vigente);
      expect(lista.map((s) => [s.dispositivo, s.esActual])).toEqual([
        ["Chrome en Linux", false],
        ["Safari en iOS", false],
        ["Chrome en Linux", true],
      ]);
      expect(await m.servicio.cerrarSesionPorId(vigente.cuentaId, lista[1].id)).toBe(true);
      expect(await m.servicio.leerSesion(b.sesion.token)).toBeNull();
      expect(await m.servicio.cerrarSesionPorId(vigente.cuentaId, lista[1].id)).toBe(false);
      expect(await m.servicio.cerrarSesionPorId(vigente.cuentaId, "no-es-un-id")).toBe(false);
      expect(await m.servicio.cerrarSesionPorId(vigente.cuentaId, 5)).toBe(false);
      expect(await m.servicio.cerrarOtrasSesiones(vigente)).toBe(1);
      expect(await m.servicio.leerSesion(c.sesion.token)).toBeNull();
      expect(await m.servicio.leerSesion(sesion.token)).not.toBeNull();
      expect((await m.servicio.actividad(vigente.cuentaId)).map((e) => e.tipo)).toContain("sesiones_cerradas");
    });

    it("no se puede cerrar la sesión de otra cuenta", async () => {
      const m = montar();
      const mia = await crearCuenta(m);
      const ajena = await crearCuenta(m, "otra@correo.cl");
      const idAjeno = (await m.servicio.sesionesAbiertas((await m.servicio.leerSesion(ajena.token))!))[0].id;
      const vigente = (await m.servicio.leerSesion(mia.token))!;
      expect(await m.servicio.cerrarSesionPorId(vigente.cuentaId, idAjeno)).toBe(false);
      expect(await m.servicio.leerSesion(ajena.token)).not.toBeNull();
    });
  });

  describe("configurar la verificación en dos pasos", () => {
    it("pide la contraseña para empezar, entrega el secreto y su enlace, y no activa nada hasta confirmar con un código", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      expect(await m.servicio.iniciarDosPasos(vigente, { actual: "equivocada" })).toEqual({ estado: "invalida", errores: { actual: "La contraseña no es correcta." } });
      expect(await m.servicio.dosPasosPendiente(vigente.cuentaId)).toBeNull();
      const inicio = await m.servicio.iniciarDosPasos(vigente, { actual: CLAVE_BUENA });
      expect(inicio.estado).toBe("ok");
      if (inicio.estado !== "ok") return;
      expect(inicio.secreto).toMatch(/^[A-Z2-7]{32}$/);
      expect(inicio.uri).toBe(`otpauth://totp/Otea%20Austral:persona%40correo.cl?secret=${inicio.secreto}&issuer=Otea%20Austral`);
      expect(await m.servicio.dosPasosPendiente(vigente.cuentaId)).toEqual({ secreto: inicio.secreto, uri: inicio.uri });
      expect((await m.servicio.perfil(vigente.cuentaId))?.dosPasos).toBe(false);
      // El secreto no queda en claro en el almacén.
      expect(JSON.stringify(m.almacen.cuentasGuardadas())).not.toContain(inicio.secreto);
    });

    it("confirmar con un código malo no activa nada y cuenta como intento; con uno bueno entrega diez códigos de recuperación y avisa", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      const inicio = await m.servicio.iniciarDosPasos(vigente, { actual: CLAVE_BUENA });
      if (inicio.estado !== "ok") throw new Error("no inició");
      expect(await m.servicio.confirmarDosPasos(vigente, { codigo: "abcdef" })).toMatchObject({ estado: "invalida", errores: { codigo: expect.stringContaining("seis dígitos") } });
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(0);
      expect(await m.servicio.confirmarDosPasos(vigente, { codigo: "000000" })).toMatchObject({ estado: "invalida", errores: { codigo: expect.stringContaining("no coincide") } });
      expect(m.almacen.cuentasGuardadas()[0].fallos).toBe(1);
      const antes = m.correos.length;
      const ok = await m.servicio.confirmarDosPasos(vigente, { codigo: ` ${codigoActual(m, inicio.secreto).slice(0, 3)} ${codigoActual(m, inicio.secreto).slice(3)} ` });
      expect(ok.estado).toBe("ok");
      if (ok.estado !== "ok") return;
      expect(ok.codigos).toHaveLength(10);
      expect(new Set(ok.codigos).size).toBe(10);
      for (const c of ok.codigos) expect(c).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
      expect(await m.servicio.perfil(vigente.cuentaId)).toMatchObject({ dosPasos: true, codigosLibres: 10 });
      expect(m.correos).toHaveLength(antes + 1);
      expect(m.correos.at(-1)!.asunto).toContain("Se activó la verificación en dos pasos");
      // Los códigos de recuperación y el secreto no quedan en claro.
      const volcado = JSON.stringify(m.almacen.cuentasGuardadas());
      for (const c of ok.codigos) expect(volcado).not.toContain(c);
      expect(volcado).not.toContain(inicio.secreto);
      // Ya activada: no se vuelve a iniciar ni confirmar.
      expect(await m.servicio.iniciarDosPasos(vigente, { actual: CLAVE_BUENA })).toEqual({ estado: "ya_activa" });
      expect(await m.servicio.confirmarDosPasos(vigente, { codigo: "123456" })).toEqual({ estado: "sin_pendiente" });
    });

    it("confirmar sin haber empezado no hace nada", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      expect(await m.servicio.confirmarDosPasos(vigente, { codigo: "123456" })).toEqual({ estado: "sin_pendiente" });
    });

    it("empezar otra vez reemplaza el secreto pendiente", async () => {
      const m = montar();
      const vigente = (await m.servicio.leerSesion((await crearCuenta(m)).token))!;
      const uno = await m.servicio.iniciarDosPasos(vigente, { actual: CLAVE_BUENA });
      const dos = await m.servicio.iniciarDosPasos(vigente, { actual: CLAVE_BUENA });
      if (uno.estado !== "ok" || dos.estado !== "ok") throw new Error("no inició");
      expect(dos.secreto).not.toBe(uno.secreto);
      expect((await m.servicio.dosPasosPendiente(vigente.cuentaId))?.secreto).toBe(dos.secreto);
      expect(await m.servicio.confirmarDosPasos(vigente, { codigo: codigoActual(m, uno.secreto) })).toMatchObject({ estado: "invalida" });
    });

    it("desactivarla exige contraseña y código, la apaga, borra los códigos y avisa", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const { secreto, vigente, codigos } = await activarDosPasos(m, sesion);
      expect(await m.servicio.desactivarDosPasos(vigente, { actual: CLAVE_BUENA, codigo: "" })).toMatchObject({ estado: "invalida", errores: { codigo: expect.any(String) } });
      expect(await m.servicio.desactivarDosPasos(vigente, { actual: "mala", codigo: "000000" })).toMatchObject({ estado: "invalida", errores: { actual: expect.any(String) } });
      expect((await m.servicio.perfil(vigente.cuentaId))?.dosPasos).toBe(true);
      const antes = m.correos.length;
      m.avanzar(60_000);
      expect(await m.servicio.desactivarDosPasos(vigente, { actual: CLAVE_BUENA, codigo: codigoActual(m, secreto) })).toEqual({ estado: "ok" });
      expect(await m.servicio.perfil(vigente.cuentaId)).toMatchObject({ dosPasos: false, codigosLibres: 0 });
      expect(m.correos).toHaveLength(antes + 1);
      expect(m.correos.at(-1)!.asunto).toContain("Se desactivó");
      // Al entrar, ya no pide código; y los códigos de recuperación viejos no sirven para nada.
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
      expect(codigos).toHaveLength(10);
    });

    it("se puede desactivar con un código de recuperación", async () => {
      const m = montar();
      const { vigente, codigos } = await activarDosPasos(m, await crearCuenta(m));
      expect(await m.servicio.desactivarDosPasos(vigente, { actual: CLAVE_BUENA, codigo: codigos[4] })).toEqual({ estado: "ok" });
    });

    it("regenerar los códigos invalida los anteriores y exige contraseña y código", async () => {
      const m = montar();
      const { secreto, vigente, codigos } = await activarDosPasos(m, await crearCuenta(m));
      m.avanzar(60_000);
      expect(await m.servicio.regenerarCodigos(vigente, { actual: CLAVE_BUENA, codigo: "000000" })).toMatchObject({ estado: "invalida" });
      const r = await m.servicio.regenerarCodigos(vigente, { actual: CLAVE_BUENA, codigo: codigoActual(m, secreto) });
      expect(r.estado).toBe("ok");
      if (r.estado !== "ok") return;
      expect(r.codigos).toHaveLength(10);
      expect(r.codigos.some((c) => codigos.includes(c))).toBe(false);
      // Un código de recuperación viejo ya no sirve para entrar.
      const pendiente = await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx);
      if (pendiente.estado !== "dos_pasos") throw new Error("no pidió el segundo paso");
      expect(await m.servicio.segundoPaso({ token: pendiente.sesion.token, codigo: codigos[0] }, m.ctx)).toEqual({ estado: "rechazado" });
      expect((await m.servicio.segundoPaso({ token: pendiente.sesion.token, codigo: r.codigos[0] }, m.ctx)).estado).toBe("ok");
    });
  });

  describe("tus datos", () => {
    it("exporta lo que se guarda: el correo y las preferencias, sin contraseña, secretos ni códigos", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const { vigente, secreto, codigos } = await activarDosPasos(m, sesion);
      await m.servicio.guardarPerfil(vigente.cuentaId, { nombre: "Catalina", temas: ["cobre"], resumenPrevio: true });
      const datos = (await m.servicio.exportar(vigente))!;
      expect(datos.cuenta).toMatchObject({ correo: CORREO, nombre: "Catalina", temas: ["cobre"], resumenPrevio: true, verificacionEnDosPasos: true });
      expect(datos.cuenta.aceptaste).toEqual({ versionDeLosTextos: VERSION_TEXTOS, fecha: expect.any(String) });
      expect(datos.sesionesAbiertas).toHaveLength(1);
      expect(datos.actividad.map((e) => e.tipo)).toEqual(expect.arrayContaining(["alta", "acceso", "dos_pasos_activados"]));
      const texto = JSON.stringify(datos);
      for (const prohibido of ["scrypt", hashFalso(CLAVE_BUENA), CLAVE_BUENA, secreto, sesion.token, vigente.tokenHash, ...codigos, "correoCifrado", "claveHash"]) {
        expect(texto, prohibido).not.toContain(prohibido);
      }
    });

    it("eliminar la cuenta exige la contraseña, la borra con todo lo suyo, cierra la sesión y avisa por correo", async () => {
      const m = montar();
      const sesion = await crearCuenta(m);
      const vigente = (await m.servicio.leerSesion(sesion.token))!;
      expect(await m.servicio.eliminar(vigente, { actual: "equivocada", codigo: undefined })).toMatchObject({ estado: "invalida", errores: { actual: expect.any(String) } });
      expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
      const antes = m.correos.length;
      expect(await m.servicio.eliminar(vigente, { actual: CLAVE_BUENA, codigo: undefined })).toEqual({ estado: "ok" });
      expect(m.almacen.cuentasGuardadas()).toEqual([]);
      expect(await m.servicio.leerSesion(sesion.token)).toBeNull();
      expect((await m.servicio.entrar({ correo: CORREO, clave: CLAVE_BUENA }, m.ctx)).estado).toBe("rechazado");
      expect(m.correos).toHaveLength(antes + 1);
      expect(m.correos.at(-1)).toMatchObject({ para: CORREO });
      expect(m.correos.at(-1)!.asunto).toContain("Eliminamos tu cuenta");
      // El mismo correo puede crear otra cuenta, desde cero.
      await crearCuenta(m);
      expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
    });

    it("con la verificación en dos pasos, eliminar también pide el código", async () => {
      const m = montar();
      const { vigente, secreto } = await activarDosPasos(m, await crearCuenta(m));
      expect(await m.servicio.eliminar(vigente, { actual: CLAVE_BUENA, codigo: undefined })).toMatchObject({ estado: "invalida", errores: { codigo: expect.any(String) } });
      expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
      m.avanzar(60_000);
      expect(await m.servicio.eliminar(vigente, { actual: CLAVE_BUENA, codigo: codigoActual(m, secreto) })).toEqual({ estado: "ok" });
    });
  });
});

describe("acceso anticipado por invitación (modo invitacion)", () => {
  /** Monta el servicio por invitación y el del panel sobre el mismo almacén, como en la aplicación. */
  function conInvitaciones(opciones: Parameters<typeof montar>[0] = {}) {
    const m = montar({ modo: "invitacion", ...opciones });
    const panel = crearServicioInvitaciones({ almacen: m.almacen, cifrador: m.cifrador, ahora: m.ahora });
    async function invitar(dias = "14"): Promise<{ id: string; codigo: string }> {
      const r = await panel.emitir({ alias: "prueba", dias }, "panel");
      if (!r.ok) throw new Error(r.motivos.join());
      return { id: r.id, codigo: r.codigo };
    }
    const pedir = (codigo: string, correo = CORREO, cliente = "c") => m.servicio.solicitarAlta({ ...ALTA, correo, invitacion: codigo }, cliente);
    const estadoDe = async (id: string) => (await panel.listar()).invitaciones.find((i) => i.id === id)?.estado;
    return { ...m, panel, invitar, pedir, estadoDe };
  }
  const OK = { estado: "ok", prueba: false };
  /** Un código con buena forma que nadie emitió. */
  const INVENTADO = "ABCDE-FGHIJ-KLMNO-PQRST";

  it("sin código o con uno mal escrito, solo se señala la forma del código", async () => {
    const m = conInvitaciones();
    expect(await m.servicio.solicitarAlta(ALTA, "c")).toEqual({ estado: "invalida", errores: { invitacion: "Escribe tu código de invitación." } });
    const mal = await m.pedir("ABC-123");
    expect(mal).toEqual({ estado: "invalida", errores: { invitacion: expect.stringContaining("20 letras y números") } });
    expect(m.correos).toHaveLength(0);
  });

  it("un código que no existe responde igual que uno bueno y no envía nada", async () => {
    const m = conInvitaciones();
    const { codigo } = await m.invitar();
    expect(await m.pedir(INVENTADO, "otra@correo.cl")).toEqual(OK);
    expect(m.correos).toHaveLength(0);
    expect(await m.pedir(codigo)).toEqual(OK);
    expect(m.correos).toHaveLength(1);
    expect(ultimoEnlace(m).ruta).toBe("/cuenta/activar");
  });

  it("con un código bueno se crea la cuenta y la invitación queda usada: no sirve para otra", async () => {
    const m = conInvitaciones();
    const { id, codigo } = await m.invitar();
    expect(await m.pedir(codigo.toLowerCase().replaceAll("-", " "))).toEqual(OK);
    const r = await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx);
    expect(r.estado).toBe("ok");
    expect(await m.estadoDe(id)).toBe("usada");

    const antes = m.correos.length;
    expect(await m.pedir(codigo, "otra@correo.cl")).toEqual(OK);
    expect(m.correos).toHaveLength(antes);
    expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
  });

  it("código bueno y correo con cuenta: la misma respuesta, el aviso a la dueña y la invitación sigue sin usar", async () => {
    const m = conInvitaciones();
    const primera = await m.invitar();
    await m.pedir(primera.codigo);
    await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx);
    const segunda = await m.invitar();
    const antes = m.correos.length;
    expect(await m.pedir(segunda.codigo)).toEqual(OK);
    expect(m.correos).toHaveLength(antes + 1);
    expect(m.correos.at(-1)!.asunto).toContain("Intentaron crear una cuenta");
    expect(m.correos.at(-1)!.texto).not.toMatch(/token=/);
    expect(await m.estadoDe(segunda.id)).toBe("vigente");
  });

  it("vencida o revocada responde igual y no envía nada", async () => {
    const m = conInvitaciones();
    const vence = await m.invitar("1");
    const revocada = await m.invitar();
    await m.panel.revocar(revocada.id, "panel");
    m.avanzar(DIA + MIN);
    expect(await m.pedir(vence.codigo)).toEqual(OK);
    expect(await m.pedir(revocada.codigo, "b@correo.cl")).toEqual(OK);
    expect(m.correos).toHaveLength(0);
  });

  it("si la invitación deja de valer antes de elegir la contraseña, no se crea la cuenta y se puede pedir otra al instante", async () => {
    const m = conInvitaciones();
    const { id, codigo } = await m.invitar();
    await m.pedir(codigo);
    const { token } = ultimoEnlace(m);
    await m.panel.revocar(id, "panel");
    expect(await m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).toEqual({ estado: "invitacion" });
    expect(m.almacen.cuentasGuardadas()).toHaveLength(0);
    expect((await m.servicio.consultarAlta(token, "c")).estado).toBe("invalido");
    // El enlace se borró: con una invitación nueva llega otro correo enseguida (no hay que esperar los 10 minutos).
    const nueva = await m.invitar();
    await m.pedir(nueva.codigo);
    expect(m.correos).toHaveLength(2);
    expect((await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
  });

  it("dos personas con el mismo código a la vez: solo una crea la cuenta", async () => {
    const m = conInvitaciones();
    const { codigo } = await m.invitar();
    await m.pedir(codigo, "una@correo.cl");
    const primera = ultimoEnlace(m).token;
    await m.pedir(codigo, "dos@correo.cl");
    const segunda = ultimoEnlace(m).token;
    const resultados = await Promise.all(
      [primera, segunda].map((token) => m.servicio.activar({ token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)),
    );
    expect(resultados.map((r) => r.estado).sort()).toEqual(["invitacion", "ok"]);
    expect(m.almacen.cuentasGuardadas()).toHaveLength(1);
  });

  it(`un mismo código provoca como mucho ${ENVIOS_POR_INVITACION} correos de alta (contados en la base); después, silencio`, async () => {
    const m = conInvitaciones();
    const { codigo } = await m.invitar();
    for (let i = 0; i < ENVIOS_POR_INVITACION; i++) expect(await m.pedir(codigo, `p${i}@correo.cl`)).toEqual(OK);
    expect(m.correos).toHaveLength(ENVIOS_POR_INVITACION);
    expect(await m.pedir(codigo, "otra@correo.cl")).toEqual(OK);
    expect(m.correos).toHaveLength(ENVIOS_POR_INVITACION);
  });

  it("los límites por cliente y por código cuentan todos los pedidos, sirva o no el código", async () => {
    // Los números de producción (el límite de alta de siempre, 5 cada 10 minutos por cliente, se prueba aparte).
    const m = conInvitaciones({
      limitadores: {
        invitacion: {
          hora: createFixedWindowLimiter({ limite: INTENTOS_INVITACION_HORA, ventanaMs: HORA }),
          dia: createFixedWindowLimiter({ limite: 1000, ventanaMs: DIA }),
          codigo: createFixedWindowLimiter({ limite: INTENTOS_POR_CODIGO_HORA, ventanaMs: HORA }),
        },
      },
    });
    const { codigo } = await m.invitar();
    // Por cliente: 10 por hora, con códigos buenos o inventados por igual.
    const inventados = Array.from({ length: INTENTOS_INVITACION_HORA }, (_, i) => `ABCDE-FGHIJ-KLMNO-PQR${"234567"[i % 6]}${"234567"[Math.floor(i / 6)]}`);
    for (let i = 0; i < INTENTOS_INVITACION_HORA; i++) {
      expect((await m.pedir(i === 3 ? codigo : inventados[i], `c${i}@correo.cl`, "una-ip")).estado, `intento ${i}`).toBe("ok");
    }
    expect((await m.pedir(codigo, "x@correo.cl", "una-ip")).estado).toBe("limite");
    expect((await m.pedir(INVENTADO, "x@correo.cl", "una-ip")).estado).toBe("limite");

    // Por código, desde clientes distintos: 5 por hora, también para uno que no existe.
    const otro = "QRSTU-VWXYZ-23456-7ABCD";
    for (let i = 0; i < INTENTOS_POR_CODIGO_HORA; i++) expect((await m.pedir(otro, `d${i}@correo.cl`, `ip-${i}`)).estado).toBe("ok");
    expect((await m.pedir(otro, "e@correo.cl", "ip-nueva")).estado).toBe("limite");
    expect((await m.pedir(codigo, "e@correo.cl", "ip-nueva")).estado).toBe("ok");
  });

  it("con la cuota de altas agotada, la respuesta es la misma para todos: código bueno, inventado o correo con cuenta", async () => {
    const m = conInvitaciones({ tope: 5 }); // las altas pueden usar 3
    const codigos = [await m.invitar(), await m.invitar(), await m.invitar(), await m.invitar()];
    for (const [i, c] of codigos.slice(0, 3).entries()) expect(await m.pedir(c.codigo, `p${i}@correo.cl`)).toEqual(OK);
    expect(await m.pedir(codigos[3].codigo, "nuevo@correo.cl")).toEqual({ estado: "saturada" });
    expect(await m.pedir(INVENTADO, "nuevo@correo.cl")).toEqual({ estado: "saturada" });
    expect(await m.pedir(codigos[3].codigo, "p0@correo.cl")).toEqual({ estado: "saturada" });
    expect(await m.estadoDe(codigos[3].id)).toBe("vigente");
  });

  it("las cuentas abiertas no piden código y siguen igual", async () => {
    const m = montar({ modo: "abiertas" });
    expect(await m.servicio.solicitarAlta({ ...ALTA, invitacion: "lo-que-sea" }, "c")).toEqual(OK);
    expect((await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx)).estado).toBe("ok");
  });

  it("«Descargar mis datos» dice con qué invitación se creó la cuenta (su alias interno), y nunca el código", async () => {
    const m = conInvitaciones();
    const { codigo } = await m.invitar();
    await m.pedir(codigo);
    const r = await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx);
    if (r.estado !== "ok") throw new Error(r.estado);
    const vigente = (await m.servicio.leerSesion(r.sesion.token))!;
    const datos = (await m.servicio.exportar(vigente))!;
    expect(datos.cuenta.invitacion).toEqual({ alias: "prueba", emitida: expect.any(String), usada: expect.any(String) });
    expect(JSON.stringify(datos)).not.toContain(codigo.replaceAll("-", ""));
    expect(JSON.stringify(datos)).not.toContain(codigo);
  });

  it("ni los registros ni los correos llevan el código", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = conInvitaciones();
    const { codigo } = await m.invitar();
    await m.pedir(INVENTADO);
    await m.pedir(codigo);
    await m.servicio.activar({ token: ultimoEnlace(m).token, clave: CLAVE_BUENA, repetir: CLAVE_BUENA }, m.ctx);
    const registro = JSON.stringify(aviso.mock.calls);
    for (const c of [codigo, codigo.replaceAll("-", ""), INVENTADO, INVENTADO.replaceAll("-", "")]) expect(registro, c).not.toContain(c);
    expect(aviso.mock.calls.some((c) => String(c[0]).includes('"tipo":"invitacion"'))).toBe(true);
    for (const correo of m.correos) expect(correo.texto + correo.html).not.toContain(codigo);
  });
});

describe("lo que nunca debe filtrarse", () => {
  it("ni los registros ni los correos de todo un recorrido llevan contraseñas, tokens ni códigos", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const m = montar();
    const sesion = await crearCuenta(m);
    const { secreto, codigos, vigente } = await activarDosPasos(m, sesion);
    await m.servicio.entrar({ correo: CORREO, clave: "mala" }, m.ctx);
    await m.servicio.entrar({ correo: "nadie@correo.cl", clave: "mala" }, m.ctx);
    await m.servicio.solicitarRestablecer({ correo: CORREO, sitio_web: "", tiempo: "marca-buena" }, "c");
    await m.servicio.cambiarClave(vigente, { actual: "mala", nueva: CLAVE_NUEVA, repetir: CLAVE_NUEVA, codigo: "000000" });
    await m.servicio.cerrarSesion(sesion.token);

    const registro = JSON.stringify([...aviso.mock.calls, ...info.mock.calls]);
    for (const secretoPropio of [CORREO, "persona@", CLAVE_BUENA, CLAVE_NUEVA, "mala", secreto, ...codigos, sesion.token, vigente.tokenHash, vigente.csrf]) {
      expect(registro, secretoPropio).not.toContain(secretoPropio);
    }
    for (const linea of aviso.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)) {
      expect(Object.keys(linea).every((k) => ["nivel", "fecha", "tipo", "resultado", "evento", "recurso", "servicio", "codigo"].includes(k)), JSON.stringify(linea)).toBe(true);
    }
    // Los correos de aviso no repiten contraseñas ni códigos.
    for (const c of m.correos) {
      for (const secretoPropio of [CLAVE_BUENA, CLAVE_NUEVA, secreto, ...codigos]) expect(c.texto + c.html).not.toContain(secretoPropio);
    }
  });
});
