/**
 * Políticas de entrada del asistente: qué se hace con una pregunta ANTES de buscarle respuesta o de gastar una
 * llamada a un modelo. Todo es léxico y barato; no sustituye a las defensas de estructura (el modelo no tiene
 * herramientas ni secretos, ve solo texto público y su salida se revisa frase por frase), solo evita gastar y
 * exponerse de más.
 *
 * - Una pregunta con datos personales no se responde ni se envía a ningún proveedor: se pide reescribirla.
 * - Pedir consejo de inversión o un pronóstico tiene respuesta fija (la de la base): Otea no lo hace.
 * - Un intento evidente de cambiarle las instrucciones recibe una negativa fija.
 */
import { MAX_PREGUNTA } from "./limites";
import { normalizar } from "./texto";

export type Limpieza = { ok: true; texto: string } | { ok: false; motivo: "vacia" | "larga" };

// Controles, separadores de línea y párrafo, marcas de dirección (bidi) y de ancho cero: no aportan al
// significado y sirven para esconder instrucciones o confundir lo que se muestra.
const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/gu;

/** Texto de la persona sin invisibles, con los espacios normalizados y sin pasarse del largo permitido. */
export function limpiarPregunta(bruta: string): Limpieza {
  const texto = bruta.normalize("NFKC").replace(INVISIBLES, "").replace(/\s+/g, " ").trim();
  if (texto === "") return { ok: false, motivo: "vacia" };
  if (texto.length > MAX_PREGUNTA) return { ok: false, motivo: "larga" };
  return { ok: true, texto };
}

export type Intencion = "saludo" | "cortesia" | "datos_personales" | "inyeccion" | "consejo" | "prediccion" | "normal";

const SALUDOS = new Set(["hola", "buenas", "buenos", "dias", "tardes", "noches", "hey", "saludos", "holi", "ola"]);
const CORTESIAS = new Set([
  "gracias", "muchas", "mil", "chao", "chau", "adios", "ok", "okay", "vale", "listo", "genial", "perfecto", "excelente",
  "entiendo", "entendido", "bien", "bueno", "super", "buena", "hasta", "luego", "pronto",
]);

const CORREO = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}\s?-\s?[\dkK]\b/;
// Nueve dígitos o más, aunque vengan separados por espacios, puntos o guiones: teléfonos, tarjetas, cuentas.
const NUMERO_LARGO = /(?:\d[\s().-]?){9,}/;

/** ¿Trae un correo, un RUT o un número largo (teléfono, tarjeta, cuenta)? */
export function contieneDatosPersonales(texto: string): boolean {
  return CORREO.test(texto) || RUT.test(texto) || NUMERO_LARGO.test(texto);
}

// Se comprueban sobre el texto normalizado (sin tildes ni signos, en minúsculas).
const INYECCION: readonly RegExp[] = [
  /\b(ignora|ignorar|ignores|olvida|olvidate|desobedece)\b.*\b(instrucciones|reglas|indicaciones|restricciones|limites|anterior|anteriores|prompt)\b/,
  /\b(ignore|disregard|forget|override)\b.*\b(instructions|rules|previous|prior|above|prompt|system)\b/,
  /\b(system prompt|developer message|prompt del sistema|prompt inicial|mensaje del sistema|instrucciones del sistema|instrucciones internas|instrucciones ocultas)\b/,
  /\b(tus|sus|vuestras) (instrucciones|reglas|directrices|indicaciones|restricciones)\b/,
  /\b(muestra|muestrame|revela|revelame|repite|imprime|copia|filtra|dime|dame)\b.*\b(prompt|api key|apikey|secretos?|variables de entorno|contrasena)\b/,
  /\b(actua|actuaras|finge|fingir|simula|simular|imagina|pretende|comportate) (como|ser|que eres)\b/,
  /\bhazte pasar por\b/,
  /\b(eres ahora|ahora eres|a partir de ahora|desde ahora)\b.*\b(eres|seras|actuaras|responderas|ignoraras)\b/,
  /\b(modo desarrollador|modo dios|modo sin|developer mode|jailbreak|do anything now|dan mode)\b/,
  /\bsin (restricciones|filtros|limites|censura|reglas)\b/,
];
// Las etiquetas con que se arma el mensaje al modelo: nadie legítimo las escribe.
const ETIQUETAS_PROPIAS = /<\s*\/?\s*(contexto|pregunta|preguntas_anteriores|system|sistema|instrucciones?)\b/i;

/** ¿Intenta cambiar las instrucciones del asistente o hacerle revelar las suyas? */
export function pareceInyeccion(texto: string): boolean {
  if (ETIQUETAS_PROPIAS.test(texto)) return true;
  const t = normalizar(texto);
  return INYECCION.some((patron) => patron.test(t));
}

const VERBOS_DE_CONSEJO = new Set([
  "debo", "deberia", "deberiamos", "conviene", "convendria", "recomiendas", "recomienda", "recomiendan", "recomendarias",
  "recomendaria", "aconsejas", "aconseja", "aconsejan", "aconsejarias", "sugieres", "sugiere", "sugieren",
]);
const ACCIONES = new Set([
  "comprar", "compro", "comprarias", "compraria", "vender", "vendo", "venderias", "venderia", "invertir", "invierto",
  "apostar", "apuesto", "mantener", "adquirir", "liquidar",
]);
const CONSEJO_DIRECTO: readonly RegExp[] = [
  /\b(que|cual|cuales) (acciones|activos|monedas|criptos?|fondos|etfs?|valores|papeles)\b.*\b(compro|vendo|comprar|vender|invierto|invertir)\b/,
  /\b(que|en que|donde) (compro|vendo|invierto|invertir|puedo invertir|deberia invertir)\b/,
  /\bvale la pena (comprar|vender|invertir)\b/,
  /\b(buen|mal|mejor) momento (para|de) (comprar|vender|invertir|entrar|salir)\b/,
];

/** ¿Pide que le digan qué comprar, vender o en qué invertir? (Otea no da recomendaciones personales.) */
export function pideConsejo(texto: string): boolean {
  const t = normalizar(texto);
  if (CONSEJO_DIRECTO.some((patron) => patron.test(t))) return true;
  const palabras = t.split(" ");
  return palabras.some((p) => VERBOS_DE_CONSEJO.has(p)) && palabras.some((p) => ACCIONES.has(p));
}

const PRONOSTICO: readonly RegExp[] = [
  /\bva a (subir|bajar|caer|desplomarse|dispararse|hundirse)\b/,
  /\b(subira|bajara|caera|valdra|se disparara|se desplomara|se hundira)\b/,
  /\b(cuanto|hasta cuanto|a cuanto) (va a|podria|puede) (subir|bajar|llegar|caer|valer)\b/,
  /\b(prediccion|predicciones|predices|predecir|pronostico|pronosticos|pronosticas|precio objetivo)\b.*\b(de|del|para|sobre)\b/,
];
// Sin un activo o un mercado de por medio, «va a subir» puede ser cualquier cosa (el precio del servicio).
const MERCADO = /\b(cobre|petroleo|crudo|gas|oro|litio|dolar|euro|peso|bitcoin|cripto|accion|acciones|bolsa|mercado|ipsa|nasdaq|tasa|tasas|chips|semiconductores)\b/;

/** ¿Pide un pronóstico de precios? (Otea describe efectos posibles, no adivina.) */
export function pidePronostico(texto: string): boolean {
  const t = normalizar(texto);
  return PRONOSTICO.some((patron) => patron.test(t)) && MERCADO.test(t);
}

/** Clasifica la pregunta para decidir cómo se responde. El orden importa: lo más sensible primero. */
export function clasificar(pregunta: string): Intencion {
  if (contieneDatosPersonales(pregunta)) return "datos_personales";
  if (pareceInyeccion(pregunta)) return "inyeccion";
  const palabras = normalizar(pregunta).split(" ").filter(Boolean);
  if (palabras.length > 0 && palabras.length <= 4) {
    if (palabras.every((p) => SALUDOS.has(p))) return "saludo";
    if (palabras.every((p) => SALUDOS.has(p) || CORTESIAS.has(p))) {
      return palabras.some((p) => SALUDOS.has(p)) ? "saludo" : "cortesia";
    }
  }
  if (pideConsejo(pregunta)) return "consejo";
  if (pidePronostico(pregunta)) return "prediccion";
  return "normal";
}
