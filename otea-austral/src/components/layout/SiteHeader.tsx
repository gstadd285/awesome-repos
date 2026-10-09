import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { NAV_PRINCIPAL } from "./navigation";

const ENLACE = "micro text-texto-suave transition-colors hover:text-texto";

export function SiteHeader() {
  return (
    <header className="vt-site-header vidrio sticky top-0 z-50 h-[72px]">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Link href="/" aria-label="Otea Austral, inicio" className="rounded-badge">
          <Logo />
        </Link>
        <p className="micro hidden leading-tight text-apoyo xl:block">
          Inteligencia de eventos
          <br />
          para mercados.
        </p>

        <nav aria-label="Principal" className="mx-auto hidden items-center gap-10 lg:flex">
          {NAV_PRINCIPAL.map((e) => (
            <Link key={e.href} href={e.href} className={ENLACE}>
              {e.texto}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-6 lg:ml-0">
          <Link href="/seguridad" className={`${ENLACE} hidden md:inline`}>
            Seguridad
          </Link>
          <Link
            href="/#lista-de-espera"
            className="micro corchetes font-semibold whitespace-nowrap text-texto hover:text-brass-deep"
          >
            <span className="sm:hidden">Alertas</span>
            <span className="hidden sm:inline">Recibir alertas</span>
          </Link>

          {/* Menú móvil sin JavaScript. */}
          <details className="relative lg:hidden">
            <summary className="micro cursor-pointer list-none rounded-badge px-2 py-1 text-texto linea-fina [&::-webkit-details-marker]:hidden">
              Menú
            </summary>
            <nav
              aria-label="Principal (móvil)"
              className="superficie absolute right-0 mt-3 flex w-56 flex-col gap-1 rounded-card p-3"
            >
              {[...NAV_PRINCIPAL, { href: "/seguridad", texto: "Seguridad" }].map((e) => (
                <Link key={e.href} href={e.href} className={`${ENLACE} rounded-badge px-3 py-2 hover:bg-fondo`}>
                  {e.texto}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
