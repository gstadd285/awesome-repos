import { CHIP_SECTOR, ESTILO_DIRECCION } from "@/components/alert-card/DirectionBadge";
import { DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistasPortada } from "@/data/ejemplo";
import { TEMA_ETIQUETA } from "@/lib/domain/schemas";
import { formatearDia, formatearDiaMes, formatearHora } from "@/lib/format";

/** Cuántos sectores se nombran por evento: lo justo para entender el efecto. */
const SECTORES_POR_EVENTO = 3;

const FASES = ["Noche", "Alba", "Apertura"] as const;

/**
 * Pre-apertura, «de la noche al alba»: una banda a sangre en tinta que se abre desde un marco redondeado, con un alba de
 * latón que sube detrás del horizonte (su borde inferior). El resumen va como una terminal: una línea por evento (Ormuz,
 * Chips y Cobre) con la fecha y hora reales del dato, el evento, qué mirar y los sectores, y una última línea en latón.
 * Las líneas se escriben por renglón y un cursor de latón salta de una a otra y se apaga (sin parpadeo infinito).
 */
export function PreOpening() {
  const fecha = vistasPortada.map((v) => v.fecha).sort().at(-1)!;
  return (
    <section aria-labelledby="pre-apertura-titulo" className="noche en-tinta">
      {/* Vigía del capítulo: lejos de la pantalla, sus piezas ligadas al scroll sueltan la animación (ver `.vigia-producto`). */}
      <span className="vigia-producto" data-vigia aria-hidden="true" />
      <div className="noche-fondo" aria-hidden="true">
        <span className="noche-alba escena" />
        <span className="noche-horizonte" />
      </div>
      <div className="noche-contenido mx-auto grid max-w-[1440px] gap-10 py-16 sm:gap-12 sm:py-20 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:py-[120px]">
        <div>
          <SectionEyebrow tono="tinta">Pre-apertura</SectionEyebrow>
          <TextoEnMovimiento
            como="h2"
            id="pre-apertura-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="El resumen de cada mañana."
            className="titular mt-8 text-titulo text-ivory"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada mañana, lo que cambió durante la noche en tus temas y qué condición mirar en la jornada. Corto, con fuentes y sin recomendaciones."
            className="mt-6 max-w-[30em] font-serif text-lede text-marfil-82"
          />
          <div className="noche-fases" aria-hidden="true">
            <ol className="grid grid-cols-3 font-mono text-xs tracking-[0.08em] text-niebla uppercase">
              {FASES.map((f, i) => (
                <li key={f} className={["", "justify-self-center text-ivory", "justify-self-end"][i]}>
                  {f}
                </li>
              ))}
            </ol>
            <span className="noche-fases-pista">
              <span className="noche-fases-avance">
                <span className="noche-fases-punto" />
              </span>
            </span>
          </div>
        </div>

        <article aria-labelledby="resumen-ejemplo-titulo" className="terminal">
          <header className="terminal-cabeza flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <div>
              <p className="micro text-niebla">Pre-apertura</p>
              <h3 id="resumen-ejemplo-titulo" className="mt-0.5 font-serif text-xl leading-snug text-ivory">
                Resumen del <time dateTime={fecha}>{formatearDia(fecha)}</time>
              </h3>
            </div>
            <span className="ejemplo-tinta">Datos de ejemplo</span>
          </header>
          <ol className="terminal-lineas escena py-1">
            {vistasPortada.map((v, i) => (
              <li key={v.id} className={`terminal-linea terminal-linea-${i + 1}`}>
                <time className="terminal-hora hidden pt-0.5 font-mono text-xs leading-snug text-niebla sm:block" dateTime={v.fecha}>
                  <span className="terminal-hh block text-[15px] text-ivory">{formatearHora(v.fecha)}</span> {formatearDiaMes(v.fecha)}
                </time>
                <div className="terminal-cuerpo">
                  <p className="micro hidden text-niebla sm:block">{TEMA_ETIQUETA[v.tema]}</p>
                  <p className="terminal-evento font-serif text-lg leading-snug text-ivory">{v.evento}</p>
                  <p className="mt-1.5 text-sm text-niebla">
                    <span className="font-medium text-ivory">Qué mirar: </span>
                    {v.filas[0].condicion.charAt(0).toLowerCase() + v.filas[0].condicion.slice(1)}.
                    <span className="terminal-cursor" aria-hidden="true" />
                  </p>
                  <ul className="terminal-chips mt-2.5 flex-wrap gap-1.5" aria-label="Sectores que podrían verse afectados">
                    {v.filas.slice(0, SECTORES_POR_EVENTO).map((fila) => (
                      <li key={fila.sector} data-direccion={fila.direccion} className={`${CHIP_SECTOR} ${ESTILO_DIRECCION[fila.direccion]}`}>
                        <span className="sr-only">{DIRECCION_ETIQUETA[fila.direccion]}: </span>
                        {fila.sector}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
            <li className="terminal-linea terminal-linea-4 terminal-final">
              <span className="hidden pt-0.5 font-mono text-xs leading-snug text-brass sm:block" aria-hidden="true">
                →
              </span>
              <p className="text-[15px] font-medium text-brass">
                Antes de la apertura del mercado local (objetivo)
                <span className="terminal-cursor" aria-hidden="true" />
              </p>
            </li>
          </ol>
          <p className="terminal-pie px-5 py-3.5 text-xs text-niebla sm:px-6">Información y análisis. No constituye asesoría financiera.</p>
        </article>
      </div>
    </section>
  );
}
