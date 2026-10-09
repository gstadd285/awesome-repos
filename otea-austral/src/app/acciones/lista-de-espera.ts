"use server";

import { headers } from "next/headers";
import { sha256Hex, type ResultadoLista } from "@/lib/waitlist/service";
import { servicioLista } from "@/lib/waitlist/instance";

export type EstadoLista = { estado: "inicial" } | ResultadoLista;

/**
 * Inscripción en la lista de espera. Next.js protege las Server Actions
 * contra CSRF comparando `Origin` con `Host`. La IP solo se usa, cifrada con
 * SHA-256 y en memoria, como clave del límite de solicitudes: no se guarda.
 */
export async function unirseAListaDeEspera(_previo: EstadoLista, formData: FormData): Promise<EstadoLista> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconocida").trim();
  return servicioLista().registrar(
    {
      correo: formData.get("correo"),
      acepta: formData.get("acepta"),
      sitio_web: formData.get("sitio_web"),
    },
    await sha256Hex(ip),
  );
}
