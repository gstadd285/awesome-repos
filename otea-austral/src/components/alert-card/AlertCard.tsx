import { safeHref } from "@/lib/domain/url";
import { TEMA_ETIQUETA } from "@/lib/domain/schemas";
import type { AlertView } from "@/lib/domain/view";
import { formatearDia, formatearFecha, formatearFechaHora } from "@/lib/format";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DirectionBadge } from "./DirectionBadge";
import { CONFIANZA_ETIQUETA, TIPO_FUENTE_ETIQUETA, VERIFICACION_ETIQUETA } from "./labels";

type NivelTitulo = 2 | 3 | 4 | 5;

type AlertCardProps = {
  alerta: AlertView;
  /** Nivel del título según dónde se inserte la tarjeta. */
  nivelTitulo?: NivelTitulo;
  className?: string;
};

/**
 * Tarjeta de alerta: evento, quién gana y quién pierde, confianza calculada,
 * fuentes y estado (corregida o retractada). Componente de servidor sin JS:
 * el desplegable de fuentes es un `<details>` nativo, navegable con teclado.
 */
export function AlertCard({ alerta, nivelTitulo = 3, className = "" }: AlertCardProps) {
  const Titulo = `h${nivelTitulo}` as const;
  const Subtitulo = `h${nivelTitulo + 1}` as "h3" | "h4" | "h5" | "h6";
  const base = `alerta-${alerta.id}`;
  const retractada = alerta.estado === "retractada";
  const retractacion = alerta.correcciones.findLast((c) => c.tipo === "retractacion");
  const ultimaCorreccion = alerta.correcciones.findLast((c) => c.tipo === "correccion");
  const nFuentes = alerta.fuentes.length;

  return (
    <article
      id={base}
      aria-labelledby={`${base}-titulo`}
      data-estado={alerta.estado}
      className={`glass glass-interactive rounded-card p-6 text-left ${className}`}
    >
      {retractada ? (
        <div role="note" className="mb-5 rounded-badge bg-glass-fill-strong p-3 hairline">
          <p className="text-sm font-semibold text-ivory">
            Alerta retractada
            {retractacion ? (
              <>
                {" el "}
                <time dateTime={retractacion.fecha}>{formatearDia(retractacion.fecha)}</time>
              </>
            ) : null}
          </p>
          {retractacion ? (
            <p className="mt-1 text-sm text-ivory-soft">{retractacion.texto_publico}</p>
          ) : null}
          <p className="mt-1 text-xs text-mist">
            Se mantiene publicada, tachada, para que quede registro.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-auto">{TEMA_ETIQUETA[alerta.tema]}</span>
        {alerta.es_ejemplo ? (
          <span className="rounded-badge bg-glass-fill-strong px-2 py-1 text-xs font-medium text-ivory-soft hairline">
            Datos de ejemplo
          </span>
        ) : null}
        {alerta.estado === "corregida" && ultimaCorreccion ? (
          <a
            href={`#${base}-correcciones`}
            className="rounded-badge px-2 py-1 text-xs font-medium text-ivory underline decoration-glass-edge-strong underline-offset-4 hover:decoration-ivory"
          >
            Corregida el{" "}
            <time dateTime={ultimaCorreccion.fecha}>{formatearDia(ultimaCorreccion.fecha)}</time>
          </a>
        ) : null}
      </div>

      <Titulo
        id={`${base}-titulo`}
        className="mt-3 font-serif text-2xl leading-tight font-medium text-ivory"
      >
        {retractada ? <s>{alerta.evento}</s> : alerta.evento}
      </Titulo>

      <div className={retractada ? "line-through decoration-mist" : undefined}>
        <p className="mt-3 text-sm leading-relaxed text-ivory-soft">{alerta.resumen}</p>

        <ul aria-label="Quién gana y quién pierde" className="mt-4">
          {alerta.filas.map((fila, i) => (
            <li
              key={`${fila.sector}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-glass-edge py-3"
            >
              <p className="text-sm font-medium text-ivory">{fila.sector}</p>
              <DirectionBadge direccion={fila.direccion} />
              <p className="col-span-2 text-sm text-ivory-soft">
                {fila.condicion}
                <span className="text-mist">
                  {" · "}Confianza {CONFIANZA_ETIQUETA[fila.confianza_mostrada]}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <footer className="border-t border-glass-edge pt-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ivory-soft">
          <span className="sr-only">Respaldo: </span>
          <ConfidenceBadge nivel={alerta.confianza} />
          <span aria-hidden="true" className="text-mist">
            ·
          </span>
          <span>
            {nFuentes} {nFuentes === 1 ? "fuente" : "fuentes"}
          </span>
          <span aria-hidden="true" className="text-mist">
            ·
          </span>
          <span>{VERIFICACION_ETIQUETA[alerta.nivel_verificacion]}</span>
        </p>

        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-badge py-1 text-sm font-medium text-ivory [&::-webkit-details-marker]:hidden">
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
              className="h-3 w-3 transition-transform group-open:rotate-90"
            >
              <path d="M4 2 8 6 4 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Fuentes ({nFuentes})
          </summary>
          {nFuentes === 0 ? (
            <p className="mt-2 text-sm text-mist">Esta alerta aún no tiene fuentes enlazadas.</p>
          ) : (
            <ul className="mt-2 space-y-3 pb-1">
              {alerta.fuentes.map((fuente, i) => {
                const href = safeHref(fuente.url);
                return (
                  <li key={`${fuente.url}-${i}`} className="text-sm">
                    <p className="text-xs text-mist">
                      {fuente.organismo} · {TIPO_FUENTE_ETIQUETA[fuente.tipo]}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ivory underline decoration-glass-edge-strong underline-offset-4 hover:decoration-ivory"
                      >
                        {fuente.titulo}
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                    ) : (
                      <span className="text-ivory">{fuente.titulo}</span>
                    )}
                    <p className="text-xs text-mist">
                      Publicado el{" "}
                      <time dateTime={fuente.fecha_publicacion}>
                        {formatearFecha(fuente.fecha_publicacion)}
                      </time>
                      {fuente.identificador ? ` · ${fuente.identificador}` : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </details>

        {alerta.correcciones.length > 0 ? (
          <section
            id={`${base}-correcciones`}
            aria-labelledby={`${base}-correcciones-titulo`}
            className="mt-3 scroll-mt-24"
          >
            <Subtitulo id={`${base}-correcciones-titulo`} className="text-sm font-medium text-ivory">
              {retractada ? "Correcciones y retractación" : "Correcciones"}
            </Subtitulo>
            <ol className="mt-1 space-y-2">
              {alerta.correcciones.map((c) => (
                <li key={c.id} className="text-sm text-ivory-soft">
                  <span className="text-xs text-mist">
                    {c.tipo === "retractacion" ? "Retractación" : "Corrección"} ·{" "}
                    <time dateTime={c.fecha}>{formatearDia(c.fecha)}</time>
                  </span>
                  <br />
                  {c.texto_publico}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className="mt-3 text-xs text-mist">
          Revisado por {alerta.revisor} ·{" "}
          <time dateTime={alerta.fecha}>{formatearFechaHora(alerta.fecha)}</time>
        </p>
      </footer>
    </article>
  );
}
