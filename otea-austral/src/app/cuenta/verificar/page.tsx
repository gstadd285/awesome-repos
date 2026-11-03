import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioSegundoPaso } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { cookieSesionActual, sesionCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";

export const metadata: Metadata = { title: "Verificación en dos pasos", robots: { index: false, follow: false } };

const DESTINOS = new Set(["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]);

/** Solo se llega aquí con la contraseña ya correcta (sesión «a medias»); sin ella, a la entrada. */
export default async function VerificarPage({ searchParams }: PageProps<"/cuenta/verificar">) {
  if (await sesionCuenta()) redirect("/cuenta");
  if (!(await servicioCuentas().haySesionPendiente(await cookieSesionActual()))) redirect("/cuenta/entrar");
  const { siguiente } = await searchParams;
  return (
    <ContentPage
      ruta="/cuenta/verificar"
      rotulo="Verificación en dos pasos"
      titulo="Un paso más."
      intro={<p>Tu contraseña es correcta. Escribe el código de tu app de autenticación para terminar de entrar.</p>}
    >
      <div className="max-w-[560px]">
        <FormularioSegundoPaso siguiente={typeof siguiente === "string" && DESTINOS.has(siguiente) ? siguiente : undefined} />
      </div>
    </ContentPage>
  );
}
