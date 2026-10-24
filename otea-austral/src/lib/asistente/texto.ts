/**
 * Utilidades de texto en español para la recuperación y las políticas del asistente: sin tildes, sin
 * mayúsculas, sin palabras vacías y con una raíz corta que une «confianza» y «confiable», «verificamos» y
 * «verificación». No pretende ser un lematizador: la base de conocimiento es pequeña y está curada.
 */

/** Minúsculas, sin tildes ni signos; las palabras separadas por un espacio. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Palabras que no ayudan a encontrar nada (ya sin tildes). «no» y «sin» se conservan: cambian el sentido.
export const PALABRAS_VACIAS: ReadonlySet<string> = new Set([
  "a", "al", "algo", "ante", "aqui", "asi", "aun", "aunque", "buenas", "cada", "como", "con", "contra",
  "cual", "cuales", "cuando", "cuanta", "cuanto", "de", "del", "desde", "donde", "dos", "el", "ella", "ellas",
  "ello", "ellos", "en", "entre", "era", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estan", "estas",
  "este", "esto", "estos", "favor", "fue", "gracias", "ha", "hace", "hacen", "hacer", "hay", "hola",
  "informacion", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mis", "muy", "ni", "nos", "o",
  "otra", "otras", "otro", "otros", "para", "pasa", "pasan", "pasar", "pero", "por", "porque", "puede",
  "pueden", "puedo", "que", "quien", "quienes", "quiero", "quisiera", "saber", "se", "ser", "si", "sobre",
  "son", "su", "sus", "te", "tiene", "tienen", "todo", "tu", "tus", "un", "una", "unas", "uno", "unos", "va",
  "y", "ya", "yo",
]);

/**
 * Raíz corta: sin plural («fuentes» y «fuente» coinciden; «reales» y «real», también), sin la «n» del verbo en
 * plural («ganan» y «gana») y con las 6 primeras letras, que bastan para unir «confianza» y «confiable» o
 * «verificamos» y «verificación».
 */
export function raiz(palabra: string): string {
  if (palabra.length <= 4) return palabra;
  return palabra
    .replace(/(ar|er|ir)(los|las|lo|la|les|le|nos|me|te|se)$/, "$1")
    .replace(/([lrndzjy])es$/, "$1")
    .replace(/s$/, "")
    .replace(/([ae])n$/, "$1")
    .slice(0, 6);
}

/** Raíces de las palabras con contenido de un texto, en el orden en que aparecen y con repeticiones. */
export function raices(texto: string): string[] {
  const resultado: string[] = [];
  for (const palabra of normalizar(texto).split(" ")) {
    if (palabra.length < 2 || PALABRAS_VACIAS.has(palabra)) continue;
    resultado.push(raiz(palabra));
  }
  return resultado;
}
