import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CuentasCerradas } from "@/components/cuenta/Paneles";
import { FormularioOlvide } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { marcaFormularioCuentas } from "@/lib/cuentas/instancia";
import { cuentasAbiertas } from "@/lib/env";

export const metadata: Metadata = { title: "Olvidé mi contraseña", robots: { index: false, follow: false } };

export default async function OlvidePage() {
  if (await sesionCuenta()) redirect("/cuenta/seguridad");
  return (
    <ContentPage
      ruta="/cuenta/olvide"
      rotulo="Olvidé mi contraseña"
      titulo="¿Olvidaste tu contraseña?"
      intro={<p>Escribe tu correo y, si hay una cuenta con él, te enviamos un enlace para elegir una contraseña nueva.</p>}
    >
      {cuentasAbiertas() ? (
        <div className="max-w-[560px]">
          <FormularioOlvide marca={marcaFormularioCuentas()} />
        </div>
      ) : (
        <CuentasCerradas />
      )}
    </ContentPage>
  );
}
