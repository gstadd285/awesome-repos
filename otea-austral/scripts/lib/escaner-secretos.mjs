// Escáner de secretos: busca claves, tokens y credenciales en los archivos del
// repositorio y en todo su historial de git. Lo usan `scripts/escanear-secretos.mjs`
// (CLI y CI) y las pruebas.
//
// Es un escáner propio de patrones de ALTA SEÑAL: pocos falsos positivos a
// cambio de no ver todo (no detecta cualquier secreto de alta entropía). No
// sustituye al «Secret scanning» y la «Push protection» de GitHub, que la
// persona responsable debe activar (ver SECURITY.md). Nunca imprime el valor
// completo de lo que encuentra: los registros de la CI son visibles.
import { execFile, spawn } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

/** Una línea que contiene esta marca se ignora (úsala con un motivo, junto al valor). */
export const MARCA_IGNORAR = "escaner:ignorar";

const MAX_BYTES_ARCHIVO = 1_000_000;
const MAX_LARGO_LINEA = 10_000;
/** Pruebas y e2e usan valores falsos a propósito: solo se les aplican las reglas de proveedor. */
const ES_PRUEBA = /(\.test\.[cm]?[jt]sx?|\.spec\.[cm]?[jt]s|(^|\/)e2e\/)/;
const BINARIO = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|br)$/i;

/** @typedef {{ regla: string, ruta: string, linea: number, commit?: string, vista: string }} Hallazgo */

/** Entropía de Shannon en bits por carácter. */
export function entropia(texto) {
  if (texto.length === 0) return 0;
  const frecuencias = new Map();
  for (const c of texto) frecuencias.set(c, (frecuencias.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of frecuencias.values()) {
    const p = n / texto.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Valores de ejemplo que no son secretos: `CLAVE`, `<clave>`, `${VAR}`, `xxxx`, `...`. */
export function esMarcador(valor) {
  const v = valor.trim();
  return (
    v === "" ||
    /^[A-Z][A-Z0-9_]*$/.test(v) ||
    /^<[^>]*>$/.test(v) ||
    /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(v) ||
    /^[*x.…_-]+$/i.test(v) ||
    /(ejemplo|example|changeme|placeholder|tu[-_]?clave|your[-_]?(key|token|secret)|dummy)/i.test(v)
  );
}

const ANFITRIONES_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "db"]);

/**
 * @typedef {{
 *   id: string,
 *   descripcion: string,
 *   patron: RegExp,
 *   valor?: (m: RegExpMatchArray) => string,
 *   validar?: (m: RegExpMatchArray) => boolean,
 *   tambienEnPruebas?: boolean,
 * }} Regla
 */

/** @type {Regla[]} */
export const REGLAS = [
  {
    id: "llave-privada",
    descripcion: "Llave privada (PEM, OpenSSH, PGP)",
    patron: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
    tambienEnPruebas: true,
  },
  {
    id: "aws",
    descripcion: "Clave de acceso de AWS",
    patron: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/,
    tambienEnPruebas: true,
  },
  {
    id: "github",
    descripcion: "Token de GitHub",
    patron: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b/,
    tambienEnPruebas: true,
  },
  {
    id: "google",
    descripcion: "Clave de API de Google",
    patron: /\bAIza[0-9A-Za-z_-]{35}\b/,
    tambienEnPruebas: true,
  },
  {
    id: "google-cuenta-de-servicio",
    descripcion: "Archivo de cuenta de servicio de Google Cloud",
    patron: /"private_key_id"\s*:\s*"[0-9a-f]{20,}"/,
    tambienEnPruebas: true,
  },
  {
    id: "slack",
    descripcion: "Token de Slack",
    patron: /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    tambienEnPruebas: true,
  },
  {
    id: "stripe",
    descripcion: "Clave secreta de Stripe",
    patron: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/,
    tambienEnPruebas: true,
  },
  {
    id: "resend",
    descripcion: "Clave de API de Resend",
    patron: /\bre_[A-Za-z0-9]{6,12}_[A-Za-z0-9]{20,40}\b/,
    tambienEnPruebas: true,
  },
  {
    id: "anthropic-openai",
    descripcion: "Clave de API de un proveedor de IA",
    patron: /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9]{40,})\b/,
    tambienEnPruebas: true,
  },
  {
    id: "jwt",
    descripcion: "Token JWT",
    patron: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    tambienEnPruebas: true,
  },
  {
    id: "hash-del-panel",
    descripcion: "Hash de la frase del panel con forma real (ADMIN_CLAVE_HASH)",
    patron: /\bpbkdf2-sha256\$\d{6,7}\$[A-Za-z0-9_-]{22,}\$[A-Za-z0-9_-]{43}\b/,
  },
  {
    id: "url-con-clave",
    descripcion: "URL de base de datos o servicio con usuario y clave reales",
    patron: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@([^\s/'"`:?]+)/i,
    valor: (m) => m[2],
    validar: (m) => {
      const [, , clave, anfitrion] = m;
      return clave.length >= 8 && !esMarcador(clave) && !ANFITRIONES_LOCALES.has(anfitrion.toLowerCase());
    },
    tambienEnPruebas: true,
  },
  {
    id: "asignacion-sospechosa",
    descripcion: "Variable de secreto con un valor que parece una clave",
    // NOMBRE_CON_SECRETO = valor (sin puntos ni paréntesis: así no se confunde con código como `process.env.X`).
    patron:
      /\b[A-Za-z0-9_.-]*(?:SECRET|SECRETO|TOKEN|PASSWORD|PASSWD|PASSPHRASE|API[_-]?KEY|PRIVATE[_-]?KEY|CLAVE|CONTRASE[ÑN]A)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{20,})["']?/i,
    valor: (m) => m[1],
    validar: (m) => {
      const v = m[1];
      return !esMarcador(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && entropia(v) >= 3.5;
    },
  },
];

/**
 * @param {string} linea
 * @param {string} ruta
 * @returns {{ regla: string, vista: string }[]}
 */
export function escanearLinea(linea, ruta) {
  if (linea.length > MAX_LARGO_LINEA || linea.includes(MARCA_IGNORAR)) return [];
  const enPrueba = ES_PRUEBA.test(ruta);
  const hallazgos = [];
  for (const regla of REGLAS) {
    if (enPrueba && !regla.tambienEnPruebas) continue;
    const m = linea.match(regla.patron);
    if (!m) continue;
    if (regla.validar && !regla.validar(m)) continue;
    hallazgos.push({ regla: regla.id, vista: redactar(regla.valor ? regla.valor(m) : m[0]) });
  }
  return hallazgos;
}

/** Muestra solo el comienzo y el largo: el valor completo no sale del escáner. */
export function redactar(valor) {
  const inicio = valor.slice(0, 4).replace(/[^\x20-\x7e]/g, "?");
  return `${inicio}… (${valor.length} caracteres)`;
}

/**
 * @param {string} texto
 * @param {string} ruta
 * @returns {Hallazgo[]}
 */
export function escanearTexto(texto, ruta) {
  /** @type {Hallazgo[]} */
  const hallazgos = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const h of escanearLinea(linea, ruta)) hallazgos.push({ ...h, ruta, linea: i + 1 });
  });
  return hallazgos;
}

/** Carpeta superior del repositorio que contiene `desde`. */
export async function raizDelRepositorio(desde = process.cwd()) {
  const { stdout } = await ejecutar("git", ["rev-parse", "--show-toplevel"], { cwd: desde });
  return stdout.trim();
}

async function esBinario(archivo) {
  const f = await open(archivo, "r");
  try {
    const { buffer, bytesRead } = await f.read(Buffer.alloc(8192), 0, 8192, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await f.close();
  }
}

/**
 * Archivos versionados o nuevos (no ignorados) del árbol de trabajo.
 * @param {string} raiz
 * @returns {Promise<Hallazgo[]>}
 */
export async function escanearArbol(raiz) {
  const { stdout } = await ejecutar("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: raiz,
    maxBuffer: 64 * 1024 * 1024,
  });
  const rutas = [...new Set(stdout.split("\0").filter(Boolean))];
  /** @type {Hallazgo[]} */
  const hallazgos = [];
  for (const ruta of rutas) {
    if (BINARIO.test(ruta)) continue;
    const archivo = path.join(raiz, ruta);
    try {
      const contenido = await readFile(archivo);
      if (contenido.length > MAX_BYTES_ARCHIVO || (await esBinario(archivo))) continue;
      hallazgos.push(...escanearTexto(contenido.toString("utf8"), ruta));
    } catch (error) {
      // Versionado pero borrado del disco: no hay nada que leer.
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return hallazgos;
}

/**
 * Líneas añadidas en cualquier commit de cualquier rama o etiqueta. Un secreto
 * que alguna vez estuvo en el historial sigue ahí aunque se haya borrado después.
 * (No mira los mensajes de commit ni lo que solo introduce una fusión.)
 *
 * @param {string} raiz
 * @returns {Promise<Hallazgo[]>}
 */
export async function escanearHistorial(raiz) {
  /** @type {Hallazgo[]} */
  const hallazgos = [];
  const git = spawn(
    "git",
    ["log", "--all", "--no-color", "--no-renames", "--no-ext-diff", "-p", "-U0", "--pretty=format:@@@%H"],
    { cwd: raiz, stdio: ["ignore", "pipe", "pipe"] },
  );
  let errores = "";
  git.stderr.on("data", (d) => (errores += d));
  const terminado = new Promise((resolve, reject) => {
    git.on("error", reject);
    git.on("close", (codigo) => (codigo === 0 ? resolve(undefined) : reject(new Error(`git log falló: ${errores.trim()}`))));
  });

  let commit = "";
  let ruta = "";
  let linea = 0;
  const lector = createInterface({ input: git.stdout, crlfDelay: Infinity });
  for await (const texto of lector) {
    if (texto.startsWith("@@@")) {
      commit = texto.slice(3, 10);
    } else if (texto.startsWith("+++ ")) {
      ruta = texto.startsWith("+++ b/") ? texto.slice(6) : "";
    } else if (texto.startsWith("@@ ")) {
      const m = texto.match(/\+(\d+)/);
      linea = m ? Number(m[1]) : 0;
    } else if (texto.startsWith("+") && ruta && !BINARIO.test(ruta)) {
      for (const h of escanearLinea(texto.slice(1), ruta)) hallazgos.push({ ...h, ruta, linea, commit });
      linea += 1;
    }
  }
  await terminado;
  return hallazgos;
}

/** @param {Hallazgo} h */
export function describirHallazgo(h) {
  const donde = `${h.ruta}:${h.linea}`;
  return `  [${h.regla}] ${donde}${h.commit ? ` (commit ${h.commit})` : ""}  ${h.vista}`;
}
