"use server";

import { headers } from "next/headers";
import { env } from "@/lib/env";
import { ipCliente } from "@/lib/security/ip";
import { sha256Hex, type ResultadoLista } from "@/lib/waitlist/service";
import { servicioLista } from "@/lib/waitlist/instance";

export type EstadoLista = { estado: "inicial" } | ResultadoLista;
export type EstadoConfirmacion = { estado: "inicial" | "confirmada" | "invalida" | "limite" };

/**
 * Inscripción en la lista de espera. Next.js protege las Server Actions
 * contra CSRF comparando `Origin` con `Host`. La IP solo se usa, cifrada con
 * SHA-256 y en memoria, como clave del límite de solicitudes: no se guarda.
 */
export async function unirseAListaDeEspera(_previo: EstadoLista, formData: FormData): Promise<EstadoLista> {
  const ip = ipCliente(await headers(), env.IP_PROXIES_CONFIABLES);
  return servicioLista().registrar(
    {
      correo: formData.get("correo"),
      acepta: formData.get("acepta"),
      sitio_web: formData.get("sitio_web"),
      tiempo: formData.get("tiempo"),
    },
    await sha256Hex(ip),
  );
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
