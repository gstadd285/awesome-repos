import { buttonClasses } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistaEjemplo } from "@/data/ejemplo";
import { AlertFan } from "./AlertFan";

export function Hero() {
  return (
    <section aria-labelledby="hero-titulo" className="pb-[120px]">
      <div className="mx-auto max-w-[1200px] px-6 pt-16 pb-16 text-center sm:pt-24">
        <SectionEyebrow className="anim-aparecer">Inteligencia de eventos para mercados</SectionEyebrow>
        <h1
          id="hero-titulo"
          className="text-headline-gradient anim-aparecer anim-retraso-1 mt-6 font-serif text-[40px] leading-[1.15] font-normal sm:text-display"
        >
          Del horizonte al mercado.
        </h1>
        <p className="anim-aparecer anim-retraso-2 mx-auto mt-6 max-w-[640px] text-lg leading-relaxed text-ivory-soft">
          Te avisamos de los eventos globales que importan y explicamos qué sectores y activos
          podrían verse afectados: quién gana, quién pierde y bajo qué condición, con nivel de
          confianza y fuentes.
        </p>
        <div className="anim-aparecer anim-retraso-3 mt-10 flex flex-wrap justify-center gap-4">
          <a href="#lista-de-espera" className={buttonClasses("primary")}>
            Recibir alertas
          </a>
          <a href="#alerta-ejemplo-ormuz" className={buttonClasses("ghost")}>
            Ver cómo funciona
          </a>
        </div>
      </div>

      <AlertFan
        izquierda={vistaEjemplo("ejemplo-cobre")}
        centro={vistaEjemplo("ejemplo-ormuz")}
        derecha={vistaEjemplo("ejemplo-chips")}
      />
    </section>
  );
}
