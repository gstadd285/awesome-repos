import type { Metadata } from "next";
import Link from "next/link";
import { CuentasCerradas } from "@/components/cuenta/Paneles";
import { FormularioActivar } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { contextoCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";

export const metadata: Metadata = { title: "Elige tu contraseña", robots: { index: false, follow: false } };

/**
 * Abrir el enlace del correo no crea nada: solo muestra el formulario. La cuenta se crea al enviar la contraseña (POST),
 * así los antivirus de correo que visitan los enlaces no pueden activar nada por la persona.
 */
export default async function ActivarPage({ searchParams }: PageProps<"/cuenta/activar">) {
  const { token } = await searchParams;
  const valor = Array.isArray(token) ? token[0] : token;
  const consulta = await servicioCuentas().consultarAlta(valor, (await contextoCuenta()).claveCliente);

  if (consulta.estado === "valido" && typeof valor === "string") {
    return (
      <ContentPage ruta="/cuenta/activar" rotulo="Elige tu contraseña" titulo="Elige tu contraseña." intro={<p>Un paso más para abrir tu cuenta de Otea Austral.</p>}>
        <div className="max-w-[560px]">
          <FormularioActivar token={valor} correoEnmascarado={consulta.correoEnmascarado} />
        </div>
      </ContentPage>
    );
  }
  if (consulta.estado === "cerrada") {
    return (
      <ContentPage ruta="/cuenta/activar" rotulo="Elige tu contraseña" titulo="Cuentas cerradas.">
        <CuentasCerradas />
      </ContentPage>
    );
  }
  return (
    <ContentPage
      ruta="/cuenta/activar"
      rotulo="Elige tu contraseña"
      titulo="Enlace no válido."
      intro={
        <p>
          {consulta.estado === "limite"
            ? "Hiciste demasiados intentos. Espera unos minutos y vuelve a abrir el enlace."
            : "El enlace venció, ya se usó o está incompleto. Puedes pedir uno nuevo."}
        </p>
      }
    >
      <Link href="/cuenta/crear" className={buttonClasses("outline")}>
        Crear una cuenta
      </Link>
    </ContentPage>
  );
}
