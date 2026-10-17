/**
 * Pruebas del contrato de `AlmacenCuentas`: las corren por igual el almacén en memoria y el de Postgres, así que
 * ninguno de los dos puede apartarse del otro sin que falle una prueba. Solo se importa desde `*.test.ts`.
 *
 * Cada prueba usa claves y correos propios (aleatorios): dentro de un archivo comparten el almacén. Las fechas son
 * fijas y de 2026 en adelante o de 2020 (cuando la prueba necesita algo «viejo» para la base real).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIPOS_DE_EVENTO, type AlmacenCuentas } from "./almacen";

const BASE = Date.UTC(2026, 9, 11, 12, 0, 0);
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
/** Instante de la prueba: minutos después de las 12:00 UTC del 11 de octubre de 2026. */
const T = (minutos: number) => new Date(BASE + minutos * MIN).toISOString();

const hex = () => randomBytes(32).toString("hex");
const cifradoCorreo = () => `v1.${randomBytes(40).toString("base64url")}`;
const cifradoTotp = () => `v1.${randomBytes(60).toString("base64url")}`;
const claveHash = () => `scrypt$32768$8$3$${randomBytes(16).toString("base64url")}$${randomBytes(32).toString("base64url")}`;

type Preparado = { almacen: AlmacenCuentas; cerrar?: () => Promise<void> };

export function pruebasDelContrato(nombre: string, preparar: () => Promise<Preparado>) {
  describe(`contrato del almacén de cuentas · ${nombre}`, () => {
    let a: AlmacenCuentas;
    let cerrar: (() => Promise<void>) | undefined;

    beforeAll(async () => {
      ({ almacen: a, cerrar } = await preparar());
    }, 60_000);

    afterAll(async () => {
      await cerrar?.();
    });

    /** Crea una cuenta con una sesión activa, como lo hace quien confirma su correo. */
    async function crearCuenta(minuto = 0) {
      const correoIndice = hex();
      const tokenHash = hex();
      const sesion = hex();
      const emision = await a.emitirAlta({
        correoIndice,
        correoCifrado: cifradoCorreo(),
        tokenHash,
        versionTextos: "v-prueba",
        ahora: T(minuto),
        reenviarSiAnteriorA: T(minuto - 10),
      });
      expect(emision).toBe("nuevo");
      const resultado = await a.activarAlta({
        tokenHash,
        vigenteDesde: T(minuto - 60),
        claveHash: claveHash(),
        ahora: T(minuto + 1),
        sesion: { tokenHash: sesion, expira: T(minuto + 1 + 30 * 24 * 60), dispositivo: "Chrome en Linux" },
      });
      if (typeof resultado === "string") throw new Error(`No se pudo crear la cuenta de prueba: ${resultado}`);
      return { id: resultado.cuentaId, sesionId: resultado.sesionId, correoIndice, sesion, tokenAlta: tokenHash };
    }

    const sesionNueva = (minuto: number, fase: "pendiente" | "activa" = "activa", duracionMin = 60 * 24) => ({
      tokenHash: hex(),
      fase,
      ahora: T(minuto),
      expira: T(minuto + duracionMin),
      dispositivo: null,
    });

    describe("crear la cuenta", () => {
      it("deja un enlace pendiente que se puede leer sin gastarlo", async () => {
        const correoIndice = hex();
        const correoCifrado = cifradoCorreo();
        const tokenHash = hex();
        expect(
          await a.emitirAlta({ correoIndice, correoCifrado, tokenHash, versionTextos: "v1", ahora: T(0), reenviarSiAnteriorA: T(-10) }),
        ).toBe("nuevo");
        const esperado = { correoIndice, correoCifrado, versionTextos: "v1", aceptado: T(0) };
        expect(await a.leerAlta(tokenHash, T(-60))).toEqual(esperado);
        expect(await a.leerAlta(tokenHash, T(-60))).toEqual(esperado);
        expect(await a.leerAlta(hex(), T(-60))).toBeNull();
      });

      it("un enlace vencido no se lee ni se activa", async () => {
        const tokenHash = hex();
        await a.emitirAlta({ correoIndice: hex(), correoCifrado: cifradoCorreo(), tokenHash, versionTextos: "v1", ahora: T(0), reenviarSiAnteriorA: T(-10) });
        expect(await a.leerAlta(tokenHash, T(1))).toBeNull();
        const r = await a.activarAlta({ tokenHash, vigenteDesde: T(1), claveHash: claveHash(), ahora: T(2), sesion: { tokenHash: hex(), expira: T(60), dispositivo: null } });
        expect(r).toBe("invalido");
      });

      it("pedir otro enlace antes del plazo no cambia nada; después lo reemplaza", async () => {
        const correoIndice = hex();
        const viejo = hex();
        const nuevo = hex();
        const datos = { correoIndice, correoCifrado: cifradoCorreo(), versionTextos: "v1" };
        expect(await a.emitirAlta({ ...datos, tokenHash: viejo, ahora: T(0), reenviarSiAnteriorA: T(-10) })).toBe("nuevo");
        // Cinco minutos después, con un plazo de diez: «reciente», el enlace de antes sigue valiendo.
        expect(await a.emitirAlta({ ...datos, tokenHash: nuevo, ahora: T(5), reenviarSiAnteriorA: T(-5) })).toBe("reciente");
        expect(await a.leerAlta(viejo, T(-60))).not.toBeNull();
        expect(await a.leerAlta(nuevo, T(-60))).toBeNull();
        // Doce minutos después: se reemplaza.
        expect(await a.emitirAlta({ ...datos, tokenHash: nuevo, ahora: T(12), reenviarSiAnteriorA: T(2) })).toBe("renovado");
        expect(await a.leerAlta(viejo, T(-60))).toBeNull();
        expect(await a.leerAlta(nuevo, T(-60))).toMatchObject({ correoIndice, aceptado: T(12) });
      });

      it("confirmar crea la cuenta y su primera sesión, con lo que aceptó la persona", async () => {
        const { id, correoIndice, sesion } = await crearCuenta();
        const cuenta = await a.buscarPorCorreo(correoIndice);
        expect(cuenta).toMatchObject({
          id,
          correoIndice,
          nombre: null,
          fallos: 0,
          fallosDesde: null,
          totpSecretoCifrado: null,
          totpPendienteCifrado: null,
          totpActivado: null,
          totpUltimoPaso: null,
          versionTextos: "v-prueba",
          aceptado: T(0),
          temas: [],
          resumenPrevio: false,
          creada: T(1),
          claveCambiada: T(1),
        });
        expect(cuenta?.claveHash).toMatch(/^scrypt\$/);
        expect(await a.buscarPorId(id)).toEqual(cuenta);
        expect(await a.leerSesion(sesion, T(2), T(-100))).toMatchObject({ cuentaId: id, fase: "activa", nombre: null, dosPasos: false });
        expect((await a.eventosRecientes(id, 10)).map((e) => e.tipo).sort()).toEqual(["acceso", "alta"]);
      });

      it("el enlace se gasta: no sirve una segunda vez", async () => {
        const { tokenAlta } = await crearCuenta();
        expect(await a.leerAlta(tokenAlta, T(-60))).toBeNull();
        const otra = await a.activarAlta({ tokenHash: tokenAlta, vigenteDesde: T(-60), claveHash: claveHash(), ahora: T(5), sesion: { tokenHash: hex(), expira: T(60), dispositivo: null } });
        expect(otra).toBe("invalido");
      });

      it("descartar un enlace pendiente permite pedir otro de inmediato y no toca los ya usados", async () => {
        const correoIndice = hex();
        const primero = hex();
        const datos = { correoIndice, correoCifrado: cifradoCorreo(), versionTextos: "v1" };
        await a.emitirAlta({ ...datos, tokenHash: primero, ahora: T(0), reenviarSiAnteriorA: T(-10) });
        expect(await a.emitirAlta({ ...datos, tokenHash: hex(), ahora: T(1), reenviarSiAnteriorA: T(-9) })).toBe("reciente");
        await a.descartarEnlace(primero);
        expect(await a.leerAlta(primero, T(-60))).toBeNull();
        expect(await a.emitirAlta({ ...datos, tokenHash: hex(), ahora: T(2), reenviarSiAnteriorA: T(-8) })).toBe("nuevo");
        await a.descartarEnlace(hex()); // uno que no existe: no falla
        // Un enlace ya usado no se descarta (queda como constancia hasta la limpieza).
        const { tokenAlta, correoIndice: indiceActivo } = await crearCuenta();
        await a.descartarEnlace(tokenAlta);
        expect(await a.buscarPorCorreo(indiceActivo)).not.toBeNull();
      });

      it("con una cuenta ya creada para ese correo, no se emite otro enlace", async () => {
        const { correoIndice } = await crearCuenta();
        const r = await a.emitirAlta({ correoIndice, correoCifrado: cifradoCorreo(), tokenHash: hex(), versionTextos: "v1", ahora: T(30), reenviarSiAnteriorA: T(20) });
        expect(r).toBe("existente");
      });

      it("no se puede activar con un enlace que no existe", async () => {
        const r = await a.activarAlta({ tokenHash: hex(), vigenteDesde: T(-60), claveHash: claveHash(), ahora: T(5), sesion: { tokenHash: hex(), expira: T(60), dispositivo: null } });
        expect(r).toBe("invalido");
      });
    });

    describe("cuenta", () => {
      it("buscar lo que no existe devuelve null", async () => {
        expect(await a.buscarPorCorreo(hex())).toBeNull();
        expect(await a.buscarPorId("00000000-0000-4000-8000-000000000000")).toBeNull();
      });

      it("suma los puntos de los intentos fallidos de una ventana, la reinicia al terminar y los limpia al entrar", async () => {
        const { id } = await crearCuenta();
        const ventana = (minuto: number) => T(minuto - 15);
        expect(await a.registrarFallo(id, T(0), ventana(0), 1)).toBe(1);
        expect(await a.registrarFallo(id, T(1), ventana(1), 13)).toBe(14);
        expect(await a.registrarFallo(id, T(14), ventana(14), 1)).toBe(15);
        expect(await a.buscarPorId(id)).toMatchObject({ fallos: 15, fallosDesde: T(0) });
        // A los 15 minutos de empezar, la ventana terminó: se vuelve a contar desde cero (con lo de este intento).
        expect(await a.registrarFallo(id, T(15), ventana(15), 13)).toBe(13);
        expect(await a.buscarPorId(id)).toMatchObject({ fallos: 13, fallosDesde: T(15) });
        await a.limpiarFallos(id);
        expect(await a.buscarPorId(id)).toMatchObject({ fallos: 0, fallosDesde: null });
        expect(await a.registrarFallo("00000000-0000-4000-8000-000000000000", T(0), ventana(0), 1)).toBe(0);
      });

      it("actualiza el perfil", async () => {
        const { id } = await crearCuenta();
        await a.actualizarPerfil(id, { nombre: "Catalina Pérez", temas: ["cobre", "divisas"], resumenPrevio: true }, T(5));
        expect(await a.buscarPorId(id)).toMatchObject({ nombre: "Catalina Pérez", temas: ["cobre", "divisas"], resumenPrevio: true });
        await a.actualizarPerfil(id, { nombre: null, temas: [], resumenPrevio: false }, T(6));
        expect(await a.buscarPorId(id)).toMatchObject({ nombre: null, temas: [], resumenPrevio: false });
      });

      it("cambiar la contraseña la guarda, borra los fallos, deja la sesión actual y cierra las demás", async () => {
        const { id, sesion } = await crearCuenta();
        const otra = sesionNueva(2);
        const tercera = sesionNueva(3);
        await a.crearSesion(id, otra, 10);
        await a.crearSesion(id, tercera, 10);
        await a.registrarFallo(id, T(4), T(-11), 1);
        const nueva = claveHash();
        await a.cambiarClave({ cuentaId: id, claveHash: nueva, ahora: T(10), conservarSesion: sesion });
        expect(await a.buscarPorId(id)).toMatchObject({ claveHash: nueva, claveCambiada: T(10), fallos: 0, fallosDesde: null });
        expect(await a.leerSesion(sesion, T(11), T(-100))).not.toBeNull();
        expect(await a.leerSesion(otra.tokenHash, T(11), T(-100))).toBeNull();
        expect(await a.leerSesion(tercera.tokenHash, T(11), T(-100))).toBeNull();
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("clave_cambiada");
      });

      it("cambiar la contraseña sin conservar ninguna sesión las cierra todas", async () => {
        const { id, sesion } = await crearCuenta();
        await a.cambiarClave({ cuentaId: id, claveHash: claveHash(), ahora: T(10) });
        expect(await a.leerSesion(sesion, T(11), T(-100))).toBeNull();
      });

      it("renovar el hash solo vale si la contraseña sigue siendo la misma", async () => {
        const { id } = await crearCuenta();
        const original = (await a.buscarPorId(id))!.claveHash;
        const nuevo = claveHash();
        await a.renovarHashClave(id, claveHash(), nuevo); // otro hash: no cambia nada
        expect((await a.buscarPorId(id))!.claveHash).toBe(original);
        await a.renovarHashClave(id, original, nuevo);
        expect((await a.buscarPorId(id))!.claveHash).toBe(nuevo);
      });

      it("eliminar la cuenta borra todo lo que depende de ella y libera el correo", async () => {
        const { id, correoIndice, sesion } = await crearCuenta();
        await a.guardarTotpPendiente(id, cifradoTotp());
        await a.activarTotp({ cuentaId: id, ahora: T(3), paso: 100, codigosHash: [hex(), hex()] });
        await a.emitirRestablecer({ cuentaId: id, tokenHash: hex(), ahora: T(4), reenviarSiAnteriorA: T(-6) });
        await a.eliminarCuenta(id);
        expect(await a.buscarPorId(id)).toBeNull();
        expect(await a.buscarPorCorreo(correoIndice)).toBeNull();
        expect(await a.leerSesion(sesion, T(5), T(-100))).toBeNull();
        expect(await a.eventosRecientes(id, 10)).toEqual([]);
        expect(await a.contarCodigosLibres(id)).toBe(0);
        const otra = await a.emitirAlta({ correoIndice, correoCifrado: cifradoCorreo(), tokenHash: hex(), versionTextos: "v1", ahora: T(10), reenviarSiAnteriorA: T(0) });
        expect(otra).toBe("nuevo");
      });
    });

    describe("restablecer la contraseña", () => {
      it("emite un solo enlace pendiente por cuenta, con el mismo plazo de reenvío", async () => {
        const { id } = await crearCuenta();
        const [t1, t2, t3] = [hex(), hex(), hex()];
        expect(await a.emitirRestablecer({ cuentaId: id, tokenHash: t1, ahora: T(0), reenviarSiAnteriorA: T(-10) })).toBe("nuevo");
        expect(await a.emitirRestablecer({ cuentaId: id, tokenHash: t2, ahora: T(5), reenviarSiAnteriorA: T(-5) })).toBe("reciente");
        expect(await a.leerRestablecer(t1, T(-60))).toEqual({ cuentaId: id });
        expect(await a.leerRestablecer(t2, T(-60))).toBeNull();
        expect(await a.emitirRestablecer({ cuentaId: id, tokenHash: t3, ahora: T(12), reenviarSiAnteriorA: T(2) })).toBe("renovado");
        expect(await a.leerRestablecer(t1, T(-60))).toBeNull();
        expect(await a.leerRestablecer(t3, T(-60))).toEqual({ cuentaId: id });
      });

      it("un enlace vencido o desconocido no se lee", async () => {
        const { id } = await crearCuenta();
        const t = hex();
        await a.emitirRestablecer({ cuentaId: id, tokenHash: t, ahora: T(0), reenviarSiAnteriorA: T(-10) });
        expect(await a.leerRestablecer(t, T(1))).toBeNull();
        expect(await a.leerRestablecer(hex(), T(-60))).toBeNull();
      });

      it("usarlo cambia la contraseña, cierra TODAS las sesiones, borra los fallos y se gasta", async () => {
        const { id, sesion } = await crearCuenta();
        const otra = sesionNueva(2);
        await a.crearSesion(id, otra, 10);
        await a.registrarFallo(id, T(3), T(-12), 1);
        const t = hex();
        await a.emitirRestablecer({ cuentaId: id, tokenHash: t, ahora: T(4), reenviarSiAnteriorA: T(-6) });
        const nueva = claveHash();
        expect(await a.usarRestablecer({ tokenHash: t, vigenteDesde: T(-60), claveHash: nueva, ahora: T(10) })).toEqual({ cuentaId: id });
        expect(await a.buscarPorId(id)).toMatchObject({ claveHash: nueva, claveCambiada: T(10), fallos: 0, fallosDesde: null });
        expect(await a.leerSesion(sesion, T(11), T(-100))).toBeNull();
        expect(await a.leerSesion(otra.tokenHash, T(11), T(-100))).toBeNull();
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("clave_restablecida");
        // Gastado: ni se lee ni se usa otra vez.
        expect(await a.leerRestablecer(t, T(-60))).toBeNull();
        expect(await a.usarRestablecer({ tokenHash: t, vigenteDesde: T(-60), claveHash: claveHash(), ahora: T(12) })).toBeNull();
        expect((await a.buscarPorId(id))!.claveHash).toBe(nueva);
      });

      it("usar un enlace vencido no cambia nada", async () => {
        const { id } = await crearCuenta();
        const antes = (await a.buscarPorId(id))!.claveHash;
        const t = hex();
        await a.emitirRestablecer({ cuentaId: id, tokenHash: t, ahora: T(0), reenviarSiAnteriorA: T(-10) });
        expect(await a.usarRestablecer({ tokenHash: t, vigenteDesde: T(1), claveHash: claveHash(), ahora: T(2) })).toBeNull();
        expect((await a.buscarPorId(id))!.claveHash).toBe(antes);
      });

      it("después de usar uno, se puede pedir otro", async () => {
        const { id } = await crearCuenta();
        const t = hex();
        await a.emitirRestablecer({ cuentaId: id, tokenHash: t, ahora: T(0), reenviarSiAnteriorA: T(-10) });
        await a.usarRestablecer({ tokenHash: t, vigenteDesde: T(-60), claveHash: claveHash(), ahora: T(1) });
        expect(await a.emitirRestablecer({ cuentaId: id, tokenHash: hex(), ahora: T(2), reenviarSiAnteriorA: T(-8) })).toBe("nuevo");
      });
    });

    describe("verificación en dos pasos", () => {
      it("el secreto queda pendiente hasta confirmar; confirmar lo activa, entrega los códigos y anota el paso", async () => {
        const { id } = await crearCuenta();
        const secreto = cifradoTotp();
        await a.guardarTotpPendiente(id, secreto);
        expect(await a.buscarPorId(id)).toMatchObject({ totpPendienteCifrado: secreto, totpSecretoCifrado: null, totpActivado: null });
        const codigos = Array.from({ length: 10 }, hex);
        expect(await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 5000, codigosHash: codigos })).toBe(true);
        expect(await a.buscarPorId(id)).toMatchObject({
          totpPendienteCifrado: null,
          totpSecretoCifrado: secreto,
          totpActivado: T(5),
          totpUltimoPaso: 5000,
        });
        expect(await a.contarCodigosLibres(id)).toBe(10);
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("dos_pasos_activados");
        expect((await a.leerSesion((await crearSesionDe(id)).tokenHash, T(6), T(-100)))?.dosPasos).toBe(true);
      });

      async function crearSesionDe(id: string) {
        const s = sesionNueva(5);
        await a.crearSesion(id, s, 10);
        return s;
      }

      it("sin secreto pendiente, o ya activada, no se activa", async () => {
        const { id } = await crearCuenta();
        expect(await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 1, codigosHash: [hex()] })).toBe(false);
        await a.guardarTotpPendiente(id, cifradoTotp());
        expect(await a.activarTotp({ cuentaId: id, ahora: T(6), paso: 2, codigosHash: [hex()] })).toBe(true);
        expect(await a.activarTotp({ cuentaId: id, ahora: T(7), paso: 3, codigosHash: [hex()] })).toBe(false);
        // Con la verificación activa, un secreto pendiente nuevo no se guarda.
        await a.guardarTotpPendiente(id, cifradoTotp());
        expect((await a.buscarPorId(id))!.totpPendienteCifrado).toBeNull();
      });

      it("un paso de tiempo se gasta una sola vez y no se aceptan pasos anteriores", async () => {
        const { id } = await crearCuenta();
        await a.guardarTotpPendiente(id, cifradoTotp());
        await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 100, codigosHash: [hex()] });
        expect(await a.gastarPasoTotp(id, 100)).toBe(false);
        expect(await a.gastarPasoTotp(id, 99)).toBe(false);
        expect(await a.gastarPasoTotp(id, 101)).toBe(true);
        expect(await a.gastarPasoTotp(id, 101)).toBe(false);
        expect(await a.gastarPasoTotp(id, 105)).toBe(true);
        expect(await a.gastarPasoTotp("00000000-0000-4000-8000-000000000000", 1)).toBe(false);
      });

      it("un código de recuperación vale una sola vez", async () => {
        const { id } = await crearCuenta();
        const [c1, c2] = [hex(), hex()];
        await a.guardarTotpPendiente(id, cifradoTotp());
        await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 1, codigosHash: [c1, c2] });
        expect(await a.gastarCodigoRecuperacion(id, c1, T(6))).toBe(true);
        expect(await a.gastarCodigoRecuperacion(id, c1, T(7))).toBe(false);
        expect(await a.gastarCodigoRecuperacion(id, hex(), T(7))).toBe(false);
        expect(await a.contarCodigosLibres(id)).toBe(1);
        // El código de otra cuenta no sirve.
        const otra = await crearCuenta();
        expect(await a.gastarCodigoRecuperacion(otra.id, c2, T(8))).toBe(false);
      });

      it("regenerar los códigos invalida los anteriores", async () => {
        const { id } = await crearCuenta();
        const viejo = hex();
        await a.guardarTotpPendiente(id, cifradoTotp());
        await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 1, codigosHash: [viejo] });
        const nuevos = Array.from({ length: 10 }, hex);
        await a.reemplazarCodigos(id, nuevos, T(10));
        expect(await a.gastarCodigoRecuperacion(id, viejo, T(11))).toBe(false);
        expect(await a.gastarCodigoRecuperacion(id, nuevos[3], T(11))).toBe(true);
        expect(await a.contarCodigosLibres(id)).toBe(9);
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("codigos_regenerados");
      });

      it("apagarla borra el secreto, el pendiente y los códigos", async () => {
        const { id } = await crearCuenta();
        const c = hex();
        await a.guardarTotpPendiente(id, cifradoTotp());
        await a.activarTotp({ cuentaId: id, ahora: T(5), paso: 1, codigosHash: [c] });
        await a.desactivarTotp(id, T(10));
        expect(await a.buscarPorId(id)).toMatchObject({ totpSecretoCifrado: null, totpPendienteCifrado: null, totpActivado: null, totpUltimoPaso: null });
        expect(await a.contarCodigosLibres(id)).toBe(0);
        expect(await a.gastarCodigoRecuperacion(id, c, T(11))).toBe(false);
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("dos_pasos_desactivados");
        // Se puede volver a activar con un secreto nuevo.
        await a.guardarTotpPendiente(id, cifradoTotp());
        expect(await a.activarTotp({ cuentaId: id, ahora: T(12), paso: 7, codigosHash: [hex()] })).toBe(true);
      });
    });

    describe("sesiones", () => {
      it("se lee mientras está vigente, y no cuando se revoca, vence o lleva demasiado sin usarse", async () => {
        const { id } = await crearCuenta();
        const s = sesionNueva(10, "activa", 60);
        await a.crearSesion(id, s, 10);
        expect(await a.leerSesion(s.tokenHash, T(20), T(0))).toMatchObject({ cuentaId: id, fase: "activa", expira: T(70) });
        expect(await a.leerSesion(hex(), T(20), T(0))).toBeNull();
        expect(await a.leerSesion(s.tokenHash, T(70), T(0))).toBeNull(); // venció
        expect(await a.leerSesion(s.tokenHash, T(20), T(10))).toBeNull(); // último uso (T(10)) no es posterior a T(10)
        await a.revocarSesion(s.tokenHash, T(30));
        expect(await a.leerSesion(s.tokenHash, T(31), T(0))).toBeNull();
        await a.revocarSesion(s.tokenHash, T(40)); // revocar otra vez no falla
      });

      it("anota el último uso solo cuando el anterior es más viejo que el plazo", async () => {
        const { id } = await crearCuenta();
        const s = sesionNueva(0, "activa", 600);
        await a.crearSesion(id, s, 10);
        await a.tocarSesion(s.tokenHash, T(5), T(-5)); // el anterior (T(0)) no es más viejo que T(-5): no cambia
        expect(await a.leerSesion(s.tokenHash, T(6), T(2))).toBeNull(); // sigue en T(0)
        await a.tocarSesion(s.tokenHash, T(20), T(10)); // T(0) es más viejo que T(10): se anota T(20)
        expect(await a.leerSesion(s.tokenHash, T(21), T(15))).not.toBeNull();
      });

      it("una sesión pendiente se cambia por una activa nueva, una sola vez", async () => {
        const { id } = await crearCuenta();
        const pendiente = sesionNueva(0, "pendiente", 10);
        await a.crearSesion(id, pendiente, 10);
        expect(await a.leerSesion(pendiente.tokenHash, T(1), T(-100))).toMatchObject({ fase: "pendiente" });
        const nueva = { tokenHash: hex(), ahora: T(2), expira: T(60 * 24), dispositivo: "Firefox en Linux" };
        const r = await a.ascenderSesion({ tokenHashPendiente: pendiente.tokenHash, sesion: nueva, maximo: 10 });
        expect(r).toMatchObject({ cuentaId: id });
        expect(await a.leerSesion(pendiente.tokenHash, T(3), T(-100))).toBeNull();
        expect(await a.leerSesion(nueva.tokenHash, T(3), T(-100))).toMatchObject({ fase: "activa", cuentaId: id });
        expect(await a.ascenderSesion({ tokenHashPendiente: pendiente.tokenHash, sesion: { ...nueva, tokenHash: hex() }, maximo: 10 })).toBeNull();
      });

      it("una sesión pendiente vencida o una activa no se pueden ascender", async () => {
        const { id, sesion } = await crearCuenta();
        const vencida = sesionNueva(0, "pendiente", 10);
        await a.crearSesion(id, vencida, 10);
        const nueva = { tokenHash: hex(), ahora: T(11), expira: T(600), dispositivo: null };
        expect(await a.ascenderSesion({ tokenHashPendiente: vencida.tokenHash, sesion: nueva, maximo: 10 })).toBeNull();
        expect(await a.ascenderSesion({ tokenHashPendiente: sesion, sesion: { ...nueva, ahora: T(5) }, maximo: 10 })).toBeNull();
        expect(await a.ascenderSesion({ tokenHashPendiente: hex(), sesion: nueva, maximo: 10 })).toBeNull();
      });

      it("con el máximo de sesiones abiertas, la siguiente cierra la más antigua", async () => {
        const { id, sesion } = await crearCuenta(0); // la primera, creada en el minuto 1
        const s2 = sesionNueva(2);
        const s3 = sesionNueva(3);
        await a.crearSesion(id, s2, 3);
        await a.crearSesion(id, s3, 3);
        expect(await a.leerSesion(sesion, T(4), T(-100))).not.toBeNull();
        const s4 = sesionNueva(4);
        await a.crearSesion(id, s4, 3);
        expect(await a.leerSesion(sesion, T(5), T(-100))).toBeNull(); // la más antigua
        for (const s of [s2, s3, s4]) expect(await a.leerSesion(s.tokenHash, T(5), T(-100))).not.toBeNull();
      });

      it("cerrar una sesión por su identificador solo funciona dentro de la misma cuenta", async () => {
        const mia = await crearCuenta();
        const ajena = await crearCuenta();
        const s = sesionNueva(2);
        const { id: idSesion } = await a.crearSesion(mia.id, s, 10);
        expect(await a.revocarSesionPorId(ajena.id, idSesion, T(3))).toBe(false);
        expect(await a.leerSesion(s.tokenHash, T(4), T(-100))).not.toBeNull();
        expect(await a.revocarSesionPorId(mia.id, idSesion, T(5))).toBe(true);
        expect(await a.leerSesion(s.tokenHash, T(6), T(-100))).toBeNull();
        expect(await a.revocarSesionPorId(mia.id, idSesion, T(7))).toBe(false);
      });

      it("cerrar las demás deja la actual, cuenta las cerradas y lo anota", async () => {
        const { id, sesion } = await crearCuenta();
        const [s2, s3] = [sesionNueva(2), sesionNueva(3)];
        await a.crearSesion(id, s2, 10);
        await a.crearSesion(id, s3, 10);
        const otraCuenta = await crearCuenta();
        expect(await a.revocarOtras(id, sesion, T(10))).toBe(2);
        expect(await a.leerSesion(sesion, T(11), T(-100))).not.toBeNull();
        expect(await a.leerSesion(s2.tokenHash, T(11), T(-100))).toBeNull();
        expect(await a.leerSesion(otraCuenta.sesion, T(11), T(-100))).not.toBeNull();
        expect((await a.eventosRecientes(id, 10))[0].tipo).toBe("sesiones_cerradas");
        expect(await a.revocarOtras(id, sesion, T(12))).toBe(0);
      });

      it("lista solo las sesiones abiertas y activas, la más reciente primero, y marca la actual", async () => {
        const { id, sesion } = await crearCuenta(0);
        const s2 = { ...sesionNueva(5, "activa", 120), dispositivo: "Safari en iOS" };
        const revocada = sesionNueva(6);
        const pendiente = sesionNueva(7, "pendiente", 10);
        const vencida = sesionNueva(-300, "activa", 60);
        for (const s of [s2, revocada, pendiente, vencida]) await a.crearSesion(id, s, 10);
        await a.revocarSesion(revocada.tokenHash, T(8));
        const lista = await a.listarSesiones(id, T(30), T(-100), sesion);
        expect(lista.map((s) => s.dispositivo)).toEqual(["Safari en iOS", "Chrome en Linux"]);
        expect(lista.map((s) => s.esActual)).toEqual([false, true]);
        expect(lista[0]).toMatchObject({ creada: T(5), ultimoUso: T(5) });
        expect(lista[0].id).toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    describe("actividad, cuota de correos y limpieza", () => {
      it("los eventos salen del más nuevo al más viejo y respetan el límite", async () => {
        const { id } = await crearCuenta();
        await a.registrarEvento(id, "alta_repetida", T(10));
        await a.registrarEvento(id, "alta_repetida", T(11));
        const todos = await a.eventosRecientes(id, 10);
        expect(todos.map((e) => e.tipo)).toEqual(["alta_repetida", "alta_repetida", "acceso", "alta"].slice(0, todos.length));
        expect(todos[0].fecha).toBe(T(11));
        expect(await a.eventosRecientes(id, 1)).toHaveLength(1);
        expect(await a.eventosRecientes(id, 1)).toEqual([{ tipo: "alta_repetida", fecha: T(11) }]);
      });

      it("acepta todos los tipos de evento que conoce el servicio (la restricción de la base los repite)", async () => {
        const { id } = await crearCuenta();
        for (const tipo of TIPOS_DE_EVENTO) await a.registrarEvento(id, tipo, T(20));
        const guardados = (await a.eventosRecientes(id, 50)).map((e) => e.tipo);
        for (const tipo of TIPOS_DE_EVENTO) expect(guardados).toContain(tipo);
      });

      it("la cuota diaria de correos se llena y se reinicia al día siguiente (hora de Chile)", async () => {
        // Día propio de esta prueba, lejos del resto, para que no choque con otras corridas del mismo archivo.
        const dia = Date.UTC(2040, 5, 1 + Math.floor(Math.random() * 20), 15, 0, 0); // 11:00 en Chile
        const a1 = new Date(dia).toISOString();
        expect(await a.reservarCorreo(3, a1)).toBe(true);
        expect(await a.reservarCorreo(3, a1)).toBe(true);
        expect(await a.reservarCorreo(3, new Date(dia + HORA).toISOString())).toBe(true);
        expect(await a.reservarCorreo(3, a1)).toBe(false);
        expect(await a.reservarCorreo(3, a1)).toBe(false);
        // Otro día en Chile: vuelve a haber cupo.
        expect(await a.reservarCorreo(3, new Date(dia + DIA).toISOString())).toBe(true);
        // Un tope menor al ya usado también corta; un tope absurdo no reserva nada.
        expect(await a.reservarCorreo(1, a1)).toBe(false);
        expect(await a.reservarCorreo(0, new Date(dia + 3 * DIA).toISOString())).toBe(false);
      });

      it("el día cambia a medianoche de Chile, no de UTC", async () => {
        // 2040-07-10 02:30 UTC es el 9 de julio a las 22:30 en Chile (UTC-4); 04:30 UTC ya es el 10 de julio (00:30).
        const tarde = Date.UTC(2040, 6, 10 + Math.floor(Math.random() * 15), 2, 30, 0);
        const noche = new Date(tarde).toISOString();
        const madrugada = new Date(tarde + 2 * HORA).toISOString();
        expect(await a.reservarCorreo(1, noche)).toBe(true);
        expect(await a.reservarCorreo(1, noche)).toBe(false);
        expect(await a.reservarCorreo(1, madrugada)).toBe(true);
      });

      it("la limpieza borra los enlaces vencidos y deja lo vigente", async () => {
        const { id, sesion } = await crearCuenta(0);
        const viejo = hex();
        const correoViejo = hex();
        await a.emitirAlta({ correoIndice: correoViejo, correoCifrado: cifradoCorreo(), tokenHash: viejo, versionTextos: "v1", ahora: T(-60 * 24 * 9), reenviarSiAnteriorA: T(-60 * 24 * 10) });
        await a.purgar(T(10));
        // Si el enlace viejo siguiera ahí, un plazo de reenvío muy amplio lo vería como «reciente».
        const r = await a.emitirAlta({ correoIndice: correoViejo, correoCifrado: cifradoCorreo(), tokenHash: hex(), versionTextos: "v1", ahora: T(10), reenviarSiAnteriorA: T(-60 * 24 * 30) });
        expect(r).toBe("nuevo");
        // Lo vigente sigue: la sesión, la cuenta y sus eventos recientes.
        expect(await a.leerSesion(sesion, T(11), T(-100))).not.toBeNull();
        expect(await a.buscarPorId(id)).not.toBeNull();
        expect((await a.eventosRecientes(id, 10)).length).toBeGreaterThan(0);
      });
    });
  });
}
