import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { marcaFormulario } from "@/lib/waitlist/instance";
import { AsiLlega } from "./AsiLlega";
import { WaitlistForm } from "./WaitlistForm";

/**
 * La lista de espera, como los créditos de la portada: el titular se apoya en un horizonte de 1 px a sangre con un sol
 * pequeño en espejo del héroe (quieto), «Así llega» muestra cómo llegaría el aviso y el formulario responde.
 */
export function Waitlist() {
  return (
    <section id="lista-de-espera" aria-labelledby="lista-titulo" className="lista relative scroll-mt-24 overflow-x-clip">
      {/* Vigía del capítulo: lejos de la pantalla, sus piezas ligadas al scroll sueltan la animación (ver `.vigia-producto`). */}
      <span className="vigia-producto" data-vigia aria-hidden="true" />
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2 lg:items-start lg:gap-12 lg:py-[120px]">
        <div>
          <SectionEyebrow>Lista de espera</SectionEyebrow>
          <div className="relative mt-8 mb-7 pb-10">
            <TextoEnMovimiento
              como="h2"
              id="lista-titulo"
              efecto="palabras"
              disparo="scroll"
              texto="Recibe las alertas primero."
              className="titular text-titulo text-texto"
            />
            <span className="lista-horizonte" aria-hidden="true">
              <span className="lista-sol" />
            </span>
          </div>
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Estamos preparando el lanzamiento. Déjanos tu correo y te avisaremos cuando abramos, sin boletines de relleno."
            className="max-w-[520px] text-lede text-texto-suave"
          />
          <AsiLlega />
        </div>
        <WaitlistForm marca={marcaFormulario()} />
      </div>
    </section>
  );
}
