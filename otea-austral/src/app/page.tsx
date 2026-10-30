import { headers } from "next/headers";
import { seguirTemasAccion } from "@/app/acciones/cuenta";
import { AlertExamples } from "@/components/home/AlertExamples";
import { Asistente } from "@/components/home/Asistente";
import { PreOpening } from "@/components/home/PreOpening";
import { Story } from "@/components/home/Story";
import { Temas } from "@/components/home/Temas";
import { Waitlist } from "@/components/home/Waitlist";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { modoAsistente } from "@/lib/asistente/modo";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";
import { TEMAS, type Tema } from "@/lib/domain/temas";
import { cuentasAbiertas } from "@/lib/env";
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
 * alerta, qué temas seguir, qué llega cada mañana, dónde resolver dudas y cómo entrar a la lista de espera.
 */
export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Con sesión, «Elige qué seguir» deja de ser una vista previa: parte de los temas de la cuenta y los guarda.
  const sesion = cuentasAbiertas() ? await sesionCuenta() : null;
  const temas = sesion ? await servicioCuentas().temasSeguidos(sesion.cuentaId) : null;
  const cuenta =
    sesion && temas ? { csrf: sesion.csrf, temas: TEMAS.filter((t): t is Tema => temas.includes(t)), guardar: seguirTemasAccion } : undefined;
  return (
    <>
      <DatosEstructurados nonce={nonce} />
      <SiteHeader />
      <main id="contenido" className="fondo-luz">
        <Story />
        <AlertExamples />
        <Temas cuenta={cuenta} />
        <PreOpening />
        <Asistente modo={modoAsistente()} />
        <Waitlist />
      </main>
      <SiteFooter />
    </>
  );
}
