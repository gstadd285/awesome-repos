import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ConmutadorMovimiento } from "@/components/motion/ControlesMovimiento";
import { EnlaceCuenta } from "./EnlaceCuenta";
import { NAV_CONFIANZA, NAV_PRINCIPAL } from "./navigation";

const ENLACE = "flex min-h-11 items-center text-[15px] text-niebla hover:underline underline-offset-4";

/**
 * Pie en tinta: un horizonte de latón con su resplandor, cuatro columnas (marca y lema, Producto, Confianza y
 * Preferencias), el aviso de que no es asesoría y la firma «Otea Austral» en Source Serif 4, decorativa, que el latón
 * recorre al llegar (un velo que se retira, ligado a la vista del pie; sin línea de tiempo o con movimiento reducido,
 * entera en latón).
 * Sobre tinta el foco pasa a latón (`en-tinta`).
 */
export function SiteFooter() {
  return (
    <footer className="pie en-tinta mt-auto text-ivory">
      {/* Cuatro columnas; en el teléfono, dos (la marca y las preferencias a todo el ancho). */}
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-8 px-6 lg:grid-cols-4 lg:gap-12">
        <div className="col-span-2 lg:col-span-1">
          <Logo variante="oscuro" />
          <p className="mt-5 max-w-[16ch] font-serif text-2xl text-marfil-82">Del horizonte al mercado.</p>
        </div>
        <nav id="pie-navegacion" aria-label="Producto">
          <p className="micro text-brass">Producto</p>
          <ul className="mt-3">
            {NAV_PRINCIPAL.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className={ENLACE}>
                  {e.texto}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/#lista-de-espera" className={ENLACE}>
                Recibir alertas
              </Link>
            </li>
            <EnlaceCuenta variante="pie" className={ENLACE} />
          </ul>
        </nav>
        <nav aria-label="Confianza">
          <p className="micro text-brass">Confianza</p>
          <ul className="mt-3">
            {NAV_CONFIANZA.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className={ENLACE}>
                  {e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="col-span-2 lg:col-span-1">
          <p className="micro text-brass">Preferencias</p>
          <div className="mt-4">
            <ConmutadorMovimiento />
            <p className="mov-nota text-sm text-niebla">Animaciones activadas, como pide tu sistema.</p>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-16 max-w-[1440px] px-6">
        <div className="pie-legal flex flex-col gap-2 py-6 text-sm sm:flex-row sm:justify-between">
          <p className="font-medium text-ivory">Información y análisis. No constituye asesoría financiera.</p>
          <p className="text-niebla">© {new Date().getFullYear()} Otea Austral</p>
        </div>
      </div>
      <p aria-hidden="true" className="pie-firma text-center font-serif whitespace-nowrap select-none">
        Otea Austral
      </p>
    </footer>
  );
}
