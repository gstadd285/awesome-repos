import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ConmutadorMovimiento } from "@/components/motion/ControlesMovimiento";
import { NAV_CONFIANZA, NAV_PRINCIPAL } from "./navigation";

const ENLACE = "text-sm text-texto-suave transition-colors hover:text-texto";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-linea bg-papel">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 pt-16 pb-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="titular mt-6 max-w-[16ch] text-2xl text-texto">Del horizonte al mercado.</p>
        </div>
        <nav aria-label="Producto">
          <p className="micro text-apoyo">Producto</p>
          <ul className="mt-4 space-y-2">
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
          </ul>
        </nav>
        <nav aria-label="Confianza">
          <p className="micro text-apoyo">Confianza</p>
          <ul className="mt-4 space-y-2">
            {NAV_CONFIANZA.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className={ENLACE}>
                  {e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 border-t border-linea px-6 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-texto">Información y análisis. No constituye asesoría financiera.</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ConmutadorMovimiento />
          <p className="text-apoyo">© {new Date().getFullYear()} Otea Austral</p>
        </div>
      </div>
      <p
        aria-hidden="true"
        className="titular overflow-hidden px-4 pb-2 text-center text-[clamp(2.5rem,11.4vw,13rem)] leading-[0.8] tracking-[-0.04em] whitespace-nowrap text-fondo-sombra select-none"
      >
        Otea Austral
      </p>
    </footer>
  );
}
