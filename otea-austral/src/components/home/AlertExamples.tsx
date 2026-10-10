import { AlertCard } from "@/components/alert-card/AlertCard";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasEjemplo } from "@/data/ejemplo";

export function AlertExamples() {
  return (
    <section aria-labelledby="ejemplos-titulo" className="mx-auto max-w-[1440px] px-6 py-[120px]">
      <SectionEyebrow numero="04">Alertas</SectionEyebrow>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <h2 id="ejemplos-titulo" className="titular text-titulo text-texto">
          Así se ve una alerta.
        </h2>
        <p className="max-w-[520px] leading-relaxed text-texto-suave lg:justify-self-end">
          Quién gana, quién pierde y bajo qué condición, con la confianza calculada desde sus fuentes y
          las correcciones a la vista. Abre «Fuentes» para ver de dónde sale cada una.
        </p>
      </div>
      <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:items-start">
        {vistasEjemplo.map((v) => (
          <AlertCard key={v.id} alerta={v} nivelTitulo={3} className="anim-revelar" />
        ))}
      </div>
    </section>
  );
}
