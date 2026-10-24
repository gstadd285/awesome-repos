import { describe, expect, it } from "vitest";
import {
  ClaveSaturada,
  crearSemaforo,
  hashearClave,
  necesitaRehash,
  PARAMETROS_SCRYPT,
  verificarClave,
  verificarContraSenuelo,
} from "./clave";

describe("contraseñas guardadas con scrypt", () => {
  it("el hash lleva sus parámetros y una sal propia, y no contiene la contraseña", async () => {
    const hash = await hashearClave("lluvia sobre el cerro");
    const [prefijo, N, r, p, sal, derivada] = hash.split("$");
    expect([prefijo, Number(N), Number(r), Number(p)]).toEqual(["scrypt", PARAMETROS_SCRYPT.N, PARAMETROS_SCRYPT.r, PARAMETROS_SCRYPT.p]);
    expect(Buffer.from(sal, "base64url")).toHaveLength(16);
    expect(Buffer.from(derivada, "base64url")).toHaveLength(32);
    expect(hash).not.toContain("lluvia");
    expect(hash.length).toBeLessThanOrEqual(200); // lo que admite la columna de la base
  });

  it("la misma contraseña da hashes distintos (sal distinta) y los dos sirven", async () => {
    const [a, b] = await Promise.all([hashearClave("la misma frase de siempre"), hashearClave("la misma frase de siempre")]);
    expect(a).not.toBe(b);
    expect(await verificarClave("la misma frase de siempre", a)).toBe(true);
    expect(await verificarClave("la misma frase de siempre", b)).toBe(true);
  });

  it("acepta la contraseña correcta y rechaza cualquier otra, también las que solo cambian una letra", async () => {
    const hash = await hashearClave("Café con leche 2026");
    expect(await verificarClave("Café con leche 2026", hash)).toBe(true);
    for (const mala of ["cafe con leche 2026", "Café con leche 2027", "Café con leche 2026 ", "", "x"]) {
      expect(await verificarClave(mala, hash), mala).toBe(false);
    }
  });

  it("normaliza con NFKC: «é» compuesta y descompuesta, y las formas de ancho completo, son la misma contraseña", async () => {
    const hash = await hashearClave("café con leche");
    expect(await verificarClave("café con leche", hash)).toBe(true);
    expect(await verificarClave("ｃａｆé con leche", hash)).toBe(true);
  });

  it("un hash con formato inválido o parámetros fuera de rango nunca coincide (y no agota la memoria)", async () => {
    const bueno = await hashearClave("una frase cualquiera");
    const [, , r, p, sal, derivada] = bueno.split("$");
    const malos = [
      "",
      "scrypt",
      "pbkdf2-sha256$600000$AAAA$BBBB",
      `scrypt$32768$${r}$${p}$${sal}`,
      `scrypt$32767$${r}$${p}$${sal}$${derivada}`, // N no es potencia de dos
      `scrypt$${2 ** 24}$${r}$${p}$${sal}$${derivada}`, // N enorme
      `scrypt$32768$64$${p}$${sal}$${derivada}`,
      `scrypt$32768$${r}$0$${sal}$${derivada}`,
      `scrypt$32768$${r}$${p}$AAAA$${derivada}`, // sal corta
      `scrypt$32768$${r}$${p}$${sal}$AAAA`, // hash corto
      `scrypt$1048576$16$16$${sal}$${derivada}`, // costo total fuera de límite
    ];
    for (const malo of malos) {
      expect(await verificarClave("una frase cualquiera", malo), malo).toBe(false);
      expect(necesitaRehash(malo), malo).toBe(true);
    }
  });

  it("no gasta tiempo con textos enormes", async () => {
    const hash = await hashearClave("una frase cualquiera");
    expect(await verificarClave("x".repeat(5000), hash)).toBe(false);
  });

  it("avisa cuando el hash se hizo con parámetros anteriores", async () => {
    const actual = await hashearClave("una frase cualquiera");
    expect(necesitaRehash(actual)).toBe(false);
    const [prefijo, , r, p, sal, derivada] = actual.split("$");
    expect(necesitaRehash([prefijo, 2 ** 14, r, p, sal, derivada].join("$"))).toBe(true);
    expect(necesitaRehash([prefijo, PARAMETROS_SCRYPT.N, r, 1, sal, derivada].join("$"))).toBe(true);
  });

  it("el señuelo gasta el trabajo de una verificación y siempre dice que no", async () => {
    expect(await verificarContraSenuelo("cualquier cosa")).toBe(false);
    expect(await verificarContraSenuelo("otra cosa")).toBe(false);
  });
});

describe("límite de contraseñas verificándose a la vez", () => {
  const pausa = () => new Promise<void>((r) => setTimeout(r, 5));

  it("deja pasar a lo sumo `maximo` a la vez y atiende al resto por turno", async () => {
    const semaforo = crearSemaforo(2, 10);
    let activos = 0;
    let pico = 0;
    const tarea = () =>
      semaforo.ejecutar(async () => {
        activos += 1;
        pico = Math.max(pico, activos);
        await pausa();
        activos -= 1;
        return "listo";
      });
    const resultados = await Promise.all(Array.from({ length: 8 }, tarea));
    expect(resultados).toEqual(Array(8).fill("listo"));
    expect(pico).toBe(2);
    expect(activos).toBe(0);
  });

  it("rechaza lo que no cabe en la cola, y se recupera después", async () => {
    const semaforo = crearSemaforo(1, 2);
    const liberadores: Array<() => void> = [];
    const retenida = () => semaforo.ejecutar(() => new Promise<void>((r) => liberadores.push(r)));
    const enCurso = [retenida(), retenida(), retenida()]; // una activa y dos esperando
    await expect(semaforo.ejecutar(async () => "no cabe")).rejects.toBeInstanceOf(ClaveSaturada);
    for (let i = 0; i < 3; i++) {
      await pausa();
      liberadores.shift()?.();
    }
    await Promise.all(enCurso);
    expect(await semaforo.ejecutar(async () => "otra vez")).toBe("otra vez");
  });

  it("un error de la tarea no deja el turno ocupado", async () => {
    const semaforo = crearSemaforo(1, 1);
    await expect(semaforo.ejecutar(async () => Promise.reject(new Error("falla")))).rejects.toThrow("falla");
    expect(await semaforo.ejecutar(async () => "sigue")).toBe("sigue");
  });
});
