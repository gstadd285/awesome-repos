import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasEjemplo } from "@/data/ejemplo";
import { formatearDiaMes, formatearHora } from "@/lib/format";
import type { AvisoPrevia } from "./temas";
import { TopicPicker } from "./TopicPicker";

/** Los avisos de ejemplo de «Tu mañana», del más reciente al más antiguo, con la hora real de cada dato. */
function avisosDeEjemplo(): AvisoPrevia[] {
  return [...vistasEjemplo]
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
    .map((v) => ({
      id: v.id,
      tema: v.tema,
      evento: v.evento,
      instante: v.fecha,
      hora: formatearHora(v.fecha),
      dia: formatearDiaMes(v.fecha),
      filas: v.filas.map(({ sector, direccion }) => ({ sector, direccion })),
    }));
}

/** «Elige qué seguir»: los seis temas como interruptores y, al lado, cómo llegaría tu mañana con esos temas. */
export function Temas() {
  return (
    <section id="temas" aria-labelledby="temas-titulo" className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-20 lg:py-[120px]">
      <SectionEyebrow>Temas</SectionEyebrow>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <TextoEnMovimiento
          como="h2"
          id="temas-titulo"
          efecto="palabras"
          disparo="scroll"
          texto="Elige qué seguir."
          className="titular text-titulo text-texto"
        />
        <TextoEnMovimiento
          como="p"
          efecto="lectura"
          disparo="scroll"
          texto="Seis frentes donde un evento lejano puede llegar rápido a los precios que importan en Chile y Latinoamérica. Marca los que te interesan: solo recibirás avisos de lo que elijas."
          className="max-w-[520px] text-lede text-texto-suave lg:justify-self-end"
        />
      </div>
      <div className="anim-revelar mt-12">
        <TopicPicker avisos={avisosDeEjemplo()} />
      </div>
    </section>
  );
}
