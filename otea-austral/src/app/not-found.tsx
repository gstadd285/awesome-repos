import Link from "next/link";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="mx-auto w-full max-w-[640px] px-6 py-[120px] text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-4 font-serif text-4xl font-normal text-ivory">Esta página no existe</h1>
        <p className="mt-4 text-ivory-soft">Puede que el enlace esté roto o que la página se haya movido.</p>
        <Link href="/" className={buttonClasses("ghost", "mt-8")}>
          Volver al inicio
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
