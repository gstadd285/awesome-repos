import { CLAVES_COMUNES_TEXTO } from "./claves-comunes";
import { LARGO_MAX_CLAVE, LARGO_MIN_CLAVE } from "./constantes";

/**
 * Qué contraseñas se aceptan (NIST SP 800-63B-4, sección 3.1.1.2, y ASVS 5.0 capítulo 6):
 *
 *   · Largo mínimo de 12 caracteres y máximo de 128. **Sin reglas de composición** (mayúsculas, símbolos…): hacen que la
 *     gente elija contraseñas peores. Se aceptan espacios y cualquier carácter Unicode (se normaliza con NFKC).
 *   · Se rechazan las que cualquiera probaría primero: las más usadas, con números o símbolos añadidos al principio o al
 *     final y con las sustituciones de siempre (@ por a, 0 por o…); las que llevan el correo, el nombre o el del sitio; y
 *     las que son un mismo carácter repetido o una secuencia de teclado o de abecedario.
 *   · La lista es local (sin consultas a servicios externos: no sale ningún dato de la persona).
 *
 * El largo mínimo es 12 y no 15 (que NIST pide cuando la contraseña es el único factor) porque la cuenta ofrece
 * verificación en dos pasos y porque el acceso está limitado por intentos; se recomienda una frase de varias palabras.
 */
export type MotivoClave = "corta" | "larga" | "contexto" | "comun" | "repetitiva" | "secuencia";

export type ContextoClave = { correo?: string; nombre?: string };

export const MENSAJES_CLAVE: Record<MotivoClave, string> = {
  corta: `La contraseña debe tener al menos ${LARGO_MIN_CLAVE} caracteres. Una frase de cuatro palabras sin relación entre sí es larga y fácil de recordar.`,
  larga: `La contraseña admite hasta ${LARGO_MAX_CLAVE} caracteres.`,
  contexto: "No uses tu correo, tu nombre ni el nombre del sitio en la contraseña.",
  comun: "Esa contraseña (o una muy parecida) está entre las más usadas. Elige otra más difícil de adivinar.",
  repetitiva: "Esa contraseña repite los mismos caracteres. Elige otra.",
  secuencia: "Esa contraseña sigue una secuencia fácil de adivinar (como 123456 o qwerty). Elige otra.",
};

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Normalización común a la lista y a la contraseña: sin tildes, en minúsculas, sin espacios sobrantes. */
const normalizar = (t: string) => sinAcentos(t.normalize("NFKC").toLowerCase());

const COMUNES: ReadonlySet<string> = new Set(CLAVES_COMUNES_TEXTO.split(/\s+/).filter(Boolean).map(normalizar));

/** Las sustituciones de siempre. El «1» puede ser una i o una ele: se prueban las dos. */
function sinSustituciones(t: string, uno: "i" | "l"): string {
  return t
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/1/g, uno)
    .replace(/[!|]/g, uno);
}

/** Largo en caracteres (no en unidades UTF-16: un emoji cuenta como uno). */
export function largoClave(clave: string): number {
  return [...clave.normalize("NFKC")].length;
}

/** Formas en que una contraseña débil se disfraza: se prueban todas contra la lista. */
function candidatas(clave: string): Set<string> {
  const base = normalizar(clave);
  const salida = new Set<string>();
  const recortes = [
    base,
    base.replace(/[^a-z]+$/, ""),
    base.replace(/^[^a-z]+/, ""),
    base.replace(/^[^a-z]+|[^a-z]+$/g, ""),
  ];
  for (const r of recortes) {
    for (const v of [r, r.replace(/[^a-z0-9]/g, ""), sinSustituciones(r, "i"), sinSustituciones(r, "l")]) {
      if (v.length >= 4) salida.add(v);
      const limpia = v.replace(/[^a-z]/g, "");
      if (limpia.length >= 4) salida.add(limpia);
    }
  }
  return salida;
}

/** Palabras del contexto (el sitio, el correo, el nombre) que no deben aparecer dentro de la contraseña. */
function palabrasDeContexto({ correo, nombre }: ContextoClave): string[] {
  const palabras = new Set(["otea", "austral"]);
  const piezas: string[] = [];
  if (correo) {
    const [local = "", dominio = ""] = normalizar(correo).split("@");
    piezas.push(local, ...local.split(/[^a-z0-9]+/), dominio.split(".")[0] ?? "");
  }
  if (nombre) piezas.push(...normalizar(nombre).split(/[^a-z0-9]+/));
  for (const p of piezas) {
    const limpia = p.replace(/[^a-z0-9]/g, "");
    // Con menos de 4 caracteres habría falsos rechazos («ana», «jo»); la lista cubre lo corto y común.
    if (limpia.length >= 4) palabras.add(limpia);
  }
  return [...palabras];
}

/** Hileras del teclado y del abecedario que se recorren en línea recta. Se comprueban también al revés. */
const SECUENCIAS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
  "qazwsxedcrfvtgbyhnujmikolp",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
  "qweasdzxc",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
].flatMap((s) => [s, [...s].reverse().join("")]);

/** Parte de la contraseña (0 a 1) que es una secuencia de las anteriores o de caracteres consecutivos. */
function cobertura(texto: string): number {
  const s = [...texto.replace(/\s/g, "")];
  if (s.length === 0) return 0;
  const cubierto = new Array<boolean>(s.length).fill(false);
  const marcar = (desde: number, largo: number) => {
    for (let k = desde; k < desde + largo; k++) cubierto[k] = true;
  };
  for (const secuencia of SECUENCIAS) {
    for (let i = 0; i < s.length; i++) {
      for (let j = 0; j < secuencia.length; j++) {
        let largo = 0;
        while (i + largo < s.length && j + largo < secuencia.length && s[i + largo] === secuencia[j + largo]) largo++;
        if (largo >= 4) marcar(i, largo);
      }
    }
  }
  // Caracteres consecutivos en el código (abcd, 4567, ihgf…), sea cual sea el alfabeto.
  for (const paso of [1, -1]) {
    let inicio = 0;
    for (let i = 1; i <= s.length; i++) {
      const sigue = i < s.length && s[i].codePointAt(0)! - s[i - 1].codePointAt(0)! === paso;
      if (!sigue) {
        if (i - inicio >= 4) marcar(inicio, i - inicio);
        inicio = i;
      }
    }
  }
  return cubierto.filter(Boolean).length / s.length;
}

function esRepeticion(texto: string): boolean {
  const s = [...texto];
  if (new Set(s).size < 5) return true;
  for (let bloque = 1; bloque <= s.length / 2; bloque++) {
    if (s.length % bloque !== 0) continue;
    const parte = s.slice(0, bloque).join("");
    if (parte.repeat(s.length / bloque) === s.join("")) return true;
  }
  return false;
}

/** `null` si la contraseña sirve; si no, el motivo por el que se rechaza. */
export function evaluarClave(clave: string, contexto: ContextoClave = {}): MotivoClave | null {
  const largo = largoClave(clave);
  if (largo < LARGO_MIN_CLAVE) return "corta";
  if (largo > LARGO_MAX_CLAVE) return "larga";

  const normal = normalizar(clave);
  const compacta = normal.replace(/[^a-z0-9]/g, "");
  if (palabrasDeContexto(contexto).some((p) => compacta.includes(p))) return "contexto";
  for (const candidata of candidatas(clave)) if (COMUNES.has(candidata)) return "comun";
  if (esRepeticion(normal)) return "repetitiva";
  if (cobertura(normal) >= 0.6) return "secuencia";
  return null;
}

/** Cuántas entradas tiene la lista de contraseñas comunes (para documentarlo y para la prueba que la vigila). */
export const TAMANO_LISTA_COMUN = COMUNES.size;
