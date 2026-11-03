import Link from "next/link";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { buttonClasses } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";

/**
 * «Apoya el proyecto»: la última sección de la portada, justo antes del pie, con el titular y el ritmo de las demás
 * (rótulo, `titular text-titulo` por palabras, la entrada por tramos y el botón de latón). Lleva a `/apoyar`, que explica en
 * qué se usa el aporte y tiene el único enlace a Mercado Pago: aquí no hay enlace hacia afuera, ni cifras, ni metas. La
 * portada la monta solo con el apartado de aportes activo (`DONACIONES_URL`, `docs/despliegue.md` §15); apagado, no queda
 * rastro en el HTML. Son 23 nodos: la portada con aportes cabe en el tope de 1.400 de `e2e/presupuesto.spec.ts`.
 */
export function Aportes() {
  return (
    <section id="aportes" aria-labelledby="aportes-titulo" className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-16 sm:py-20 lg:py-[120px]">
      <SectionEyebrow>Aportes</SectionEyebrow>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <TextoEnMovimiento
          como="h2"
          id="aportes-titulo"
          efecto="palabras"
          disparo="scroll"
          texto="Apoya el proyecto."
          className="titular text-titulo text-texto"
        />
        <div className="flex max-w-[520px] flex-col items-start lg:justify-self-end">
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="El aporte es voluntario y ayuda a mantener el sitio en línea."
            className="text-lede text-texto-suave"
          />
          <Link href="/apoyar" data-magnetico className={buttonClasses("primary", "mt-8")}>
            <span className="boton-etiqueta">Ver cómo aportar</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
