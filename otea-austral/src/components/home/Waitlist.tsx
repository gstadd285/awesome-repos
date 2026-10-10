import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { WaitlistForm } from "./WaitlistForm";

export function Waitlist() {
  return (
    <section
      id="lista-de-espera"
      aria-labelledby="lista-titulo"
      className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-[120px]"
    >
      <SectionEyebrow numero="05">Lista de espera</SectionEyebrow>
      <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 id="lista-titulo" className="titular text-titulo text-texto">
            Recibe las alertas primero.
          </h2>
          <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
            Estamos preparando el lanzamiento. Déjanos tu correo y te avisaremos cuando abramos, sin
            boletines de relleno.
          </p>
        </div>
        <div className="anim-revelar">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
