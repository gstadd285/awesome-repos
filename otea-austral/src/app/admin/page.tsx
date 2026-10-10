import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAcceso } from "@/components/admin/FormularioAcceso";
import { sesionActual } from "@/lib/admin/acceso";

export const metadata: Metadata = { title: "Acceso" };

export default async function AccesoPage() {
  if (await sesionActual()) redirect("/admin/alertas");
  return (
    <section aria-labelledby="acceso-titulo" className="mx-auto max-w-[460px]">
      <h1 id="acceso-titulo" className="titular text-titulo text-texto">
        Acceso al panel.
      </h1>
      <p className="mt-4 leading-relaxed text-texto-suave">
        Escribe tu frase de acceso y el código de seis dígitos de tu app de autenticación.
      </p>
      <FormularioAcceso />
    </section>
  );
}
