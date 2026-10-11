import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { marcaFormulario } from "@/lib/waitlist/instance";
import { WaitlistForm } from "./WaitlistForm";

export function Waitlist() {
  return (
    <section
      id="lista-de-espera"
      aria-labelledby="lista-titulo"
      className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-24 lg:py-[120px]"
    >
      <SectionEyebrow>Lista de espera</SectionEyebrow>
      <div className="mt-8 grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <TextoEnMovimiento
            como="h2"
            id="lista-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Recibe las alertas primero."
            className="titular text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Estamos preparando el lanzamiento. Déjanos tu correo y te avisaremos cuando abramos, sin boletines de relleno."
            className="mt-6 max-w-[520px] text-lede text-texto-suave"
          />
        </div>
        <div className="anim-revelar">
          <WaitlistForm marca={marcaFormulario()} />
        </div>
      </div>
    </section>
  );
}
