import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Contraseñas guardadas con scrypt (función de derivación que gasta memoria, no solo cálculo: encarece los ataques con
 * tarjetas gráficas), con una sal propia de 16 bytes. Node no trae Argon2id; scrypt es la segunda opción de OWASP.
 *
 * Parámetros: N = 2^15, r = 8, p = 3 (32 MiB y unos 0,4 s por contraseña en un procesador actual). Es una de las
 * combinaciones equivalentes que recomienda OWASP (N = 2^17, r = 8, p = 1 gasta 128 MiB: demasiado para un contenedor de
 * 512 MiB con varias conexiones). Cada hash lleva sus parámetros, así que se pueden subir más adelante: `necesitaRehash`
 * avisa, al entrar, de que hay que guardar la contraseña con los parámetros nuevos.
 *
 * Formato: `scrypt$N$r$p$sal$hash` (base64url). La contraseña se normaliza con NFKC antes de calcular el hash.
 */
export const PARAMETROS_SCRYPT = { N: 2 ** 15, r: 8, p: 3 } as const;

const LARGO_HASH = 32;
const LARGO_SAL = 16;
const PREFIJO = "scrypt";
/** Una contraseña así de larga ya no es una contraseña: no se gasta tiempo en ella. */
const MAX_CARACTERES = 1024;

/** Hay demasiadas contraseñas verificándose a la vez: quien llama debe responder «inténtalo en un momento». */
export class ClaveSaturada extends Error {
  constructor() {
    super("Hay demasiadas contraseñas verificándose a la vez.");
    this.name = "ClaveSaturada";
  }
}

/**
 * Cada scrypt usa 32 MiB y un hilo del grupo de Node (4 por omisión). Dos a la vez dejan memoria y hilos para el resto;
 * quien no cabe en la cola de espera recibe un error en vez de acumular memoria.
 */
export function crearSemaforo(maximo: number, maximaCola: number) {
  let activos = 0;
  const cola: Array<() => void> = [];
  return {
    async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
      if (activos >= maximo) {
        if (cola.length >= maximaCola) throw new ClaveSaturada();
        // El turno se pasa tal cual: `activos` no cambia mientras haya quien espere.
        await new Promise<void>((continuar) => cola.push(continuar));
      } else {
        activos += 1;
      }
      try {
        return await fn();
      } finally {
        const siguiente = cola.shift();
        if (siguiente) siguiente();
        else activos -= 1;
      }
    },
  };
}

const semaforo = crearSemaforo(2, 24);

type Parametros = { N: number; r: number; p: number };

function derivar(clave: string, sal: Buffer, { N, r, p }: Parametros): Promise<Buffer> {
  return semaforo.ejecutar(
    () =>
      new Promise<Buffer>((resolver, rechazar) => {
        scrypt(
          clave.normalize("NFKC"),
          sal,
          LARGO_HASH,
          // maxmem: el doble de lo que gasta (128 · N · r), por el margen de la implementación.
          { N, r, p, maxmem: 256 * N * r },
          (error, derivada) => (error ? rechazar(error) : resolver(derivada)),
        );
      }),
  );
}

export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const { N, r, p } = PARAMETROS_SCRYPT;
  const hash = await derivar(clave, sal, PARAMETROS_SCRYPT);
  return `${PREFIJO}$${N}$${r}$${p}$${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Formato válido y parámetros dentro de lo razonable (un valor alterado en la base no debe agotar la memoria). */
function leer(almacenado: string): { parametros: Parametros; sal: Buffer; hash: Buffer } | null {
  const partes = almacenado.split("$");
  if (partes.length !== 6 || partes[0] !== PREFIJO) return null;
  const [N, r, p] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const potenciaDeDos = Number.isInteger(N) && N >= 2 ** 12 && N <= 2 ** 20 && (N & (N - 1)) === 0;
  if (!potenciaDeDos || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  if (N * r * p > 2 ** 27) return null;
  const sal = Buffer.from(partes[4], "base64url");
  const hash = Buffer.from(partes[5], "base64url");
  if (sal.length < LARGO_SAL || hash.length !== LARGO_HASH) return null;
  return { parametros: { N, r, p }, sal, hash };
}

/** `true` si la contraseña corresponde al hash. Un hash con formato inválido nunca coincide. */
export async function verificarClave(clave: string, almacenado: string): Promise<boolean> {
  if ([...clave].length > MAX_CARACTERES) return false;
  const guardado = leer(almacenado);
  if (!guardado) return false;
  const calculado = await derivar(clave, guardado.sal, guardado.parametros);
  return timingSafeEqual(calculado, guardado.hash);
}

/** `true` si el hash se hizo con parámetros distintos de los actuales: conviene volver a guardarlo al entrar. */
export function necesitaRehash(almacenado: string): boolean {
  const guardado = leer(almacenado);
  if (!guardado) return true;
  const { N, r, p } = guardado.parametros;
  return N !== PARAMETROS_SCRYPT.N || r !== PARAMETROS_SCRYPT.r || p !== PARAMETROS_SCRYPT.p;
}

let senuelo: Promise<string> | undefined;

/**
 * Cuando el correo no tiene cuenta se gasta el mismo trabajo que al verificar una contraseña real: así el tiempo de
 * respuesta no delata qué correos existen. Siempre devuelve `false`.
 */
export async function verificarContraSenuelo(clave: string): Promise<false> {
  senuelo ??= hashearClave(randomBytes(18).toString("base64url"));
  await verificarClave(clave, await senuelo);
  return false;
}
