import Link from "next/link";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="fondo-luz mx-auto w-full max-w-[1440px] px-6 py-[120px]">
        <p className="contador text-apoyo">404 — Página no encontrada</p>
        <h1 className="titular mt-6 max-w-[16ch] text-display text-texto">Esta página no existe.</h1>
        <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
          Puede que el enlace esté roto o que la página se haya movido.
        </p>
        <Link href="/" className={buttonClasses("outline", "mt-10")}>
          Volver al inicio
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
