import { componerCorreo, type CorreoArmado } from "@/lib/correo/plantilla";
import { PLAZO_ALTAS_SIN_CONFIRMAR_MS, VIGENCIA_ALTA_MS, VIGENCIA_RESTABLECER_MS } from "./constantes";

/**
 * Los correos de las cuentas. Todos salen en respuesta a algo que hizo la persona (o alguien con su correo) y llevan, en
 * el mismo texto, qué hacer si no fue ella. Los enlaces se arman sobre la URL del sitio de la configuración, nunca sobre
 * la cabecera `Host` de la solicitud (así nadie puede envenenar un enlace de restablecimiento).
 */
export function enlaceCuenta(urlSitio: string, ruta: string, token?: string): string {
  const url = new URL(ruta, urlSitio);
  if (token) url.searchParams.set("token", token);
  return url.href;
}

const horas = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  return h === 1 ? "1 hora" : `${h} horas`;
};
const dias = (ms: number) => `${Math.round(ms / 86_400_000)} días`;

/** Paso 1 de la creación de la cuenta: confirmar el correo y elegir la contraseña. */
export function correoActivar(enlace: string): CorreoArmado {
  return componerCorreo("Confirma tu correo para crear tu cuenta en Otea Austral", [
    {
      tipo: "parrafo",
      texto: `Recibimos una solicitud para crear una cuenta en Otea Austral con este correo. Para continuar, abre el enlace y elige tu contraseña (vence en ${horas(VIGENCIA_ALTA_MS)} y sirve una sola vez).`,
    },
    { tipo: "enlace", texto: "Confirmar mi correo y elegir mi contraseña", url: enlace },
    {
      tipo: "parrafo",
      texto: `Si no fuiste tú, ignora este mensaje: sin ese enlace no se crea ninguna cuenta, y la solicitud se borra sola en ${dias(PLAZO_ALTAS_SIN_CONFIRMAR_MS)}.`,
    },
  ]);
}

/** Alguien pidió crear una cuenta con un correo que ya tiene una: se avisa a su dueña o dueño, sin dar nada más. */
export function correoAltaExistente(urlEntrar: string, urlOlvide: string): CorreoArmado {
  return componerCorreo("Intentaron crear una cuenta con tu correo en Otea Austral", [
    { tipo: "parrafo", texto: "Alguien pidió crear una cuenta en Otea Austral con este correo, pero ya tienes una." },
    { tipo: "enlace", texto: "Entrar a mi cuenta", url: urlEntrar },
    { tipo: "enlace", texto: "Si olvidaste tu contraseña, restablécela", url: urlOlvide },
    { tipo: "parrafo", texto: "Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue como estaba." },
  ]);
}

export function correoRestablecer(enlace: string): CorreoArmado {
  return componerCorreo("Restablece tu contraseña de Otea Austral", [
    {
      tipo: "parrafo",
      texto: `Recibimos una solicitud para restablecer la contraseña de tu cuenta. Abre el enlace y elige una nueva (vence en ${horas(VIGENCIA_RESTABLECER_MS)} y sirve una sola vez). Al cambiarla se cierran todas tus sesiones abiertas.`,
    },
    { tipo: "enlace", texto: "Elegir una contraseña nueva", url: enlace },
    { tipo: "parrafo", texto: "Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando y nadie puede cambiarla sin este enlace." },
  ]);
}

/** Aviso de que la contraseña cambió (por la persona o por un restablecimiento). */
export function correoClaveCambiada(urlOlvide: string): CorreoArmado {
  return componerCorreo("La contraseña de tu cuenta de Otea Austral cambió", [
    { tipo: "parrafo", texto: "La contraseña de tu cuenta se cambió hace un momento y se cerraron las demás sesiones abiertas. Si fuiste tú, no tienes que hacer nada." },
    { tipo: "enlace", texto: "Si no fuiste tú, restablece tu contraseña ahora", url: urlOlvide },
  ]);
}

export function correoDosPasos(activada: boolean, urlSeguridad: string): CorreoArmado {
  return componerCorreo(
    activada ? "Se activó la verificación en dos pasos de tu cuenta" : "Se desactivó la verificación en dos pasos de tu cuenta",
    [
      {
        tipo: "parrafo",
        texto: activada
          ? "La verificación en dos pasos de tu cuenta de Otea Austral quedó activada: al entrar, además de la contraseña, se pedirá el código de tu app de autenticación. Si fuiste tú, no tienes que hacer nada."
          : "La verificación en dos pasos de tu cuenta de Otea Austral se desactivó: desde ahora basta la contraseña para entrar. Si fuiste tú, no tienes que hacer nada.",
      },
      { tipo: "enlace", texto: "Si no fuiste tú, revisa la seguridad de tu cuenta", url: urlSeguridad },
    ],
  );
}

export function correoCuentaEliminada(): CorreoArmado {
  return componerCorreo("Eliminamos tu cuenta de Otea Austral", [
    {
      tipo: "parrafo",
      texto:
        "Eliminamos tu cuenta y los datos que guardaba en nuestra base: correo, contraseña, preferencias, sesiones y actividad. Este es el último mensaje que te enviamos por tu cuenta.",
    },
    { tipo: "parrafo", texto: "Si no pediste eliminarla, escríbenos desde la página de seguridad del sitio." },
  ]);
}
