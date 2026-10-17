import type { Metadata } from "next";
import Link from "next/link";
import { cerrarSesion } from "@/app/admin/acciones";
import { Logo } from "@/components/brand/Logo";
import { sesionActual } from "@/lib/admin/acceso";

export const metadata: Metadata = {
  title: { default: "Panel interno", template: "%s · Panel interno · Otea Austral" },
  robots: { index: false, follow: false },
};

const ENLACE = "micro text-texto-suave transition-colors hover:text-texto";

/**
 * Panel interno. Si no está configurado por completo responde 404
 * (`sesionActual` lo comprueba); cada página y cada acción vuelven a
 * verificar la sesión en el servidor.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const sesion = await sesionActual();
  return (
    <>
      <header className="border-b border-linea bg-papel-alto">
        <div className="mx-auto flex min-h-[72px] max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href={sesion ? "/admin/alertas" : "/"} aria-label="Otea Austral" className="rounded-badge">
            <Logo />
          </Link>
          <p className="micro text-apoyo">Panel interno</p>
          {sesion ? (
            <nav aria-label="Panel" className="ml-auto flex items-center gap-6">
              <Link href="/admin/alertas" className={ENLACE}>
                Alertas
              </Link>
              <Link href="/alertas" className={ENLACE}>
                Ver públicas
              </Link>
              <form action={cerrarSesion}>
                <input type="hidden" name="csrf" value={sesion.csrf} />
                <button type="submit" className="micro corchetes font-semibold text-texto hover:text-brass-deep">
                  Salir
                </button>
              </form>
            </nav>
          ) : null}
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-12">
        {children}
      </main>
    </>
  );
}
