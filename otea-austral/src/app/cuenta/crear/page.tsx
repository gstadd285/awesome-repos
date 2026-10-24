import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CuentasCerradas, ResumenDeDatos } from "@/components/cuenta/Paneles";
import { FormularioCrear } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { marcaFormularioCuentas } from "@/lib/cuentas/instancia";
import { cuentasAbiertas } from "@/lib/env";

export const metadata: Metadata = { title: "Crear una cuenta", robots: { index: false, follow: false } };

export default async function CrearPage() {
  if (await sesionCuenta()) redirect("/cuenta");
  return (
    <ContentPage
      ruta="/cuenta/crear"
      rotulo="Crear una cuenta"
      titulo="Crea tu cuenta."
      intro={<p>Para elegir tus temas y guardar tus preferencias. Te pedimos solo lo necesario, y nada de tarjetas.</p>}
    >
      {cuentasAbiertas() ? (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,560px)_minmax(0,360px)]">
          <FormularioCrear marca={marcaFormularioCuentas()} />
          <ResumenDeDatos />
        </div>
      ) : (
        <CuentasCerradas />
      )}
    </ContentPage>
  );
}
