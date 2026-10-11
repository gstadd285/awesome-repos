import { headers } from "next/headers";
import { AlertExamples } from "@/components/home/AlertExamples";
import { PreOpening } from "@/components/home/PreOpening";
import { Story } from "@/components/home/Story";
import { Temas } from "@/components/home/Temas";
import { Waitlist } from "@/components/home/Waitlist";
import { PageTransition } from "@/components/layout/PageTransition";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SITIO } from "@/lib/site";

/** Datos estructurados de la organización (schema.org), con `<` escapado. */
function DatosEstructurados({ nonce }: { nonce?: string }) {
  const datos = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITIO.nombre,
    url: SITIO.url,
    logo: new URL("/icons/icon-512.png", SITIO.url).href,
    slogan: SITIO.eslogan,
    description: SITIO.descriptor,
  };
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Única excepción a react/no-danger: contenido fijo (sin datos de usuarios) y con `<` escapado,
      // para que no pueda cerrar la etiqueta. Un JSON-LD no se puede dar como hijo de React.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }}
    />
  );
}

/**
 * Orden pensado para quien llega por primera vez: qué es y cómo funciona (historia), cómo se ve una
 * alerta, qué temas seguir, qué llega cada mañana y cómo entrar a la lista de espera.
 */
export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <DatosEstructurados nonce={nonce} />
      <SiteHeader />
      <main id="contenido" className="fondo-luz">
        <PageTransition>
          <Story />
          <AlertExamples />
          <Temas />
          <PreOpening />
          <Waitlist />
        </PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}
