import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Emblem } from "@/components/brand/Emblem";
import { CuentasCerradas, Banner, textoDeAviso } from "@/components/cuenta/Paneles";
import { FormularioEntrar } from "@/components/cuenta/FormulariosDeAcceso";
import { Migas } from "@/components/layout/Migas";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { cuentasAbiertas } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

const DESTINOS = new Set(["/cuenta", "/cuenta/seguridad", "/cuenta/datos"]);

/**
 * Entrada a la cuenta: el formulario en porcelana y, al lado, un panel tinta con el emblema, el lema y el horizonte
 * (decorativo). En el teléfono, solo el formulario con un filete de horizonte encima. El flujo y la acción no cambian.
 */
export default async function EntrarPage({ searchParams }: PageProps<"/cuenta/entrar">) {
  if (await sesionCuenta()) redirect("/cuenta");
  const { aviso, siguiente } = await searchParams;
  const destino = typeof siguiente === "string" && DESTINOS.has(siguiente) ? siguiente : undefined;
  const texto = textoDeAviso(aviso);
  return (
    <>
      <SiteHeader actual="/cuenta/entrar" />
      <main id="contenido" className="int fondo-luz pb-24 lg:pb-[120px]">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-6 pt-12 sm:pt-20 lg:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0">
            <Migas actual="Entrar" className="anim-aparecer" />
            <TextoEnMovimiento
              como="h1"
              efecto="letras"
              disparo="carga"
              texto="Entra a tu cuenta."
              className="titular int-h1 mt-7 max-w-[16ch] text-texto"
            />
            <div className="int-entrada mt-7 max-w-[680px] font-serif text-lede text-texto-suave">
              <p>Con tu correo y tu contraseña. Si activaste la verificación en dos pasos, te pediremos también el código de tu app.</p>
            </div>
            <div className="int-sigue mt-10 max-w-[560px]">
              {/* En el teléfono, un filete de horizonte sobre el formulario (en escritorio lo da el panel). */}
              <span aria-hidden="true" className="mb-6 block h-px bg-acento lg:hidden" />
              {texto ? <Banner>{texto}</Banner> : null}
              {cuentasAbiertas() ? (
                <>
                  <FormularioEntrar siguiente={destino} />
                  <p className="mt-6 text-sm text-texto-suave">
                    ¿No tienes cuenta?{" "}
                    <Link href="/cuenta/crear" className="text-texto underline underline-offset-4">
                      Crea una
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <CuentasCerradas />
              )}
            </div>
          </div>
          <div aria-hidden="true" className="int-pieza relative hidden min-h-[480px] flex-col items-center justify-center overflow-hidden rounded-card bg-ink lg:flex">
            <div className="relative w-full">
              <span className="e404-linea" />
              <div className="relative mx-auto w-full max-w-[220px]">
                <Emblem variant="dark" className="h-auto w-full" />
              </div>
            </div>
            <p className="mt-10 font-serif text-2xl text-marfil-82">Del horizonte al mercado.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
