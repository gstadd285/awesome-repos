/**
 * Respuestas fijas del asistente (saludos, negativas y «no sé»). No las redacta ningún modelo: pasan por las
 * mismas reglas de lenguaje que el resto del sitio (`mensajes.test.ts`).
 */
export const MENSAJES = {
  saludo:
    "¡Hola! Puedo responder preguntas sobre Otea Austral: cómo funciona, qué fuentes usa, cómo se calcula la confianza de una alerta o qué significan «gana», «pierde» y «condicionado». ¿Qué te gustaría saber?",
  cortesia: "¡Con gusto! Si tienes otra pregunta sobre Otea Austral, aquí estoy.",
  sinRespuesta:
    "No encontré eso en lo que sé de Otea Austral, y prefiero no inventar una respuesta. Puedo ayudarte con cómo funciona, las fuentes, la confianza de las alertas, la lista de espera o la privacidad. Prueba con una de estas preguntas.",
  datosPersonales:
    "Mejor no escribas datos personales (correo, teléfono, RUT o números de tarjeta o de cuenta) aquí: no los necesito para responderte. Esta pregunta no se guardó ni se envió a ningún proveedor; escríbela de nuevo sin ellos.",
  inyeccion: "Solo puedo responder preguntas sobre Otea Austral y su sitio. ¿Qué te gustaría saber?",
} as const;
