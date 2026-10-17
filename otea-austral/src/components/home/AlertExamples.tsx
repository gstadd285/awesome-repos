import { AlertCard } from "@/components/alert-card/AlertCard";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasEjemplo } from "@/data/ejemplo";

export function AlertExamples() {
  return (
    <section
      id="ejemplos"
      aria-labelledby="ejemplos-titulo"
      className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-24 lg:py-[120px]"
    >
      <SectionEyebrow>Alertas</SectionEyebrow>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <TextoEnMovimiento
          como="h2"
          id="ejemplos-titulo"
          efecto="palabras"
          disparo="scroll"
          texto="Así se ve una alerta."
          className="titular text-titulo text-texto"
        />
        <TextoEnMovimiento
          como="p"
          efecto="lectura"
          disparo="scroll"
          texto="Quién gana, quién pierde y bajo qué condición, con la confianza calculada desde sus fuentes y las correcciones a la vista. Abre «Fuentes» para ver de dónde sale cada una."
          className="max-w-[520px] text-lede text-texto-suave lg:justify-self-end"
        />
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-start">
        {vistasEjemplo.map((v) => (
          <AlertCard key={v.id} alerta={v} nivelTitulo={3} className="anim-revelar" />
        ))}
      </div>
    </section>
  );
}
