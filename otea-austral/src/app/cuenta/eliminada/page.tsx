import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Cuenta eliminada", robots: { index: false, follow: false } };

/** A donde llega quien acaba de eliminar su cuenta: no necesita (ni tiene) sesión. */
export default function CuentaEliminadaPage() {
  return (
    <ContentPage
      ruta="/cuenta/eliminada"
      rotulo="Cuenta eliminada"
      titulo="Tu cuenta fue eliminada."
      intro={<p>Borramos tu correo, tu contraseña, tus preferencias y tus sesiones. Te enviamos un correo para confirmarlo.</p>}
    >
      <div className="max-w-[560px]">
        <p className="leading-relaxed text-texto-suave">
          Si algún día quieres volver, puedes crear una cuenta nueva. Gracias por haber probado Otea Austral.
        </p>
        <Link href="/" className={buttonClasses("primary", "mt-6")}>
          Volver al inicio
        </Link>
      </div>
    </ContentPage>
  );
}
