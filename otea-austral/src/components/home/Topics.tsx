import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { TEMA_ETIQUETA, Tema } from "@/lib/domain/schemas";
import { TEMA_DESCRIPCION } from "./temas";
import { TopicIcon } from "./TopicIcon";

export function Topics() {
  return (
    <section id="temas" aria-labelledby="temas-titulo" className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-[120px]">
      <SectionEyebrow numero="01">Temas</SectionEyebrow>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <h2 id="temas-titulo" className="titular text-titulo text-texto">
          Seis frentes que vigilamos.
        </h2>
        <p className="max-w-[520px] leading-relaxed text-texto-suave lg:justify-self-end">
          Temas donde un evento lejano puede llegar rápido a los precios que importan en Chile y
          Latinoamérica.
        </p>
      </div>

      <ul className="anim-revelar relative mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-card bg-linea linea-fina sm:grid-cols-2 lg:grid-cols-3">
        {Tema.options.map((tema, i) => (
          <li key={tema} className="group flex flex-col gap-6 bg-papel p-6 transition-colors hover:bg-papel-alto">
            <div className="flex items-center justify-between">
              <span className="superficie flex h-12 w-12 items-center justify-center rounded-full text-texto">
                <TopicIcon tema={tema} />
              </span>
              <span className="contador text-apoyo">{String(i + 1).padStart(3, "0")}</span>
            </div>
            <div>
              <h3 className="titular text-xl text-texto">{TEMA_ETIQUETA[tema]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-texto-suave">{TEMA_DESCRIPCION[tema]}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
