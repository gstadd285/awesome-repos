import Link from "next/link";
import { Emblem } from "@/components/brand/Emblem";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { Flecha } from "@/components/ui/Flecha";
import { buttonClasses } from "@/components/ui/button";

/**
 * 404 con un momento de marca: el emblema grande (geometría intacta; se inclina con el cursor, `data-inclinar`) y un
 * horizonte de latón que se dibuja desde su centro y sigue la línea del propio emblema hasta los bordes.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="int fondo-luz pt-12 pb-24">
        <div className="e404-escena relative mb-10" aria-hidden="true">
          <span className="e404-linea" />
          <div className="relative flex h-full justify-center" data-inclinar>
            <Emblem variant="light" className="h-full w-auto" />
          </div>
        </div>
        <div className="mx-auto max-w-[1440px] px-6 text-center">
          <p className="contador text-apoyo">404 · Página no encontrada</p>
          <TextoEnMovimiento
            como="h1"
            efecto="letras"
            disparo="carga"
            texto="Esta ruta no aparece en el horizonte."
            className="titular int-h1 mx-auto mt-5 max-w-[16ch] text-texto"
          />
          <p className="int-entrada mx-auto mt-7 max-w-[40ch] font-serif text-lede text-texto-suave">
            Puede que el enlace esté roto o que la página se haya movido.
          </p>
          <div className="int-sigue mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/" data-magnetico className={buttonClasses("primary")}>
              <span className="boton-etiqueta">Volver al inicio</span>
            </Link>
            <Link href="/metodologia" className={buttonClasses("outline")}>
              Ver la metodología
              <Flecha />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
