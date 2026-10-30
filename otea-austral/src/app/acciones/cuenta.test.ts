import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { codigoTotp, decodificarBase32, pasoTotp } from "@/lib/admin/totp";
import { crearAlmacenMemoria } from "@/lib/cuentas/almacen-memoria";
import { crearCifradorCuentas } from "@/lib/cuentas/cifrado";
import { COOKIE_SESION_CUENTA } from "@/lib/cuentas/constantes";
import { crearServicioInvitaciones } from "@/lib/cuentas/invitaciones";
import { crearServicioCuentas, type ServicioCuentas } from "@/lib/cuentas/servicio";
import type { Correo } from "@/lib/correo/resend";

/**
 * Las acciones con un servicio real en memoria: lo que se prueba aquí es lo propio de la capa de Next.js (cookies, redirecciones,
 * token anti-CSRF, qué vuelve al navegador). La lógica de las cuentas se prueba a fondo en `servicio.test.ts`.
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect → ${destino}`);
  }
}

const mundo = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  fijadas: [] as { nombre: string; valor: string; opciones: Record<string, unknown> }[],
  revalidadas: [] as string[],
  servicio: null as unknown,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (mundo.cookies.has(nombre) ? { name: nombre, value: mundo.cookies.get(nombre)! } : undefined),
    set: (nombre: string, valor: string, opciones: Record<string, unknown> = {}) => {
      mundo.fijadas.push({ nombre, valor, opciones });
      if (valor === "" || opciones.maxAge === 0) mundo.cookies.delete(nombre);
      else mundo.cookies.set(nombre, valor);
    },
  }),
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (ruta: string) => mundo.revalidadas.push(ruta) }));
vi.mock("@/lib/cuentas/instancia", () => ({ servicioCuentas: () => mundo.servicio }));

import {
  activarCuentaAccion,
  cambiarClaveAccion,
  cerrarOtrasSesionesAccion,
  confirmarDosPasosAccion,
  crearCuentaAccion,
  eliminarCuentaAccion,
  entrarAccion,
  guardarPerfilAccion,
  iniciarDosPasosAccion,
  olvideAccion,
  restablecerAccion,
  salirAccion,
  seguirTemasAccion,
  verificarSegundoPasoAccion,
  type EstadoFormulario,
} from "./cuenta";

const CORREO = "persona@correo.cl";
const CLAVE = "lluvia sobre el cerro azul";
const CLAVE_2 = "tres gatos viajan en tren";
const INICIAL: EstadoFormulario = { estado: "inicial" };

const hashFalso = (c: string) => `scrypt$32768$8$3$${"A".repeat(22)}$${createHash("sha256").update(c).digest("base64url")}`;

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) for (const v of Array.isArray(valor) ? valor : [valor]) f.append(nombre, v);
  return f;
}

let correos: Correo[];
const servicio = () => mundo.servicio as ServicioCuentas;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  correos = [];
  mundo.cookies.clear();
  mundo.fijadas.length = 0;
  mundo.revalidadas.length = 0;
  mundo.servicio = crearServicioCuentas({
    modo: "abiertas",
    almacen: crearAlmacenMemoria(),
    cifrador: crearCifradorCuentas("S".repeat(43)),
    urlSitio: "https://oteaustral.com",
    enviar: async (c) => {
      correos.push(c);
    },
    clave: {
      hashear: async (c) => hashFalso(c),
      verificar: async (c, h) => h === hashFalso(c),
      necesitaRehash: () => false,
      senuelo: async () => false,
    },
    duracionMinimaMs: 0,
  });
});

/** Captura lo que hace una acción que termina en `redirect`. */
async function redirige(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof Redireccion) return e.destino;
    throw e;
  }
  throw new Error("La acción no redirigió.");
}

const tokenDelUltimoCorreo = () => new URL(/https?:\/\/\S+/.exec(correos.at(-1)!.texto)![0]).searchParams.get("token")!;

/** Crea una cuenta y deja la sesión en la cookie, como hace el navegador. Devuelve el token anti-CSRF. */
async function conCuentaIniciada(): Promise<{ csrf: string }> {
  await crearCuentaAccion(INICIAL, formulario({ correo: CORREO, condiciones: "on", privacidad: "on", sitio_web: "" }));
  const destino = await redirige(activarCuentaAccion(INICIAL, formulario({ token: tokenDelUltimoCorreo(), clave: CLAVE, repetir: CLAVE })));
  expect(destino).toBe("/cuenta?aviso=bienvenida");
  const sesion = await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA));
  return { csrf: sesion!.csrf };
}

describe("crear la cuenta", () => {
  it("el paso 1 envía el correo y no devuelve nada que no sea un aviso", async () => {
    const estado = await crearCuentaAccion(INICIAL, formulario({ correo: CORREO, condiciones: "on", privacidad: "on", sitio_web: "" }));
    expect(estado.estado).toBe("enviado");
    expect(estado.mensaje).toMatch(/Paso 1 de 2/);
    expect(correos).toHaveLength(1);
    expect(JSON.stringify(estado)).not.toContain(tokenDelUltimoCorreo());
  });

  it("si falta una casilla, vuelve el correo y las casillas marcadas, no más", async () => {
    const estado = await crearCuentaAccion(INICIAL, formulario({ correo: CORREO, condiciones: "on", sitio_web: "", tiempo: "x" }));
    expect(estado).toMatchObject({ estado: "error", errores: { privacidad: expect.any(String) }, valores: { correo: CORREO, condiciones: true, privacidad: false } });
    expect(Object.keys(estado.valores!).sort()).toEqual(["condiciones", "correo", "privacidad"]);
    expect(correos).toHaveLength(0);
  });

  it("activar con el enlace crea la sesión: cookie __Host-, HttpOnly, Secure y SameSite, y a la bienvenida", async () => {
    await conCuentaIniciada();
    const fijada = mundo.fijadas.find((c) => c.nombre === COOKIE_SESION_CUENTA)!;
    expect(fijada.nombre.startsWith("__Host-")).toBe(true);
    expect(fijada.opciones).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(fijada.opciones).not.toHaveProperty("domain");
    expect(fijada.opciones.maxAge).toBeGreaterThan(29 * 24 * 3600);
    expect(fijada.opciones.maxAge).toBeLessThanOrEqual(30 * 24 * 3600);
  });

  it("una contraseña distinta en «repetir» no crea la cuenta y no devuelve lo escrito", async () => {
    await crearCuentaAccion(INICIAL, formulario({ correo: CORREO, condiciones: "on", privacidad: "on", sitio_web: "" }));
    const estado = await activarCuentaAccion(INICIAL, formulario({ token: tokenDelUltimoCorreo(), clave: CLAVE, repetir: CLAVE_2 }));
    expect(estado).toMatchObject({ estado: "error", errores: { repetir: expect.any(String) } });
    expect(JSON.stringify(estado)).not.toContain(CLAVE);
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(false);
  });

  it("un enlace que no sirve responde con el aviso de enlace, sin detalles", async () => {
    const estado = await activarCuentaAccion(INICIAL, formulario({ token: "x".repeat(43), clave: CLAVE, repetir: CLAVE }));
    expect(estado).toMatchObject({ estado: "error", mensaje: expect.stringMatching(/enlace/i) });
  });
});

describe("crear la cuenta con invitación (acceso anticipado)", () => {
  /** Cambia el servicio por uno en modo `invitacion` sobre un almacén propio; devuelve un código emitido de verdad. */
  async function porInvitacion(): Promise<string> {
    const almacen = crearAlmacenMemoria();
    const cifrador = crearCifradorCuentas("S".repeat(43));
    mundo.servicio = crearServicioCuentas({
      modo: "invitacion",
      almacen,
      cifrador,
      urlSitio: "https://oteaustral.com",
      enviar: async (c) => {
        correos.push(c);
      },
      clave: { hashear: async (c) => hashFalso(c), verificar: async (c, h) => h === hashFalso(c), necesitaRehash: () => false, senuelo: async () => false },
      duracionMinimaMs: 0,
    });
    const r = await crearServicioInvitaciones({ almacen, cifrador }).emitir({ alias: "prueba", dias: "14" }, "panel");
    if (!r.ok) throw new Error(r.motivos.join());
    return r.codigo;
  }
  const campos = (invitacion: string, extra: Record<string, string> = {}) =>
    formulario({ correo: CORREO, condiciones: "on", privacidad: "on", sitio_web: "", invitacion, ...extra });

  it("un código bueno y uno inventado reciben exactamente la misma respuesta, que nunca trae el código", async () => {
    const codigo = await porInvitacion();
    const inventado = await crearCuentaAccion(INICIAL, campos("ABCDE-FGHIJ-KLMNO-PQRST", { correo: "otra@correo.cl" }));
    expect(correos).toHaveLength(0);
    const bueno = await crearCuentaAccion(INICIAL, campos(codigo));
    expect(correos).toHaveLength(1);
    expect(bueno).toEqual(inventado);
    expect(bueno).toMatchObject({ estado: "enviado", mensaje: expect.stringContaining("Si el código de invitación y el correo son válidos") });
    expect(JSON.stringify(bueno)).not.toContain(codigo);
  });

  it("si falta una casilla, el código no vuelve al navegador (como las contraseñas)", async () => {
    const codigo = await porInvitacion();
    const estado = await crearCuentaAccion(INICIAL, campos(codigo, { privacidad: "" }));
    expect(estado).toMatchObject({ estado: "error", errores: { privacidad: expect.any(String) } });
    expect(Object.keys(estado.valores!).sort()).toEqual(["condiciones", "correo", "privacidad"]);
    expect(JSON.stringify(estado)).not.toContain(codigo);
    expect(JSON.stringify(estado)).not.toContain(codigo.replaceAll("-", ""));
  });

  it("con la invitación ya gastada, el enlace del correo lo dice a quien lo abrió", async () => {
    const codigo = await porInvitacion();
    await crearCuentaAccion(INICIAL, campos(codigo, { correo: "una@correo.cl" }));
    const primero = tokenDelUltimoCorreo();
    await crearCuentaAccion(INICIAL, campos(codigo, { correo: "dos@correo.cl" }));
    const segundo = tokenDelUltimoCorreo();
    expect(await redirige(activarCuentaAccion(INICIAL, formulario({ token: primero, clave: CLAVE, repetir: CLAVE })))).toBe("/cuenta?aviso=bienvenida");
    const estado = await activarCuentaAccion(INICIAL, formulario({ token: segundo, clave: CLAVE, repetir: CLAVE }));
    expect(estado).toMatchObject({ estado: "error", mensaje: expect.stringContaining("Tu invitación ya no vale") });
  });
});

describe("entrar y salir", () => {
  async function conCuentaYSinSesion() {
    await conCuentaIniciada();
    await servicio().cerrarSesion(mundo.cookies.get(COOKIE_SESION_CUENTA));
    mundo.cookies.clear();
  }

  it("con la contraseña correcta fija la cookie y va a la cuenta; con una errónea, solo devuelve el correo", async () => {
    await conCuentaYSinSesion();
    const mal = await entrarAccion(INICIAL, formulario({ correo: CORREO, clave: "otra clave distinta" }));
    expect(mal).toMatchObject({ estado: "error", mensaje: "El correo o la contraseña no son correctos.", valores: { correo: CORREO } });
    expect(JSON.stringify(mal)).not.toContain("otra clave");
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(false);

    expect(await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE })))).toBe("/cuenta");
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(true);
  });

  it("tras demasiados intentos desde un lugar avisa cómo restablecer la contraseña, y dice lo mismo exista o no el correo", async () => {
    await conCuentaYSinSesion();
    const intentar = (correo: string) => entrarAccion(INICIAL, formulario({ correo, clave: "otra clave distinta" }));
    const ultimo = async (correo: string) => {
      let estado: EstadoFormulario = INICIAL;
      for (let i = 0; i < 9; i++) estado = await intentar(correo);
      return estado;
    };
    const conCuenta = await ultimo(CORREO);
    const sinCuenta = await ultimo("nadie@correo.cl");
    expect(conCuenta).toMatchObject({ estado: "error", mensaje: expect.stringMatching(/Demasiados intentos.*¿Olvidaste tu contraseña\?/), valores: { correo: CORREO } });
    expect(sinCuenta.mensaje).toBe(conCuenta.mensaje);
  });

  it("entra a donde pedía solo si es una página de la cuenta: nunca a una dirección de fuera", async () => {
    await conCuentaYSinSesion();
    expect(await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE, siguiente: "/cuenta/seguridad" })))).toBe("/cuenta/seguridad");
    for (const siguiente of ["https://malo.example/", "//malo.example", "/admin", "/cuenta/../admin", "javascript:alert(1)"]) {
      mundo.cookies.clear();
      expect(await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE, siguiente })))).toBe("/cuenta");
    }
  });

  it("entrar de nuevo cierra la sesión anterior de ese navegador", async () => {
    await conCuentaYSinSesion();
    await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE })));
    const primera = mundo.cookies.get(COOKIE_SESION_CUENTA)!;
    await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE })));
    expect(mundo.cookies.get(COOKIE_SESION_CUENTA)).not.toBe(primera);
    expect(await servicio().leerSesion(primera)).toBeNull();
  });

  it("«Salir» revoca la sesión en el servidor y borra la cookie; con un token anti-CSRF ajeno no hace nada", async () => {
    const { csrf } = await conCuentaIniciada();
    const token = mundo.cookies.get(COOKIE_SESION_CUENTA)!;

    expect(await redirige(salirAccion(formulario({ csrf: "falso" })))).toBe("/cuenta");
    expect(await servicio().leerSesion(token)).not.toBeNull();

    expect(await redirige(salirAccion(formulario({ csrf })))).toBe("/cuenta/entrar?aviso=salida");
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(false);
    expect(await servicio().leerSesion(token)).toBeNull();
  });

  it("sin sesión, «Salir» manda a entrar", async () => {
    expect(await redirige(salirAccion(formulario({ csrf: "x" })))).toBe("/cuenta/entrar");
  });
});

describe("lo que se hace con la sesión iniciada", () => {
  it("sin sesión, toda acción redirige al formulario de entrada y no hace nada", async () => {
    const f = formulario({ csrf: "x", nombre: "Ana", actual: CLAVE, nueva: CLAVE_2, repetir: CLAVE_2, codigo: "123456", confirmar: "on" });
    for (const accion of [guardarPerfilAccion, seguirTemasAccion, cambiarClaveAccion, iniciarDosPasosAccion, confirmarDosPasosAccion, cerrarOtrasSesionesAccion, eliminarCuentaAccion]) {
      expect(await redirige(accion(INICIAL, f)), accion.name).toBe("/cuenta/entrar");
    }
  });

  it("con sesión pero sin el token anti-CSRF correcto, ninguna acción cambia nada", async () => {
    await conCuentaIniciada();
    const mal = formulario({ csrf: "falso", nombre: "Ana", actual: CLAVE, nueva: CLAVE_2, repetir: CLAVE_2, confirmar: "on" });
    for (const accion of [guardarPerfilAccion, seguirTemasAccion, cambiarClaveAccion, iniciarDosPasosAccion, cerrarOtrasSesionesAccion, eliminarCuentaAccion]) {
      expect(await accion(INICIAL, mal), accion.name).toMatchObject({ estado: "error", mensaje: expect.stringMatching(/venció/) });
    }
    const sesion = (await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA)))!;
    expect((await servicio().perfil(sesion.cuentaId))?.nombre).toBeNull();
    expect(await servicio().perfil(sesion.cuentaId)).not.toBeNull();
  });

  it("guardar el perfil devuelve lo guardado (para que el formulario no se vacíe) y revalida la página", async () => {
    const { csrf } = await conCuentaIniciada();
    const estado = await guardarPerfilAccion(INICIAL, formulario({ csrf, nombre: "  Ana  ", temas: ["energia", "cobre"], resumen: "on" }));
    // Vuelve lo guardado, ya normalizado (sin los espacios de más).
    expect(estado).toMatchObject({ estado: "enviado", valores: { nombre: "Ana", temas: ["energia", "cobre"], resumen: true } });
    expect(mundo.revalidadas).toContain("/cuenta");
    const sesion = (await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA)))!;
    expect(await servicio().perfil(sesion.cuentaId)).toMatchObject({ nombre: "Ana", temas: ["energia", "cobre"], resumenPrevio: true });
  });

  it("seguir temas desde la portada guarda solo los temas (validados con Zod) y no toca el nombre ni el resumen", async () => {
    const { csrf } = await conCuentaIniciada();
    await guardarPerfilAccion(INICIAL, formulario({ csrf, nombre: "Ana", temas: ["cobre"], resumen: "on" }));
    const estado = await seguirTemasAccion(INICIAL, formulario({ csrf, temas: ["energia", "divisas", "energia"] }));
    expect(estado).toMatchObject({ estado: "enviado", valores: { temas: ["energia", "divisas"] } });
    const sesion = (await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA)))!;
    expect(await servicio().perfil(sesion.cuentaId)).toMatchObject({ nombre: "Ana", temas: ["energia", "divisas"], resumenPrevio: true });
    expect(await seguirTemasAccion(INICIAL, formulario({ csrf, temas: ["energia", "inventado"] }))).toMatchObject({
      estado: "error",
      errores: { temas: expect.any(String) },
    });
    expect((await servicio().perfil(sesion.cuentaId))?.temas).toEqual(["energia", "divisas"]);
    expect(await seguirTemasAccion(INICIAL, formulario({ csrf }))).toMatchObject({ estado: "enviado", valores: { temas: [] } });
  });

  it("un tema inventado se rechaza con su error y vuelve lo escrito", async () => {
    const { csrf } = await conCuentaIniciada();
    const estado = await guardarPerfilAccion(INICIAL, formulario({ csrf, nombre: "Ana", temas: ["inventado"] }));
    expect(estado).toMatchObject({ estado: "error", errores: { temas: expect.any(String) }, valores: { nombre: "Ana", temas: ["inventado"] } });
  });

  it("cambiar la contraseña exige la actual y nunca devuelve ninguna de las tres", async () => {
    const { csrf } = await conCuentaIniciada();
    const mal = await cambiarClaveAccion(INICIAL, formulario({ csrf, actual: "no es esa contraseña", nueva: CLAVE_2, repetir: CLAVE_2 }));
    expect(mal).toMatchObject({ estado: "error", errores: { actual: expect.any(String) } });
    expect(JSON.stringify(mal)).not.toMatch(/no es esa|tres gatos/);

    const bien = await cambiarClaveAccion(INICIAL, formulario({ csrf, actual: CLAVE, nueva: CLAVE_2, repetir: CLAVE_2 }));
    expect(bien).toMatchObject({ estado: "enviado" });
    expect(JSON.stringify(bien)).not.toMatch(/lluvia|tres gatos/);
    expect(mundo.revalidadas).toContain("/cuenta/seguridad");
  });

  it("la verificación en dos pasos: pide la contraseña, entrega secreto y QR, y al confirmar entrega los códigos una sola vez", async () => {
    const { csrf } = await conCuentaIniciada();
    const sinClave = await iniciarDosPasosAccion(INICIAL, formulario({ csrf, actual: "otra cosa" }));
    expect(sinClave).toMatchObject({ estado: "error", errores: { actual: expect.any(String) } });
    expect(sinClave.dosPasos).toBeUndefined();

    const inicio = await iniciarDosPasosAccion(INICIAL, formulario({ csrf, actual: CLAVE }));
    expect(inicio.estado).toBe("enviado");
    const { secreto, uri, qr } = inicio.dosPasos!;
    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    expect(uri).toBe(`otpauth://totp/Otea%20Austral:${encodeURIComponent(CORREO)}?secret=${secreto}&issuer=Otea%20Austral`);
    expect(qr!.lado).toBeGreaterThan(20);
    expect(qr!.ruta).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);

    const mal = await confirmarDosPasosAccion(INICIAL, formulario({ csrf, codigo: "000000" }));
    expect(mal).toMatchObject({ estado: "error", errores: { codigo: expect.any(String) } });
    expect(mal.codigos).toBeUndefined();

    const codigo = codigoTotp(decodificarBase32(secreto), pasoTotp(Date.now()));
    const bien = await confirmarDosPasosAccion(INICIAL, formulario({ csrf, codigo }));
    expect(bien).toMatchObject({ estado: "enviado", mensaje: "Verificación en dos pasos activada." });
    expect(bien.codigos).toHaveLength(10);
    expect(new Set(bien.codigos).size).toBe(10);
    for (const c of bien.codigos!) expect(c).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);

    // Ya activada: iniciar otra vez no entrega un secreto nuevo.
    const otra = await iniciarDosPasosAccion(INICIAL, formulario({ csrf, actual: CLAVE }));
    expect(otra.dosPasos).toBeUndefined();
  });

  it("con dos pasos activos, entrar pide el código y el segundo paso termina la sesión", async () => {
    const { csrf } = await conCuentaIniciada();
    const { dosPasos } = await iniciarDosPasosAccion(INICIAL, formulario({ csrf, actual: CLAVE }));
    const secreto = dosPasos!.secreto;
    const paso = pasoTotp(Date.now());
    await confirmarDosPasosAccion(INICIAL, formulario({ csrf, codigo: codigoTotp(decodificarBase32(secreto), paso) }));
    await servicio().cerrarSesion(mundo.cookies.get(COOKIE_SESION_CUENTA));
    mundo.cookies.clear();

    expect(await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE, siguiente: "/cuenta/datos" })))).toBe("/cuenta/verificar?siguiente=%2Fcuenta%2Fdatos");
    // La sesión «a medias» no abre las páginas de la cuenta.
    expect(await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA))).toBeNull();

    const malo = await verificarSegundoPasoAccion(INICIAL, formulario({ codigo: "123456" }));
    expect(malo.estado).toBe("error");
    // El código del paso que ya se usó para activar no sirve otra vez; el siguiente sí.
    const siguiente = codigoTotp(decodificarBase32(secreto), paso + 1);
    expect(await redirige(verificarSegundoPasoAccion(INICIAL, formulario({ codigo: siguiente, siguiente: "/cuenta/datos" })))).toBe("/cuenta/datos");
    expect(await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA))).not.toBeNull();
  });

  it("entrar con un código de recuperación lleva a la seguridad de la cuenta, para ver cuántos quedan", async () => {
    const { csrf } = await conCuentaIniciada();
    const { dosPasos } = await iniciarDosPasosAccion(INICIAL, formulario({ csrf, actual: CLAVE }));
    const { codigos } = await confirmarDosPasosAccion(INICIAL, formulario({ csrf, codigo: codigoTotp(decodificarBase32(dosPasos!.secreto), pasoTotp(Date.now())) }));
    await servicio().cerrarSesion(mundo.cookies.get(COOKIE_SESION_CUENTA));
    mundo.cookies.clear();

    await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE, siguiente: "/cuenta/datos" })));
    expect(await redirige(verificarSegundoPasoAccion(INICIAL, formulario({ codigo: codigos![0], siguiente: "/cuenta/datos" })))).toBe("/cuenta/seguridad?aviso=recuperacion");
    expect(await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA))).not.toBeNull();
  });

  it("el segundo paso sin sesión pendiente manda a entrar", async () => {
    expect(await redirige(verificarSegundoPasoAccion(INICIAL, formulario({ codigo: "123456" })))).toBe("/cuenta/entrar?aviso=venció");
  });

  it("eliminar exige la casilla y la contraseña; al terminar borra la cookie y despide", async () => {
    const { csrf } = await conCuentaIniciada();
    const sinCasilla = await eliminarCuentaAccion(INICIAL, formulario({ csrf, actual: CLAVE }));
    expect(sinCasilla).toMatchObject({ estado: "error", errores: { condiciones: expect.any(String) } });
    expect(Object.keys(sinCasilla.errores!)).toEqual(["condiciones"]);
    expect(sinCasilla.valores).toEqual({ confirmar: false });

    const mal = await eliminarCuentaAccion(INICIAL, formulario({ csrf, actual: "no es esa", confirmar: "on" }));
    expect(mal).toMatchObject({ estado: "error", errores: { actual: expect.any(String) }, valores: { confirmar: true } });
    expect(JSON.stringify(mal)).not.toContain("no es esa");
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(true);

    const sesion = (await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA)))!;
    expect(await redirige(eliminarCuentaAccion(INICIAL, formulario({ csrf, actual: CLAVE, confirmar: "on" })))).toBe("/cuenta/eliminada");
    expect(mundo.cookies.has(COOKIE_SESION_CUENTA)).toBe(false);
    expect(await servicio().perfil(sesion.cuentaId)).toBeNull();
    expect(correos.at(-1)!.asunto).toMatch(/Eliminamos tu cuenta/);
  });

  it("cerrar las demás sesiones deja la de este navegador", async () => {
    const { csrf } = await conCuentaIniciada();
    const estado = await cerrarOtrasSesionesAccion(INICIAL, formulario({ csrf }));
    expect(estado).toMatchObject({ estado: "enviado", mensaje: "No había otras sesiones abiertas." });
    expect(await servicio().leerSesion(mundo.cookies.get(COOKIE_SESION_CUENTA))).not.toBeNull();
  });
});

describe("olvidé mi contraseña", () => {
  it("responde lo mismo exista o no la cuenta, sin devolver nada más que el aviso", async () => {
    await conCuentaIniciada();
    const existe = await olvideAccion(INICIAL, formulario({ correo: CORREO, sitio_web: "" }));
    const noExiste = await olvideAccion(INICIAL, formulario({ correo: "nadie@correo.cl", sitio_web: "" }));
    expect(existe).toEqual(noExiste);
    expect(existe.estado).toBe("enviado");
  });

  it("restablecer con el enlace cambia la contraseña, cierra las sesiones y manda a entrar", async () => {
    await conCuentaIniciada();
    const token = mundo.cookies.get(COOKIE_SESION_CUENTA)!;
    await olvideAccion(INICIAL, formulario({ correo: CORREO, sitio_web: "" }));
    const destino = await redirige(restablecerAccion(INICIAL, formulario({ token: tokenDelUltimoCorreo(), clave: CLAVE_2, repetir: CLAVE_2 })));
    expect(destino).toBe("/cuenta/entrar?aviso=restablecida");
    expect(await servicio().leerSesion(token)).toBeNull();
    expect(await redirige(entrarAccion(INICIAL, formulario({ correo: CORREO, clave: CLAVE_2 })))).toBe("/cuenta");
  });
});
