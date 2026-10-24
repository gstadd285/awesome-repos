"use server";

import { headers } from "next/headers";
import { env } from "@/lib/env";
import { ipCliente } from "@/lib/security/ip";
import { sha256Hex, type ResultadoLista } from "@/lib/waitlist/service";
import { servicioLista } from "@/lib/waitlist/instance";

/** Lo que la persona había puesto en el formulario, para devolvérselo si el envío no prosperó. */
export type ValoresFormulario = { correo: string; condiciones: boolean; acepta: boolean };

/**
 * React vacía el formulario cuando termina la acción (también si el servidor respondió con un error de validación):
 * sin esto, olvidar una casilla borraría el correo y las demás casillas. Por eso toda respuesta que no inscribe
 * devuelve lo escrito, y el formulario lo usa como valor por omisión.
 */
export type EstadoLista = { estado: "inicial" } | (ResultadoLista & { valores?: ValoresFormulario });
export type EstadoConfirmacion = { estado: "inicial" | "confirmada" | "invalida" | "limite" };

/**
 * Inscripción en la lista de espera. Next.js protege las Server Actions
 * contra CSRF comparando `Origin` con `Host`. La IP solo se usa, cifrada con
 * SHA-256 y en memoria, como clave del límite de solicitudes: no se guarda.
 */
export async function unirseAListaDeEspera(_previo: EstadoLista, formData: FormData): Promise<EstadoLista> {
  const ip = ipCliente(await headers(), env.IP_PROXIES_CONFIABLES);
  const resultado = await servicioLista().registrar(
    {
      correo: formData.get("correo"),
      acepta: formData.get("acepta"),
      condiciones: formData.get("condiciones"),
      sitio_web: formData.get("sitio_web"),
      tiempo: formData.get("tiempo"),
    },
    await sha256Hex(ip),
  );
  if (resultado.estado === "ok") return resultado;
  const correo = formData.get("correo");
  return {
    ...resultado,
    valores: {
      correo: typeof correo === "string" ? correo.slice(0, 254) : "",
      condiciones: formData.get("condiciones") === "on",
      acepta: formData.get("acepta") === "on",
    },
  };
}

/**
 * Confirma con un POST, no al abrir el enlace: los antivirus de correo que
 * visitan los enlaces no deben poder confirmar por la persona.
 */
export async function confirmarInscripcion(
  _previo: EstadoConfirmacion,
  formData: FormData,
): Promise<EstadoConfirmacion> {
  const ip = ipCliente(await headers(), env.IP_PROXIES_CONFIABLES);
  return { estado: await servicioLista().confirmar(formData.get("token"), await sha256Hex(ip)) };
}
