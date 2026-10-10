import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmForm } from "@/components/waitlist/ConfirmForm";
import { TokenConfirmacion } from "@/lib/waitlist/schema";

export const metadata: Metadata = {
  title: "Confirmar inscripción",
  robots: { index: false, follow: false },
};

/**
 * Abrir el enlace no confirma nada: hace falta presionar el botón (POST).
 * Así los antivirus de correo que visitan enlaces no confirman por la persona.
 */
export default async function ConfirmarPage({ searchParams }: PageProps<"/lista-de-espera/confirmar">) {
  const { token } = await searchParams;
  const valor = Array.isArray(token) ? token[0] : token;
  const valido = TokenConfirmacion.safeParse(valor);

  if (!valido.success) {
    return (
      <ContentPage
        numero="05"
        rotulo="Lista de espera"
        titulo="Enlace no válido."
        intro={<p>El enlace está incompleto. Puedes volver a inscribirte desde la portada.</p>}
      >
        <Link href="/#lista-de-espera" className={buttonClasses("outline")}>
          Volver a la lista de espera
        </Link>
      </ContentPage>
    );
  }

  return (
    <ContentPage
      numero="05"
      rotulo="Lista de espera"
      titulo="Confirma tu inscripción."
      intro={<p>Un paso más para entrar a la lista de espera de Otea Austral.</p>}
    >
      <ConfirmForm token={valido.data} />
    </ContentPage>
  );
}
