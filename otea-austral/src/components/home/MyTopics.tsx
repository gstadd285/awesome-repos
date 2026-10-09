import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { TopicPicker } from "./TopicPicker";

export function MyTopics() {
  return (
    <section aria-labelledby="tus-temas-titulo" className="mx-auto max-w-[1440px] px-6 py-[120px]">
      <SectionEyebrow numero="02">Tus temas</SectionEyebrow>
      <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 id="tus-temas-titulo" className="titular text-titulo text-texto">
            Tú decides qué seguir.
          </h2>
          <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
            Marca los temas que te importan. Solo recibirás alertas y resúmenes de lo que elijas, y
            puedes cambiarlo cuando quieras.
          </p>
        </div>
        <div className="anim-revelar">
          <TopicPicker />
        </div>
      </div>
    </section>
  );
}
