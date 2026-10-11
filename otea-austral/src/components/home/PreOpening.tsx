import { DirectionIcon } from "@/components/alert-card/DirectionBadge";
import { DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasEjemplo } from "@/data/ejemplo";
import { TEMA_ETIQUETA, type Direccion } from "@/lib/domain/schemas";
import { formatearDia } from "@/lib/format";

// Colores de estado como relleno, siempre con texto tinta.
const COLOR: Record<Direccion, string> = {
  gana: "bg-gana",
  condicionado: "bg-condicionado",
  pierde: "bg-pierde",
};

/** Cuántos sectores se nombran por evento en el resumen: lo justo para entender el efecto. */
const SECTORES_POR_EVENTO = 3;

export function PreOpening() {
  const fecha = vistasEjemplo.map((v) => v.fecha).sort().at(-1)!;
  return (
    <section aria-labelledby="pre-apertura-titulo" className="mx-auto max-w-[1440px] px-6 py-24 lg:py-[120px]">
      <SectionEyebrow>Pre-apertura</SectionEyebrow>
      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <TextoEnMovimiento
            como="h2"
            id="pre-apertura-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="El resumen de cada mañana."
            className="titular text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada mañana, lo que cambió durante la noche en tus temas y qué condición mirar en la jornada. Corto, con fuentes y sin recomendaciones."
            className="mt-6 max-w-[520px] text-lede text-texto-suave"
          />
        </div>

        <article aria-labelledby="resumen-ejemplo-titulo" className="superficie anim-revelar rounded-card p-6 sm:p-8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea pb-4">
            <div>
              <p className="micro text-apoyo">Pre-apertura</p>
              <h3 id="resumen-ejemplo-titulo" className="mt-1 font-serif text-2xl text-texto">
                Resumen del <time dateTime={fecha}>{formatearDia(fecha)}</time>
              </h3>
            </div>
            <span className="micro rounded-badge bg-fondo px-2 py-1 text-texto-suave linea-fina">
              Datos de ejemplo
            </span>
          </header>
          <ol className="divide-y divide-linea">
            {vistasEjemplo.map((v, i) => (
              <li key={v.id} className="grid grid-cols-[auto_1fr] gap-x-4 py-5">
                <span className="contador pt-1 text-apoyo">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="micro text-apoyo">{TEMA_ETIQUETA[v.tema]}</p>
                  <p className="mt-1 font-serif text-lg leading-snug text-texto">{v.evento}</p>
                  <p className="mt-2 text-sm text-texto-suave">
                    <span className="font-medium text-texto">Qué mirar: </span>
                    {v.filas[0].condicion.charAt(0).toLowerCase() + v.filas[0].condicion.slice(1)}.
                  </p>
                  <p className="mt-3 text-xs text-apoyo">Podría afectar a</p>
                  <ul className="mt-1.5 flex flex-wrap gap-2" aria-label="Sectores que podrían verse afectados">
                    {v.filas.slice(0, SECTORES_POR_EVENTO).map((fila) => (
                      <li
                        key={fila.sector}
                        data-direccion={fila.direccion}
                        className={`inline-flex items-center gap-1.5 rounded-badge px-2 py-1 text-xs font-semibold text-ink ${COLOR[fila.direccion]}`}
                      >
                        <DirectionIcon direccion={fila.direccion} />
                        <span className="sr-only">{DIRECCION_ETIQUETA[fila.direccion]}: </span>
                        {fila.sector}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-linea pt-4 text-xs text-apoyo">
            Información y análisis. No constituye asesoría financiera.
          </p>
        </article>
      </div>
    </section>
  );
}
