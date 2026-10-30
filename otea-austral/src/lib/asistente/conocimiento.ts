/**
 * Base de conocimiento del asistente: preguntas frecuentes con su respuesta, redactadas a mano o derivadas de
 * los mismos datos que usa el sitio (registro de fuentes, temas, alertas de ejemplo), para que no se
 * desincronicen. Es lo único que el asistente sabe: el modo base la responde tal cual y el modo con IA la usa
 * como contexto y no sale de ella.
 *
 * Reglas (las vigila `conocimiento.test.ts`):
 * - Nada de lenguaje de recomendación ni promesas de rentabilidad (CLAUDE.md, regla 2).
 * - Lo que se diga de la metodología debe coincidir con `rules.ts` (hay pruebas que lo comprueban con la
 *   función real).
 * - Todo lo derivado de alertas de ejemplo dice que es un ejemplo ficticio (regla 3).
 * - No se inventan precios, fechas ni funciones: lo que aún no existe se dice así.
 */
import { DIRECCION_ETIQUETA, CONFIANZA_ETIQUETA, VERIFICACION_ETIQUETA } from "@/components/alert-card/labels";
import { TEMA_DESCRIPCION } from "@/components/home/temas";
import { vistasPortada } from "@/data/ejemplo";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import type { AlertView } from "@/lib/domain/view";
import { fuentesPorAmbito } from "@/lib/sources/registry";
import type { Enlace } from "./limites";

export type Entrada = {
  id: string;
  pregunta: string;
  respuesta: string;
  /** Palabras y giros con los que la gente suele preguntar esto (sinónimos, variantes). */
  etiquetas: readonly string[];
  /** Dónde ver más, dentro del sitio. */
  fuentes: readonly Enlace[];
  /** Habla de alertas de ejemplo. */
  ejemplo?: boolean;
};

const COMO_FUNCIONA: Enlace = { titulo: "Cómo funciona", href: "/#como-funciona" };
const METODOLOGIA: Enlace = { titulo: "Metodología", href: "/metodologia" };
const FUENTES: Enlace = { titulo: "Fuentes", href: "/fuentes" };
const EJEMPLOS: Enlace = { titulo: "Alertas de ejemplo", href: "/#ejemplos" };
const TEMAS_ENLACE: Enlace = { titulo: "Temas", href: "/#temas" };
const LISTA: Enlace = { titulo: "Lista de espera", href: "/#lista-de-espera" };
const PRIVACIDAD: Enlace = { titulo: "Privacidad", href: "/privacidad" };
const SEGURIDAD: Enlace = { titulo: "Seguridad", href: "/seguridad" };
const TERMINOS: Enlace = { titulo: "Condiciones de uso", href: "/terminos" };
const AVISO_LEGAL: Enlace = { titulo: "Aviso legal", href: "/aviso-legal" };

/** Rutas y anclas del sitio a las que puede apuntar una entrada (la prueba comprueba que no haya otras). */
export const ENLACES_PERMITIDOS: readonly string[] = [
  COMO_FUNCIONA, METODOLOGIA, FUENTES, EJEMPLOS, TEMAS_ENLACE, LISTA, PRIVACIDAD, SEGURIDAD, TERMINOS, AVISO_LEGAL,
  { titulo: "Alertas", href: "/alertas" },
].map((e) => e.href);

const curadas: Entrada[] = [
  {
    id: "que-es",
    pregunta: "¿Qué es Otea Austral?",
    respuesta:
      "Otea Austral es una plataforma de inteligencia de eventos para mercados. Te avisa de eventos globales que importan —por ejemplo, una tensión en el estrecho de Ormuz— y explica qué sectores y activos podrían verse afectados: quién gana, quién pierde y bajo qué condición, con su nivel de confianza y sus fuentes. Todavía está en preparación: las alertas que ves en el sitio son ejemplos.",
    etiquetas: [
      "otea", "austral", "plataforma", "producto", "servicio", "sirve", "ofrece", "trata", "de que trata",
      "inteligencia de eventos", "mercados", "sitio", "proyecto",
    ],
    fuentes: [COMO_FUNCIONA],
  },
  {
    id: "como-funciona",
    pregunta: "¿Cómo funciona?",
    respuesta:
      "Cada alerta cuenta un evento y lo que podría implicar: los sectores que podrían ganar, los que podrían perder y los que dependen de una condición, junto con la confianza —calculada desde las fuentes— y los enlaces a esas fuentes. Eliges los temas que sigues y, cuando abramos, recibirás un resumen antes de la apertura del mercado con lo que cambió y qué condición mirar.",
    etiquetas: [
      "funcionamiento", "paso a paso", "como se usa", "como usar", "alertas", "resumen", "pre apertura", "preapertura",
      "avisos", "notificaciones", "recibir", "manana",
    ],
    fuentes: [COMO_FUNCIONA, METODOLOGIA],
  },
  {
    id: "para-quien",
    pregunta: "¿Para quién es Otea Austral?",
    respuesta:
      "Para inversionistas minoristas y traders de Chile y Latinoamérica que quieren entender cómo un evento lejano podría llegar a los precios que importan. Otea explica efectos posibles y sus condiciones; no entrega recomendaciones personales.",
    etiquetas: [
      "publico", "usuarios", "quien puede usar", "inversionistas", "traders", "principiantes", "novatos",
      "experiencia", "chile", "latinoamerica", "latam", "pais", "paises", "region", "extranjero", "audiencia",
      "dirigido", "destinatarios", "operar", "operadores",
    ],
    fuentes: [COMO_FUNCIONA],
  },
  {
    id: "lanzamiento",
    pregunta: "¿Ya está disponible? ¿Cuándo lanzan?",
    respuesta:
      "Todavía no: estamos preparando el lanzamiento y no hay una fecha publicada. Puedes dejar tu correo en la lista de espera, al final de la portada, para que te avisemos cuando abramos. Si la lista aún no está abierta, el formulario lo indica y no se guarda ningún correo.",
    etiquetas: [
      "lanzamiento", "lanzan", "lanzar", "lanzaran", "disponible", "cuando abre", "cuando sale", "fecha", "beta",
      "acceso", "abrir", "abren", "proximamente", "ya funciona", "ya existe", "empieza", "empiezan",
    ],
    fuentes: [LISTA],
  },
  {
    id: "lista-de-espera",
    pregunta: "¿Cómo me uno a la lista de espera?",
    respuesta:
      "Al final de la portada, en «Recibe las alertas primero», escribes tu correo y aceptas las condiciones de uso y el consentimiento para guardarlo. La inscripción se verifica en dos pasos: cuando la lista esté abierta te enviaremos un correo con un enlace para confirmarla (vence a las 72 horas), y sin ese paso no quedas inscrito. Mientras no esté abierta, el formulario avisa que abre pronto y no guarda tu correo.",
    etiquetas: [
      "lista de espera", "inscribirme", "inscripcion", "inscribir", "inscribo", "registrarme", "correo", "email",
      "suscribirme", "unirme", "unir", "confirmar", "enlace de confirmacion", "formulario", "dejar mi correo",
      "dar mi correo", "poner mi correo", "anotarme", "apuntarme", "avisen", "avisarme", "notifiquen",
    ],
    fuentes: [LISTA, TERMINOS, PRIVACIDAD],
  },
  {
    id: "precio",
    pregunta: "¿Cuánto cuesta?",
    respuesta:
      "Todavía no publicamos precios. Cuando existan, los anunciaremos en el sitio.",
    etiquetas: [
      "precio", "precios", "costo", "costos", "cuesta", "gratis", "gratuito", "pago", "pagar", "suscripcion",
      "plan", "planes", "cobran", "cobrar", "cobro", "tarifa", "mensualidad", "premium",
    ],
    fuentes: [LISTA, TERMINOS],
  },
  {
    id: "alertas-de-ejemplo",
    pregunta: "¿Las alertas que veo son reales o de ejemplo?",
    respuesta:
      "No. Son datos de ejemplo: escenarios, organismos y documentos ficticios, con enlaces a example.org. Cada tarjeta lo indica con la etiqueta «Datos de ejemplo». Sirven para mostrar cómo se verá una alerta cuando publiquemos las reales.",
    etiquetas: [
      "reales", "falsas", "ejemplo", "ejemplos", "ficticias", "verdaderas", "de verdad", "simulacion", "demo",
      "datos de ejemplo", "inventadas", "reales o de ejemplo",
    ],
    fuentes: [EJEMPLOS, { titulo: "Alertas", href: "/alertas" }],
  },
  {
    id: "gana-pierde-condicionado",
    pregunta: "¿Qué significan «gana», «pierde» y «condicionado»?",
    respuesta:
      "Son los tres efectos posibles de un evento sobre un sector o un activo. «Gana»: podría beneficiarse. «Pierde»: podría verse presionado. «Condicionado»: el efecto depende de una condición que aún no está clara. Cada fila trae esa condición y su propia confianza. Son efectos posibles, no predicciones ni recomendaciones.",
    etiquetas: [
      "gana", "pierde", "ganan", "pierden", "ganar", "perder", "ganadores", "perdedores", "condicionado",
      "condicionada", "colores", "verde", "rojo", "dorado", "significa", "significado", "direccion", "efecto",
      "beneficia", "perjudica", "afecta", "afectados", "tarjeta", "fila", "condicion", "que quiere decir",
    ],
    fuentes: [EJEMPLOS, METODOLOGIA],
  },
  {
    id: "confianza",
    pregunta: "¿Cómo calculan la confianza de una alerta?",
    respuesta:
      "La confianza no la escribe nadie a mano: se calcula a partir de las fuentes. Es alta si hay al menos una fuente primaria (un comunicado oficial, un dato publicado por el organismo emisor o un documento regulatorio). Es media si hay una fuente secundaria o notas de prensa de dos medios distintos. Es baja si solo hay una nota de prensa o aún no hay fuentes. La prensa sirve para detectar, no para confirmar: con solo prensa nunca supera la media. Cada fila de una alerta puede tener menos confianza que la alerta, pero nunca más.",
    etiquetas: [
      "confianza", "confiable", "nivel de confianza", "alta", "media", "baja", "calcula", "calculan", "calculo",
      "puntaje", "certeza", "fiable", "fiabilidad", "primaria", "primarias", "secundaria", "secundarias",
      "fuente primaria", "fuente secundaria",
    ],
    fuentes: [METODOLOGIA],
  },
  {
    id: "verificacion",
    pregunta: "¿Qué niveles de verificación hay?",
    respuesta:
      "Hay cuatro. «Fuente oficial»: al menos una fuente primaria. «Dos fuentes independientes»: dos organismos distintos (dos documentos del mismo organismo cuentan como uno). «Una fuente»: una sola fuente u organismo. «Sin verificar»: sin fuentes enlazadas.",
    etiquetas: [
      "verificacion", "verifican", "verificar", "verificado", "verificada", "fuente oficial", "dos fuentes",
      "una fuente", "sin verificar", "comprobar", "comprueban", "validan", "validacion", "niveles",
    ],
    fuentes: [METODOLOGIA],
  },
  {
    id: "publicar",
    pregunta: "¿Qué exigen antes de publicar una alerta?",
    respuesta:
      "Toda alerta necesita al menos una fuente enlazada, con título, fecha y organismo. Una de impacto alto exige además dos fuentes de organismos distintos y una aprobación humana registrada después de su última edición. El resumen lo escribe Otea con sus propias palabras: enlazamos las fuentes, no copiamos su texto.",
    etiquetas: [
      "publicar", "publican", "publicacion", "requisitos", "aprobacion", "aprobar", "humana", "revision",
      "editorial", "quien aprueba", "proceso", "revisor", "antes de publicar", "controles",
    ],
    fuentes: [METODOLOGIA],
  },
  {
    id: "impacto",
    pregunta: "¿Qué es el impacto de una alerta?",
    respuesta:
      "Cada alerta tiene un impacto: bajo, medio o alto. Las de impacto alto tienen requisitos extra antes de publicarse: dos fuentes de organismos distintos y una aprobación humana registrada después de su última edición.",
    etiquetas: ["impacto", "impactos", "gravedad", "importancia", "relevancia"],
    fuentes: [METODOLOGIA],
  },
  {
    id: "correcciones",
    pregunta: "¿Qué pasa si una alerta es un error?",
    respuesta:
      "Una alerta publicada no se edita en silencio. Si cambia su contenido, queda marcada como corregida, con la fecha y el texto de la corrección a la vista. Si resulta equivocada, se retracta: sigue visible, tachada y con el aviso de retractación arriba. No borramos alertas, y cada cambio queda en un registro que solo admite agregar filas.",
    etiquetas: [
      "error", "errores", "equivocada", "equivocacion", "equivocan", "corregir", "corrigen", "correccion",
      "correcciones", "corregida", "retractar", "retractacion", "retractada", "borran", "borrar", "borrada",
      "eliminan", "eliminada", "editan", "cambian", "modifican", "actualizan", "rectifican", "fe de erratas",
    ],
    fuentes: [METODOLOGIA],
  },
  {
    id: "prensa",
    pregunta: "¿Usan noticias de prensa?",
    respuesta:
      "La prensa sirve para detectar un evento, no para confirmarlo: una alerta con solo notas de prensa nunca supera la confianza media. Por ahora el registro de fuentes no incluye medios de prensa; se agregarán cuando se aprueben y se confirmen sus condiciones de uso.",
    etiquetas: ["prensa", "noticias", "medios", "diarios", "periodicos", "periodistas", "cables", "notas de prensa"],
    fuentes: [FUENTES, METODOLOGIA],
  },
  {
    id: "asesoria",
    pregunta: "¿Esto es asesoría financiera?",
    respuesta:
      "No. Otea informa y analiza, no aconseja: no te decimos qué comprar ni vender, no prometemos rentabilidad y hablamos de efectos posibles y condiciones («podría…», «si…»). Para una asesoría personalizada, consulta a un profesional autorizado.",
    etiquetas: [
      "asesoria", "asesoramiento", "asesor", "asesores", "financiera", "consejo", "consejos", "advertencia",
      "disclaimer", "profesional", "autorizado",
    ],
    fuentes: [METODOLOGIA, AVISO_LEGAL],
  },
  {
    id: "recomendaciones",
    pregunta: "¿Qué debo comprar o vender? ¿Me recomiendan invertir en algo?",
    respuesta:
      "No podemos decirte qué comprar ni vender: Otea no hace recomendaciones personales. Lo que sí hacemos es explicar qué sectores podrían ganar o perder con un evento y bajo qué condición, con sus fuentes, para que decidas tú.",
    etiquetas: [
      "comprar", "vender", "invertir", "inversion", "recomienda", "recomiendan", "recomendar", "recomendacion",
      "recomendaciones", "aconsejan", "conviene", "debo", "deberia", "acciones", "bitcoin", "cripto", "senal",
      "senales", "que compro", "que vendo", "en que invierto", "oportunidad",
    ],
    fuentes: [METODOLOGIA, AVISO_LEGAL],
  },
  {
    id: "predicciones",
    pregunta: "¿Predicen precios o garantizan resultados?",
    respuesta:
      "No. No prometemos rentabilidad ni adivinamos el futuro: describimos efectos posibles y las condiciones que tendrían que cumplirse. Tampoco publicamos cifras de rendimiento o de aciertos que no podamos respaldar.",
    etiquetas: [
      "predecir", "prediccion", "predicciones", "pronostico", "pronosticos", "prever", "futuro", "garantizan",
      "garantia", "rentabilidad", "ganancias", "aciertan", "aciertos", "adivinan", "subira", "bajara",
    ],
    fuentes: [METODOLOGIA],
  },
  {
    id: "tiempo-real",
    pregunta: "¿Dan precios o cotizaciones en tiempo real?",
    respuesta:
      "No. Otea no es un servicio de cotizaciones: explica eventos y sus posibles efectos, con sus fuentes.",
    etiquetas: [
      "tiempo real", "cotizacion", "cotizaciones", "precio actual", "en vivo", "grafico", "graficos", "datos de mercado",
      "dolar hoy", "cuanto vale",
    ],
    fuentes: [COMO_FUNCIONA],
  },
  {
    id: "datos-personales",
    pregunta: "¿Qué datos guardan de mí?",
    respuesta:
      "El sitio no usa cookies de seguimiento ni analítica; solo hay una cookie técnica de sesión si entras a tu cuenta. De la lista de espera guardaríamos tu correo (cifrado), la fecha y la versión del consentimiento. Si creas una cuenta, guardaríamos además tu contraseña (solo como un hash que no se puede revertir), tus preferencias y, si activas la verificación en dos pasos, el secreto de tu app (cifrado); desde tu perfil puedes descargar todo o eliminar la cuenta. Otea no guarda tu IP ni datos de tu navegador en su base de datos, aunque el proveedor de alojamiento registra cada solicitud, con tu IP, hasta 30 días y solo para seguridad y diagnóstico. No vendemos ni cedemos tus datos. Los proveedores previstos —Google Cloud Run, Neon y Resend— solo reciben lo necesario y tienen servidores en Estados Unidos. La política de privacidad es un texto provisional, pendiente de revisión legal.",
    etiquetas: [
      "datos", "privacidad", "personales", "guardan", "guardar", "cookies", "seguimiento", "analitica", "ip",
      "proteccion de datos", "borrar mis datos", "eliminar mis datos", "borrar mi correo", "derechos",
      "darme de baja", "proveedores", "servidores", "venden", "ceden", "comparten",
    ],
    fuentes: [PRIVACIDAD],
  },
  {
    id: "preguntas-al-asistente",
    pregunta: "¿Qué pasa con las preguntas que hago en esta sección?",
    respuesta:
      "Tu pregunta se usa solo para responderte y no se guarda. Cada respuesta indica cómo se generó: «Pregunta frecuente» viene de textos escritos por el equipo y no sale del sitio; «Respuesta con IA» la redacta un modelo de inteligencia artificial de un proveedor externo a partir de esos mismos textos, y para eso el texto de tu pregunta (sin tu IP) se envía a ese proveedor. Por eso no escribas datos personales. Las respuestas pueden tener errores: revisa las páginas que te indicamos.",
    etiquetas: [
      "asistente", "ia", "inteligencia artificial", "chat", "chatbot", "preguntas", "bot", "robot", "eres", "humano",
      "maquina", "quien lee", "lo que escribo", "conversacion", "modelo", "claude", "anthropic",
    ],
    fuentes: [PRIVACIDAD],
  },
  {
    id: "dos-pasos",
    pregunta: "¿Hay verificación en dos pasos?",
    respuesta:
      "Sí, en tres lugares. Inscribirte en la lista de espera lleva dos pasos: primero dejas tu correo y aceptas los textos y, cuando la lista esté abierta, te enviamos un mensaje con un enlace para confirmarlo (vence a las 72 horas); sin ese segundo paso no quedas inscrito, y así nadie puede inscribir tu correo sin que lo sepas. Crear una cuenta también se hace en dos pasos (confirmas el correo con un enlace y desde ahí eliges tu contraseña), y una vez creada puedes activar, de forma opcional, la verificación en dos pasos al entrar: una app de autenticación genera un código de seis dígitos que cambia cada 30 segundos y te entregamos códigos de recuperación para el día que pierdas el teléfono. Por último, el panel interno del equipo pide una frase de acceso y un código temporal. Si aún no ves la opción «Entrar» en el sitio, las cuentas todavía no están abiertas.",
    etiquetas: [
      "dos pasos", "dos factores", "2fa", "doble confirmacion", "doble verificacion", "verificar mi correo",
      "verificar mi inscripcion", "confirmar mi correo", "confirmar mi inscripcion", "autenticacion", "autenticador",
      "codigo de verificacion", "app de autenticacion", "activar dos pasos", "proteger mi cuenta",
    ],
    fuentes: [LISTA, SEGURIDAD, TERMINOS],
  },
  {
    id: "cuenta",
    pregunta: "¿Puedo crear una cuenta?",
    respuesta:
      "Con una cuenta eliges los temas que sigues y guardas tus preferencias. Se crea en dos pasos: dejas tu correo y aceptas las condiciones de uso y el consentimiento para guardar los datos de tu cuenta, y con el enlace que te enviamos (vence a las 72 horas) eliges tu contraseña; sin ese enlace no se crea la cuenta. Desde tu perfil puedes cambiar la contraseña, activar la verificación en dos pasos, ver y cerrar tus sesiones, descargar tus datos y eliminar la cuenta cuando quieras. Por ahora el correo de una cuenta no se puede cambiar. Si todavía no ves «Entrar» en la cabecera, las cuentas no están abiertas: puedes unirte a la lista de espera.",
    etiquetas: [
      "cuenta", "cuentas", "mi cuenta", "perfil", "mi perfil", "crear cuenta", "crear una cuenta", "abrir una cuenta",
      "iniciar sesion", "inicio de sesion", "login", "ingresar a mi cuenta", "usuario", "registrarse", "cerrar sesion",
      "eliminar mi cuenta", "borrar mi cuenta", "descargar mis datos", "cambiar mi correo",
    ],
    fuentes: [LISTA, TERMINOS, PRIVACIDAD],
  },
  {
    id: "olvide-contrasena",
    pregunta: "¿Qué hago si olvidé mi contraseña?",
    respuesta:
      "En la página «Entrar» elige «¿Olvidaste tu contraseña?», escribe tu correo y, si hay una cuenta con él, te enviamos un enlace para elegir una contraseña nueva. El enlace vale 1 hora y sirve una sola vez, y al cambiar la contraseña se cierran todas tus sesiones. Si activaste la verificación en dos pasos y perdiste tu teléfono, entra con uno de tus códigos de recuperación. Sin la app ni los códigos, esta versión no puede recuperar la cuenta ni cambiar su correo.",
    etiquetas: [
      "olvide mi contrasena", "olvide la contrasena", "olvidaste", "recuperar contrasena", "recuperar mi contrasena",
      "restablecer contrasena", "cambiar contrasena", "cambiar mi contrasena", "perdi mi contrasena", "contrasena olvidada",
      "no recuerdo mi contrasena", "perdi mi telefono", "codigos de recuperacion", "recuperar mi cuenta", "no puedo entrar",
    ],
    fuentes: [SEGURIDAD, PRIVACIDAD],
  },
  {
    id: "seguridad",
    pregunta: "¿Es seguro el sitio?",
    respuesta:
      "En la página de Seguridad publicamos nuestro perfil de ciberseguridad (según el marco NIST CSF 2.0) y cómo reportar de forma privada una vulnerabilidad.",
    etiquetas: [
      "seguro", "seguridad", "ciberseguridad", "hackeo", "hackers", "vulnerabilidad", "vulnerabilidades", "nist",
      "proteccion", "cifrado", "https", "seguro usar",
    ],
    fuentes: [SEGURIDAD],
  },
  {
    id: "reportar",
    pregunta: "¿Cómo reporto un error o un problema?",
    respuesta:
      "Si crees que una alerta tiene un error, revisa las fuentes que enlaza. Si es un problema técnico o de seguridad del sitio, usa el canal privado de la página de Seguridad.",
    etiquetas: [
      "reportar", "reporto", "reporte", "denunciar", "problema", "bug", "falla", "avisar", "aviso", "contacto",
      "contactar", "contacto al equipo", "escribir al equipo", "soporte", "ayuda", "reclamo", "reclamos",
      "no funciona", "funciona mal", "error en el sitio", "error del sitio",
    ],
    fuentes: [SEGURIDAD, FUENTES],
  },
  {
    id: "quien-esta-detras",
    pregunta: "¿Quién está detrás de Otea Austral?",
    respuesta:
      "Otea Austral es un proyecto en desarrollo. Antes de abrir la lista de espera publicaremos en la página de Privacidad la identidad del responsable y una dirección de contacto.",
    etiquetas: [
      "quien esta detras", "responsable", "equipo", "empresa", "fundadores", "creadores", "creo", "hizo",
      "desarrollo", "desarrolla", "autores", "duenos", "quienes son", "detras",
    ],
    fuentes: [PRIVACIDAD],
  },
  {
    id: "textos-legales",
    pregunta: "¿Dónde están las condiciones de uso y el aviso legal?",
    respuesta:
      "Los textos legales (Condiciones de uso, Aviso legal y Privacidad) están en el pie del sitio y son provisionales: están pendientes de revisión legal. Las condiciones de uso explican, entre otras cosas, que Otea informa y no da asesoría financiera, qué esperar de las alertas de ejemplo y del asistente de preguntas, y cómo se usa el sitio.",
    etiquetas: [
      "terminos", "condiciones", "aviso legal", "legal", "legales", "contrato", "licencia", "uso", "derechos de autor",
      "copyright", "politicas",
    ],
    fuentes: [TERMINOS, AVISO_LEGAL],
  },
];

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Los seis temas, con la descripción que ya muestra el selector de temas. */
function entradaTemas(): Entrada {
  const lista = TEMAS.map((t) => `${TEMA_ETIQUETA[t]} (${minuscula(TEMA_DESCRIPCION[t].replace(/\.$/, ""))})`).join("; ");
  return {
    id: "temas",
    pregunta: "¿Qué temas cubre?",
    respuesta: `Seis temas: ${lista}. Eliges cuáles seguir en «Elige qué seguir»; por ahora es una vista previa y tus preferencias aún no se guardan.`,
    etiquetas: [
      "temas", "sectores", "cobertura", "que cubren", "que siguen", "areas", "categorias", ...TEMAS.map((t) => TEMA_ETIQUETA[t]),
      "petroleo", "semiconductores", "aranceles", "dolar", "peso chileno", "elegir", "seguir",
    ],
    fuentes: [TEMAS_ENLACE],
  };
}

/** Las fuentes del registro público (`/fuentes`), por ámbito. */
function entradaFuentes(): Entrada {
  const grupos = fuentesPorAmbito().filter((g) => g.fuentes.length > 0);
  const todas = grupos.flatMap((g) => g.fuentes);
  const total = todas.length;
  const primarias = todas.filter((f) => f.tipo === "primaria").length;
  const tipos = primarias === total ? "todos fuentes primarias" : `${primarias} de ellos, fuentes primarias`;
  const detalle = grupos.map((g) => `${g.titulo}: ${g.fuentes.map((f) => f.organismo).join("; ")}.`).join(" ");
  return {
    id: "fuentes",
    pregunta: "¿Qué fuentes usan?",
    respuesta: `Verificamos con organismos oficiales y con los datos que publican quienes los emiten. El registro público lista ${total} organismos activos, ${tipos}. ${detalle} Enlazamos los documentos originales y nunca copiamos su texto. El registro está en construcción: las condiciones de reutilización de cada fuente están pendientes de verificar.`,
    etiquetas: [
      "fuentes", "fuente", "origen", "de donde sale", "de donde sacan", "organismos", "oficiales", "registro",
      "banco central", "reserva federal", "fed", "fmi", "opep", "enlaces", "documentos", "fuentes oficiales",
    ],
    fuentes: [FUENTES, METODOLOGIA],
  };
}

/** Una alerta de ejemplo contada con sus propios datos; siempre dice que es ficticia. */
function entradaEjemplo(v: AlertView): Entrada {
  const filas = (d: "gana" | "pierde" | "condicionado") =>
    v.filas.filter((f) => f.direccion === d).map((f) => `${f.sector} (${minuscula(f.condicion).replace(/\.$/, "")})`);
  const ganan = filas("gana");
  const pierden = filas("pierde");
  const dependen = filas("condicionado");
  const resumen = v.resumen.replace(/^Escenario de ejemplo:\s*/i, "");
  const partes = [
    `Es una alerta de ejemplo (ficticia, no un hecho real): «${v.evento}».`,
    resumen.charAt(0).toUpperCase() + resumen.slice(1),
    ganan.length ? `${DIRECCION_ETIQUETA.gana} (podrían beneficiarse): ${ganan.join("; ")}.` : "",
    pierden.length ? `${DIRECCION_ETIQUETA.pierde} (podrían verse presionados): ${pierden.join("; ")}.` : "",
    dependen.length ? `${DIRECCION_ETIQUETA.condicionado} (depende de una condición): ${dependen.join("; ")}.` : "",
    `Confianza de la alerta: ${CONFIANZA_ETIQUETA[v.confianza]}. Verificación: ${VERIFICACION_ETIQUETA[v.nivel_verificacion].toLowerCase()}.`,
  ];
  return {
    id: v.id,
    pregunta: `¿Qué dice la alerta de ejemplo sobre «${minuscula(v.evento)}»?`,
    respuesta: partes.filter(Boolean).join(" "),
    etiquetas: [v.evento, TEMA_ETIQUETA[v.tema], ...v.filas.map((f) => f.sector), "alerta de ejemplo"],
    fuentes: [EJEMPLOS],
    ejemplo: true,
  };
}

/** Toda la base: curada y derivada. Se arma una sola vez al cargar el módulo. */
export const BASE_CONOCIMIENTO: readonly Entrada[] = Object.freeze([
  ...curadas,
  entradaTemas(),
  entradaFuentes(),
  // Los tres escenarios de la portada. Las alertas que solo usa «Tu mañana» quedan fuera a propósito: sumar entradas
  // cambia los puntajes de la búsqueda («cuéntame un chiste» llegaba a la entrada de cuentas).
  ...vistasPortada.map(entradaEjemplo),
]);

export function entradaPorId(id: string, base: readonly Entrada[] = BASE_CONOCIMIENTO): Entrada | undefined {
  return base.find((e) => e.id === id);
}

/** Preguntas que se ofrecen como atajo; cada una debe encontrar la entrada indicada (lo comprueba una prueba). */
export const PREGUNTAS_SUGERIDAS: readonly { texto: string; entrada: string }[] = [
  { texto: "¿Cómo calculan la confianza?", entrada: "confianza" },
  { texto: "¿Qué fuentes usan?", entrada: "fuentes" },
  { texto: "¿Qué significa «condicionado»?", entrada: "gana-pierde-condicionado" },
  { texto: "¿Esto es asesoría financiera?", entrada: "asesoria" },
  { texto: "¿Qué pasa si una alerta es un error?", entrada: "correcciones" },
  { texto: "¿Cuándo lanzan?", entrada: "lanzamiento" },
];
