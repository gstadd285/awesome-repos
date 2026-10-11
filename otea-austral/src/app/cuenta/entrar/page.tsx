import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CuentasCerradas, Banner, textoDeAviso } from "@/components/cuenta/Paneles";
import { FormularioEntrar } from "@/components/cuenta/FormulariosDeAcceso";
import { ContentPage } from "@/components/layout/ContentPage";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { cuentasAbiertas } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

const DESTINOS = new Set(["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]);

export default async function EntrarPage({ searchParams }: PageProps<"/cuenta/entrar">) {
  if (await sesionCuenta()) redirect("/cuenta");
  const { aviso, siguiente } = await searchParams;
  const destino = typeof siguiente === "string" && DESTINOS.has(siguiente) ? siguiente : undefined;
  const texto = textoDeAviso(aviso);
  return (
    <ContentPage
      ruta="/cuenta/entrar"
      rotulo="Entrar"
      titulo="Entra a tu cuenta."
      intro={<p>Con tu correo y tu contraseña. Si activaste la verificación en dos pasos, te pediremos también el código de tu app.</p>}
    >
      {texto ? <Banner>{texto}</Banner> : null}
      {cuentasAbiertas() ? (
        <div className="max-w-[560px]">
          <FormularioEntrar siguiente={destino} />
          <p className="mt-6 text-sm text-texto-suave">
            ¿No tienes cuenta?{" "}
            <Link href="/cuenta/crear" className="text-texto underline underline-offset-4">
              Crea una
            </Link>
            .
          </p>
        </div>
      ) : (
        <CuentasCerradas />
      )}
    </ContentPage>
  );
}
