/**
 * Código QR (ISO/IEC 18004, modelo 2) para entregar el secreto de la verificación en dos pasos a la app de autenticación
 * sin que la persona tenga que copiarlo a mano.
 *
 * Se genera aquí, en el servidor y sin dependencias, para que el secreto no pase por una librería de terceros ni por
 * ningún servicio externo (hay generadores de QR en línea: mandarles el secreto sería entregarlo). Solo lo necesario:
 * modo de bytes (UTF-8), corrección de errores nivel M (≈ 15 %) y versiones 1 a 20 (hasta 666 bytes). La prueba
 * (`qr.test.ts`) fija casos conocidos; la lectura con un decodificador independiente se comprobó a mano (ver `docs/cuentas.md`).
 *
 * Referencia del algoritmo: la especificación y la explicación pública de Project Nayuki («QR Code generator library»,
 * licencia MIT), de la que se toman las tablas y la forma de la penalización de máscaras.
 */

/** Nivel M: bits del indicador de formato y tablas por versión (índice = versión; el 0 no se usa). */
const BITS_FORMATO_M = 0;
const ECC_POR_BLOQUE = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOQUES = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
export const VERSION_MAXIMA = 20;

const PENALIZACION = { n1: 3, n2: 3, n3: 40, n4: 10 } as const;

export class QrDemasiadoLargo extends Error {
  constructor() {
    super("El texto no cabe en un código QR de la versión 20 (nivel M).");
    this.name = "QrDemasiadoLargo";
  }
}

export type Qr = {
  version: number;
  /** Lado en módulos (sin zona de silencio). */
  tamano: number;
  /** `modulos[fila][columna]`: `true` es un módulo oscuro. */
  modulos: boolean[][];
  mascara: number;
};

const bit = (valor: number, i: number) => ((valor >>> i) & 1) !== 0;

function modulosDeDatosEnBruto(version: number): number {
  let resultado = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineaciones = Math.floor(version / 7) + 2;
    resultado -= (25 * alineaciones - 10) * alineaciones - 55;
    if (version >= 7) resultado -= 36;
  }
  return resultado;
}

/** Palabras de código de datos que caben en una versión (nivel M). */
function capacidadDeDatos(version: number): number {
  return Math.floor(modulosDeDatosEnBruto(version) / 8) - ECC_POR_BLOQUE[version] * BLOQUES[version];
}

function posicionesDeAlineacion(version: number): number[] {
  if (version === 1) return [];
  const cantidad = Math.floor(version / 7) + 2;
  const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (cantidad * 2 - 2)) * 2;
  const resultado = [6];
  for (let pos = version * 4 + 10; resultado.length < cantidad; pos -= paso) resultado.splice(1, 0, pos);
  return resultado;
}

// ── Reed–Solomon sobre GF(256) con el polinomio 0x11D ──────────────────────

function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisorRs(grado: number): number[] {
  const resultado = new Array<number>(grado).fill(0);
  resultado[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < grado; j++) {
      resultado[j] = multiplicar(resultado[j], raiz);
      if (j + 1 < grado) resultado[j] ^= resultado[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return resultado;
}

function restoRs(datos: readonly number[], divisor: readonly number[]): number[] {
  const resultado = divisor.map(() => 0);
  for (const b of datos) {
    const factor = b ^ resultado.shift()!;
    resultado.push(0);
    divisor.forEach((coef, i) => {
      resultado[i] ^= multiplicar(coef, factor);
    });
  }
  return resultado;
}

// ── Datos ──────────────────────────────────────────────────────────────────

function bitsDeDatos(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const agregar = (valor: number, cantidad: number) => {
    for (let i = cantidad - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  agregar(0b0100, 4); // modo de bytes
  agregar(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) agregar(b, 8);
  return bits;
}

function palabrasDeDatos(bytes: Uint8Array, version: number): number[] {
  const capacidadBits = capacidadDeDatos(version) * 8;
  const bits = bitsDeDatos(bytes, version);
  for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0); // terminador
  while (bits.length % 8 !== 0) bits.push(0);
  const palabras: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    palabras.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }
  for (let relleno = 0xec; palabras.length < capacidadDeDatos(version); relleno ^= 0xec ^ 0x11) palabras.push(relleno);
  return palabras;
}

/** Agrega la corrección de errores a cada bloque y entrelaza los bloques. */
function conCorreccion(datos: readonly number[], version: number): number[] {
  const bloques = BLOQUES[version];
  const largoEcc = ECC_POR_BLOQUE[version];
  const palabrasTotales = Math.floor(modulosDeDatosEnBruto(version) / 8);
  const bloquesCortos = bloques - (palabrasTotales % bloques);
  const largoCorto = Math.floor(palabrasTotales / bloques);
  const divisor = divisorRs(largoEcc);
  const lista: number[][] = [];
  for (let i = 0, k = 0; i < bloques; i++) {
    const trozo = datos.slice(k, k + largoCorto - largoEcc + (i < bloquesCortos ? 0 : 1));
    k += trozo.length;
    const ecc = restoRs(trozo, divisor);
    if (i < bloquesCortos) trozo.push(0);
    lista.push(trozo.concat(ecc));
  }
  const resultado: number[] = [];
  for (let i = 0; i < lista[0].length; i++) {
    lista.forEach((bloque, j) => {
      if (i !== largoCorto - largoEcc || j >= bloquesCortos) resultado.push(bloque[i]);
    });
  }
  return resultado;
}

// ── Dibujo ─────────────────────────────────────────────────────────────────

class Lienzo {
  readonly modulos: boolean[][];
  readonly esFuncion: boolean[][];

  constructor(
    readonly version: number,
    readonly tamano: number,
  ) {
    this.modulos = Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false));
    this.esFuncion = Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false));
  }

  poner(x: number, y: number, oscuro: boolean) {
    this.modulos[y][x] = oscuro;
    this.esFuncion[y][x] = true;
  }

  dibujarPatronesDeFuncion() {
    const { tamano, version } = this;
    for (let i = 0; i < tamano; i++) {
      this.poner(6, i, i % 2 === 0);
      this.poner(i, 6, i % 2 === 0);
    }
    this.buscador(3, 3);
    this.buscador(tamano - 4, 3);
    this.buscador(3, tamano - 4);
    const alineaciones = posicionesDeAlineacion(version);
    const n = alineaciones.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) {
          this.alineacion(alineaciones[i], alineaciones[j]);
        }
      }
    }
    this.dibujarFormato(0); // reserva el lugar; se vuelve a dibujar con la máscara elegida
    this.dibujarVersion();
  }

  private buscador(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distancia = Math.max(Math.abs(dx), Math.abs(dy));
        const [xx, yy] = [x + dx, y + dy];
        if (xx >= 0 && xx < this.tamano && yy >= 0 && yy < this.tamano) this.poner(xx, yy, distancia !== 2 && distancia !== 4);
      }
    }
  }

  private alineacion(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.poner(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  dibujarFormato(mascara: number) {
    const datos = (BITS_FORMATO_M << 3) | mascara;
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((datos << 10) | resto) ^ 0x5412;
    const { tamano } = this;
    for (let i = 0; i <= 5; i++) this.poner(8, i, bit(bits, i));
    this.poner(8, 7, bit(bits, 6));
    this.poner(8, 8, bit(bits, 7));
    this.poner(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.poner(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.poner(tamano - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.poner(8, tamano - 15 + i, bit(bits, i));
    this.poner(8, tamano - 8, true); // siempre oscuro
  }

  private dibujarVersion() {
    if (this.version < 7) return;
    let resto = this.version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (this.version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const oscuro = bit(bits, i);
      const a = this.tamano - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.poner(a, b, oscuro);
      this.poner(b, a, oscuro);
    }
  }

  dibujarPalabras(palabras: readonly number[]) {
    const { tamano } = this;
    let i = 0;
    for (let derecha = tamano - 1; derecha >= 1; derecha -= 2) {
      if (derecha === 6) derecha = 5;
      for (let vertical = 0; vertical < tamano; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = derecha - j;
          const haciaArriba = ((derecha + 1) & 2) === 0;
          const y = haciaArriba ? tamano - 1 - vertical : vertical;
          if (!this.esFuncion[y][x] && i < palabras.length * 8) {
            this.modulos[y][x] = bit(palabras[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  aplicarMascara(mascara: number) {
    for (let y = 0; y < this.tamano; y++) {
      for (let x = 0; x < this.tamano; x++) {
        let invertir: boolean;
        switch (mascara) {
          case 0: invertir = (x + y) % 2 === 0; break;
          case 1: invertir = y % 2 === 0; break;
          case 2: invertir = x % 3 === 0; break;
          case 3: invertir = (x + y) % 3 === 0; break;
          case 4: invertir = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invertir = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invertir = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invertir = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.esFuncion[y][x] && invertir) this.modulos[y][x] = !this.modulos[y][x];
      }
    }
  }

  /** Penalización de la especificación (menos es mejor): rachas, bloques de 2×2, patrones parecidos al buscador y equilibrio. */
  penalizacion(): number {
    const { modulos, tamano } = this;
    let total = 0;
    const lineas: boolean[][] = [];
    for (let i = 0; i < tamano; i++) {
      lineas.push(modulos[i]);
      lineas.push(modulos.map((fila) => fila[i]));
    }
    for (const linea of lineas) {
      // N1: rachas de 5 o más módulos iguales.
      let racha = 1;
      for (let i = 1; i <= linea.length; i++) {
        if (i < linea.length && linea[i] === linea[i - 1]) racha++;
        else {
          if (racha >= 5) total += PENALIZACION.n1 + (racha - 5);
          racha = 1;
        }
      }
      // N3: 1:1:3:1:1 con cuatro módulos claros a un lado.
      const texto = linea.map((m) => (m ? "1" : "0")).join("");
      for (const patron of ["10111010000", "00001011101"]) {
        for (let desde = texto.indexOf(patron); desde !== -1; desde = texto.indexOf(patron, desde + 1)) total += PENALIZACION.n3;
      }
    }
    // N2: bloques de 2×2 del mismo color.
    for (let y = 0; y < tamano - 1; y++) {
      for (let x = 0; x < tamano - 1; x++) {
        const c = modulos[y][x];
        if (c === modulos[y][x + 1] && c === modulos[y + 1][x] && c === modulos[y + 1][x + 1]) total += PENALIZACION.n2;
      }
    }
    // N4: equilibrio entre oscuros y claros.
    const oscuros = modulos.reduce((suma, fila) => suma + fila.filter(Boolean).length, 0);
    const cuadrados = tamano * tamano;
    total += (Math.ceil(Math.abs(oscuros * 20 - cuadrados * 10) / cuadrados) - 1) * PENALIZACION.n4;
    return total;
  }
}

/**
 * Genera el código QR de un texto (UTF-8). Lanza `QrDemasiadoLargo` si no cabe en la versión 20. `mascara` fuerza una de
 * las ocho máscaras (solo para pruebas); por omisión se elige la de menor penalización.
 */
export function crearQr(texto: string, { mascara: forzada }: { mascara?: number } = {}): Qr {
  const bytes = new TextEncoder().encode(texto);
  let version = 1;
  const necesarios = (v: number) => Math.ceil((4 + (v <= 9 ? 8 : 16) + bytes.length * 8) / 8);
  while (version <= VERSION_MAXIMA && necesarios(version) > capacidadDeDatos(version)) version++;
  if (version > VERSION_MAXIMA) throw new QrDemasiadoLargo();

  const palabras = conCorreccion(palabrasDeDatos(bytes, version), version);
  const tamano = version * 4 + 17;

  let mejor: { mascara: number; modulos: boolean[][]; penalizacion: number } | undefined;
  for (let mascara = forzada ?? 0; mascara < (forzada === undefined ? 8 : forzada + 1); mascara++) {
    const lienzo = new Lienzo(version, tamano);
    lienzo.dibujarPatronesDeFuncion();
    lienzo.dibujarPalabras(palabras);
    lienzo.aplicarMascara(mascara);
    lienzo.dibujarFormato(mascara);
    const penalizacion = lienzo.penalizacion();
    if (!mejor || penalizacion < mejor.penalizacion) mejor = { mascara, modulos: lienzo.modulos, penalizacion };
  }
  return { version, tamano, modulos: mejor!.modulos, mascara: mejor!.mascara };
}

/**
 * Los módulos oscuros como el trazo de un solo `<path>` de SVG (una franja por cada racha horizontal), con una zona de
 * silencio de 4 módulos alrededor, como pide la especificación. Se dibuja con JSX, no con HTML armado a mano.
 */
export function rutaSvgQr(qr: Qr, zonaDeSilencio = 4): { ruta: string; lado: number } {
  const partes: string[] = [];
  qr.modulos.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      if (!fila[x]) continue;
      let ancho = 1;
      while (x + ancho < fila.length && fila[x + ancho]) ancho++;
      partes.push(`M${x + zonaDeSilencio} ${y + zonaDeSilencio}h${ancho}v1h-${ancho}z`);
      x += ancho - 1;
    }
  });
  return { ruta: partes.join(""), lado: qr.tamano + zonaDeSilencio * 2 };
}

/** El código QR de un enlace listo para dibujar, o `null` si el enlace no cabe (queda el secreto escrito, que también sirve). */
export function qrParaEnlace(enlace: string): { ruta: string; lado: number } | null {
  try {
    return rutaSvgQr(crearQr(enlace));
  } catch (e) {
    if (e instanceof QrDemasiadoLargo) return null;
    throw e;
  }
}
