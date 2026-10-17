import type { Metadata } from "next";
import Link from "next/link";
import { CuentasCerradas } from "@/components/cuenta/Paneles";
import { FormularioRestablecer } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { contextoCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";

export const metadata: Metadata = { title: "Contraseña nueva", robots: { index: false, follow: false } };

/** Abrir el enlace solo muestra el formulario: la contraseña cambia al enviarlo (POST), nunca al abrir el enlace. */
export default async function RestablecerPage({ searchParams }: PageProps<"/cuenta/restablecer">) {
  const { token } = await searchParams;
  const valor = Array.isArray(token) ? token[0] : token;
  const consulta = await servicioCuentas().consultarRestablecer(valor, (await contextoCuenta()).claveCliente);

  if (consulta.estado === "valido" && typeof valor === "string") {
    return (
      <ContentPage ruta="/cuenta/restablecer" rotulo="Contraseña nueva" titulo="Elige una contraseña nueva." intro={<p>Al guardarla, cerraremos todas tus sesiones abiertas.</p>}>
        <div className="max-w-[560px]">
          <FormularioRestablecer token={valor} />
        </div>
      </ContentPage>
    );
  }
  if (consulta.estado === "cerrada") {
    return (
      <ContentPage ruta="/cuenta/restablecer" rotulo="Contraseña nueva" titulo="Cuentas cerradas.">
        <CuentasCerradas />
      </ContentPage>
    );
  }
  return (
    <ContentPage
      ruta="/cuenta/restablecer"
      rotulo="Contraseña nueva"
      titulo="Enlace no válido."
      intro={
        <p>
          {consulta.estado === "limite"
            ? "Hiciste demasiados intentos. Espera unos minutos y vuelve a abrir el enlace."
            : "El enlace venció, ya se usó o está incompleto. Puedes pedir uno nuevo."}
        </p>
      }
    >
      <Link href="/cuenta/olvide" className={buttonClasses("outline")}>
        Pedir un enlace nuevo
      </Link>
    </ContentPage>
  );
}
