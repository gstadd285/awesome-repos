import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/button";
import { NAV_CABECERA, NAV_PRINCIPAL } from "./navigation";

const ENLACE =
  "rounded-badge text-sm font-medium text-texto-suave transition-colors hover:text-texto aria-[current=page]:text-texto";

type SiteHeaderProps = {
  /** Ruta de la página actual (por ejemplo «/alertas»): se marca en la navegación con `aria-current`. */
  actual?: string;
};

export function SiteHeader({ actual }: SiteHeaderProps) {
  const enPagina = (href: string) => (href === actual ? ("page" as const) : undefined);

  return (
    <header className="vt-site-header vidrio sticky top-0 z-50 h-[72px]">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Link href="/" aria-label="Otea Austral, inicio" className="rounded-badge">
          <Logo />
        </Link>

        <nav aria-label="Principal" className="mx-auto hidden items-center gap-9 lg:flex">
          {NAV_CABECERA.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              aria-current={enPagina(e.href)}
              className={`${ENLACE} py-1 aria-[current=page]:underline aria-[current=page]:decoration-acento aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[10px]`}
            >
              {e.texto}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <Link href="/#lista-de-espera" className={buttonClasses("primary", "whitespace-nowrap", "sm")}>
            <span className="sm:hidden">Alertas</span>
            <span className="hidden sm:inline">Recibir alertas</span>
          </Link>

          {/* Menú móvil sin JavaScript. */}
          <details className="relative lg:hidden">
            <summary className="cursor-pointer list-none rounded-pill px-4 py-2 text-sm font-medium text-texto linea-fina [&::-webkit-details-marker]:hidden">
              Menú
            </summary>
            <nav
              aria-label="Principal (móvil)"
              className="superficie absolute right-0 mt-3 flex w-64 flex-col gap-1 rounded-card p-3"
            >
              {[...NAV_PRINCIPAL, { href: "/seguridad", texto: "Seguridad" }].map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  aria-current={enPagina(e.href)}
                  className={`${ENLACE} px-3 py-2.5 text-base hover:bg-fondo aria-[current=page]:bg-fondo`}
                >
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
