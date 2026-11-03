import { componerCorreo } from "@/lib/correo/plantilla";
import type { Correo } from "@/lib/correo/resend";
import { TEMA_ETIQUETA } from "@/lib/domain/temas";
import { MAXIMO_EN_CORREO, type AlertaParaResumen } from "./seleccion";

/**
 * El correo del resumen diario. Lleva solo lo que Otea escribió: el título de cada alerta, su tema y su confianza calculada,
 * y un enlace a /alertas (donde se ven con la sesión). Nunca texto de una fuente, enlaces a las fuentes, cifras de mercado,
 * datos de pago, el nombre de la persona ni nada sensible. Dice que es información y no asesoría, por qué llega y cómo
 * dejarlo con un clic: el enlace de baja va en el texto y en las cabeceras de la baja de un clic (RFC 8058), que los
 * programas de correo envían como un POST.
 */

export const AVISO_NO_ASESORIA = "Información y análisis; no es asesoría.";

/** Ruta de la baja de un clic: la que reciben por POST los programas de correo y el botón de la página de baja. */
export const RUTA_BAJA = "/api/resumen/baja";

export function enlaceBaja(urlSitio: string, token: string): string {
  const url = new URL(RUTA_BAJA, urlSitio);
  url.searchParams.set("t", token);
  return url.href;
}

export function correoResumen(alertas: readonly AlertaParaResumen[], urlSitio: string, token: string): Omit<Correo, "para"> {
  if (alertas.length === 0) throw new Error("Un resumen sin alertas no se envía.");
  const n = alertas.length;
  const lista = alertas.slice(0, MAXIMO_EN_CORREO).map((a) => `${TEMA_ETIQUETA[a.tema]} · confianza ${a.confianza} · ${a.evento}`);
  const resto = n - lista.length;
  const baja = enlaceBaja(urlSitio, token);
  const armado = componerCorreo(
    n === 1 ? "Tu resumen de Otea Austral: 1 alerta en tus temas" : `Tu resumen de Otea Austral: ${n} alertas en tus temas`,
    [
      {
        tipo: "parrafo",
        texto:
          n === 1
            ? "Desde tu último resumen, Otea Austral publicó esta alerta en los temas que sigues:"
            : "Desde tu último resumen, Otea Austral publicó estas alertas en los temas que sigues:",
      },
      { tipo: "lista", items: lista },
      ...(resto > 0 ? [{ tipo: "parrafo" as const, texto: `Y ${resto} más en la página de alertas.` }] : []),
      { tipo: "enlace", texto: "Ver las alertas", url: new URL("/alertas", urlSitio).href },
      { tipo: "parrafo", texto: `${AVISO_NO_ASESORIA} Cada alerta describe efectos posibles y bajo qué condición, no recomendaciones de inversión.` },
      {
        tipo: "parrafo",
        texto: "Te llega porque pediste el resumen diario en tu perfil. Puedes cambiar tus temas en tu perfil cuando quieras.",
      },
      { tipo: "nota", texto: "Dejar de recibir el resumen, con un clic", url: baja },
    ],
  );
  return {
    ...armado,
    cabeceras: { "List-Unsubscribe": `<${baja}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
