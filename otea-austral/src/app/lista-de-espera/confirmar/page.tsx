import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { servicioLista } from "@/lib/waitlist/instance";

export const metadata: Metadata = {
  title: "Confirmar inscripción",
  robots: { index: false, follow: false },
};

export default async function ConfirmarPage({ searchParams }: PageProps<"/lista-de-espera/confirmar">) {
  const { token } = await searchParams;
  const confirmada = await servicioLista().confirmar(Array.isArray(token) ? token[0] : token);
  return (
    <ContentPage
      numero="05"
      rotulo="Lista de espera"
      titulo={confirmada ? "Inscripción confirmada." : "Enlace no válido."}
      intro={
        <p>
          {confirmada
            ? "Gracias. Te avisaremos cuando abramos."
            : "El enlace venció, ya se usó o está incompleto. Puedes volver a inscribirte desde la portada."}
        </p>
      }
    >
      <Link href="/" className={buttonClasses("outline")}>
        Volver al inicio
      </Link>
    </ContentPage>
  );
}
