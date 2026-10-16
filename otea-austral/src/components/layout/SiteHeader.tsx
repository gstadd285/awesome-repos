import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/button";
import { EnlaceCuenta } from "./EnlaceCuenta";
import { NAV_CABECERA, NAV_PRINCIPAL } from "./navigation";

const ENLACE =
  "rounded-pill text-sm font-medium text-texto-suave hover:text-texto aria-[current=page]:text-texto mov:transition-colors mov:duration-(--dur-2) mov:ease-(--ease-salida)";

/** Menú del teléfono: la navegación completa del producto y «Seguridad». */
const NAV_MENU = [...NAV_PRINCIPAL, { href: "/seguridad", texto: "Seguridad" }] as const;

type SiteHeaderProps = {
  /** Ruta de la página actual (por ejemplo «/alertas»): se marca en la navegación con `aria-current`. */
  actual?: string;
};

/**
 * Cabecera del sitio (componente de servidor: `EnlaceCuenta` lee la sesión).
 *
 * - **Escritorio (≥ 1024 px):** 72 px de alto. Con la puerta de movimiento abierta y líneas de tiempo, arriba del todo
 *   es transparente y al bajar los primeros 120 px se condensa en una **isla** (`header::before`, cero nodos) a la que
 *   el logo y las acciones se acercan. Sin eso (reducido, sin JS, Firefox), la barra queda sólida, como siempre.
 *   La pastilla de hover (`.nav-indicador`) la mueve `DirectorEscena` con `--nx --nw --nv`; el filete de la página
 *   actual (`.nav-subrayado`) viaja de un enlace a otro en la transición de página; `.cabecera-progreso` es el avance
 *   de lectura (en la portada, de toda la página).
 * - **Móvil (< 1024 px):** barra de 60 px con el logo, «Alertas» (desde 400 px) y un botón de menú de 44 px que abre un
 *   popover nativo a pantalla completa (Escape y el toque fuera lo cierran sin JS; la isla lo cierra al navegar).
 */
export function SiteHeader({ actual }: SiteHeaderProps) {
  const enPagina = (href: string) => (href === actual ? ("page" as const) : undefined);

  return (
    <>
      <header className="cabecera vt-site-header sticky top-0 z-50">
        <div className="cabecera-fila mx-auto flex h-full max-w-[1440px] items-center gap-4 lg:gap-6">
          <Link href="/" aria-label="Otea Austral, inicio" className="cabecera-logo rounded-badge">
            <Logo />
          </Link>

          <nav
            aria-label="Principal"
            data-nav-indicador
            className="nav-principal relative mx-auto hidden items-center gap-1 lg:flex"
          >
            <span className="nav-indicador" aria-hidden="true" />
            {NAV_CABECERA.map((e) => {
              const marcado = enPagina(e.href);
              return (
                <Link key={e.href} href={e.href} aria-current={marcado} className={`${ENLACE} nav-enlace relative px-4 py-2`}>
                  {e.texto}
                  {marcado ? <span className="nav-subrayado" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </nav>

          <div className="cabecera-acciones ml-auto flex items-center gap-2 lg:ml-0">
            <EnlaceCuenta variante="cabecera" actual={actual} className={`${ENLACE} hidden px-3 py-2 lg:inline-block`} />
            <Link
              href="/#lista-de-espera"
              data-magnetico
              className={buttonClasses("primary", "h-11 whitespace-nowrap max-[399.98px]:hidden lg:h-10", "sm")}
            >
              <span className="boton-etiqueta">
                <span className="sm:hidden">Alertas</span>
                <span className="hidden sm:inline">Recibir alertas</span>
              </span>
            </Link>
            <button type="button" popoverTarget="menu-movil" aria-label="Menú" className="boton-menu lg:hidden">
              <span className="boton-menu-linea" aria-hidden="true" />
              <span className="boton-menu-linea" aria-hidden="true" />
            </button>
          </div>
        </div>
        <span className="cabecera-progreso" aria-hidden="true" />
      </header>

      {/* Menú del teléfono: popover nativo (abre sin JS; Escape y el toque fuera lo cierran). Va fuera de la cabecera
          para que su contención no le afecte; en la capa superior se ve por encima de todo. */}
      <nav id="menu-movil" popover="auto" aria-label="Principal (móvil)" className="menu-movil">
        <div className="menu-cabecera">
          <Link href="/" aria-label="Otea Austral, inicio" className="rounded-badge">
            <Logo />
          </Link>
          <button
            type="button"
            popoverTarget="menu-movil"
            popoverTargetAction="hide"
            aria-label="Cerrar menú"
            className="menu-cerrar"
          >
            <span className="menu-cerrar-linea" aria-hidden="true" />
            <span className="menu-cerrar-linea" aria-hidden="true" />
          </button>
        </div>
        <ul className="menu-lista">
          {NAV_MENU.map((e, i) => (
            <li key={e.href}>
              <Link href={e.href} aria-current={enPagina(e.href)} className="menu-enlace">
                <span className="menu-numero" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="menu-texto">{e.texto}</span>
                <span className="menu-marca" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="menu-pie">
          <Link href="/#lista-de-espera" className={buttonClasses("primary", "w-full")}>
            Recibir alertas
          </Link>
          <div className="menu-legal">
            <EnlaceCuenta variante="menu" actual={actual} className="menu-cuenta" />
            <p>No constituye asesoría financiera.</p>
          </div>
        </div>
      </nav>
    </>
  );
}
