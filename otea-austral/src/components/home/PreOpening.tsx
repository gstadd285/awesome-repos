import { DirectionBadge } from "@/components/alert-card/DirectionBadge";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasEjemplo } from "@/data/ejemplo";
import { TEMA_ETIQUETA, type Direccion } from "@/lib/domain/schemas";
import { formatearDia } from "@/lib/format";

const DIRECCIONES: Direccion[] = ["gana", "condicionado", "pierde"];

export function PreOpening() {
  const fecha = vistasEjemplo.map((v) => v.fecha).sort().at(-1)!;
  return (
    <section aria-labelledby="pre-apertura-titulo" className="mx-auto max-w-[1440px] px-6 py-[120px]">
      <SectionEyebrow numero="03">Pre-apertura</SectionEyebrow>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <h2 id="pre-apertura-titulo" className="titular text-titulo text-texto">
            El resumen antes de la campana.
          </h2>
          <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
            Cada mañana, lo que cambió durante la noche en tus temas y qué condición mirar en la jornada.
            Corto, con fuentes y sin recomendaciones.
          </p>
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
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Efectos posibles">
                    {DIRECCIONES.filter((d) => v.filas.some((f) => f.direccion === d)).map((d) => (
                      <li key={d}>
                        <DirectionBadge direccion={d} />
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
