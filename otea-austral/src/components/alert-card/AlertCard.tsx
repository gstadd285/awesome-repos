import type { ReactNode } from "react";
import { motivosInvariantesPublicada } from "@/lib/domain/rules";
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
  /**
   * Vista alternativa de la misma alerta (la vitrina de la portada: «quita la fuente primaria»). Cada valor que cambia
   * se pinta dos veces, en `span.solo-a` (el real) y `span.solo-b` (el alternativo); el CSS muestra uno u otro con
   * `.demo:has(#prueba-…:checked)`, sin JavaScript. Sin esta prop la tarjeta no cambia.
   */
  alternativa?: AlertView;
};

/** El valor real y, si la vista alternativa lo cambia, también el alternativo (el CSS muestra uno de los dos). */
function Alterna({ a, b, cambia }: { a: ReactNode; b: ReactNode; cambia: boolean }) {
  if (!cambia) return <>{a}</>;
  return (
    <>
      <span className="solo-a">{a}</span>
      <span className="solo-b">{b}</span>
    </>
  );
}

const MOTIVO_IMPACTO = "Impacto alto exige dos fuentes de organismos distintos.";

/**
 * Tarjeta de alerta: evento, quién gana y quién pierde, confianza calculada,
 * fuentes y estado (corregida o retractada). Componente de servidor sin JS:
 * el desplegable de fuentes es un `<details>` nativo, navegable con teclado.
 */
export function AlertCard({ alerta, nivelTitulo = 3, className = "", alternativa }: AlertCardProps) {
  const Titulo = `h${nivelTitulo}` as const;
  const Subtitulo = `h${nivelTitulo + 1}` as "h3" | "h4" | "h5" | "h6";
  const base = `alerta-${alerta.id}`;
  const retractada = alerta.estado === "retractada";
  const retractacion = alerta.correcciones.findLast((c) => c.tipo === "retractacion");
  const ultimaCorreccion = alerta.correcciones.findLast((c) => c.tipo === "correccion");
  const nFuentes = alerta.fuentes.length;
  const alt = alternativa ?? alerta;
  const nFuentesAlt = alt.fuentes.length;
  const urlsAlt = new Set(alt.fuentes.map((f) => f.url));
  // Regla 3, la misma que se aplica al cambiar las fuentes de una alerta publicada: ¿la vista alternativa la sostiene?
  const pierdeImpacto =
    alternativa !== undefined &&
    !motivosInvariantesPublicada(alerta, alerta.fuentes).includes(MOTIVO_IMPACTO) &&
    motivosInvariantesPublicada(alerta, alt.fuentes).includes(MOTIVO_IMPACTO);
  const fuentesTexto = (n: number) => `${n} ${n === 1 ? "fuente" : "fuentes"}`;

  return (
    <article
      id={base}
      aria-labelledby={`${base}-titulo`}
      data-estado={alerta.estado}
      className={`superficie rounded-card p-6 text-left ${className}`}
    >
      {retractada ? (
        <div role="note" className="mb-5 rounded-badge bg-fondo p-3 linea-fina">
          <p className="text-sm font-semibold text-texto">
            Alerta retractada
            {retractacion ? (
              <>
                {" el "}
                <time dateTime={retractacion.fecha}>{formatearDia(retractacion.fecha)}</time>
              </>
            ) : null}
          </p>
          {retractacion ? (
            <p className="mt-1 text-sm text-texto-suave">{retractacion.texto_publico}</p>
          ) : null}
          <p className="mt-1 text-xs text-apoyo">
            Se mantiene publicada, tachada, para que quede registro.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="micro mr-auto text-apoyo">{TEMA_ETIQUETA[alerta.tema]}</span>
        {alerta.es_ejemplo ? (
          <span className="rounded-badge bg-fondo px-2 py-1 text-xs font-medium text-texto-suave linea-fina">
            Datos de ejemplo
          </span>
        ) : null}
        {alerta.estado === "corregida" && ultimaCorreccion ? (
          <a
            href={`#${base}-correcciones`}
            className="rounded-badge px-2 py-1 text-xs font-medium text-texto underline decoration-linea-fuerte underline-offset-4 hover:decoration-texto"
          >
            Corregida el{" "}
            <time dateTime={ultimaCorreccion.fecha}>{formatearDia(ultimaCorreccion.fecha)}</time>
          </a>
        ) : null}
      </div>

      <Titulo
        id={`${base}-titulo`}
        className="mt-3 font-serif text-2xl leading-tight font-medium text-texto"
      >
        {retractada ? <s>{alerta.evento}</s> : alerta.evento}
      </Titulo>

      <div className={retractada ? "line-through decoration-apoyo" : undefined}>
        <p className="mt-3 text-sm leading-relaxed text-texto-suave">{alerta.resumen}</p>

        <ul aria-label="Quién gana y quién pierde" className="mt-4">
          {alerta.filas.map((fila, i) => {
            const filaAlt = alt.filas[i] ?? fila;
            return (
              <li
                key={`${fila.sector}-${i}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-linea py-3"
              >
                <p className="text-sm font-medium text-texto">{fila.sector}</p>
                <DirectionBadge direccion={fila.direccion} />
                <p className="col-span-2 text-sm text-texto-suave">
                  {fila.condicion}
                  <span className="text-apoyo">
                    {" · "}
                    <Alterna
                      cambia={filaAlt.confianza_mostrada !== fila.confianza_mostrada}
                      a={`Confianza ${CONFIANZA_ETIQUETA[fila.confianza_mostrada]}`}
                      b={`Confianza ${CONFIANZA_ETIQUETA[filaAlt.confianza_mostrada]}`}
                    />
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="border-t border-linea pt-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
          <span className="sr-only">Respaldo: </span>
          <Alterna
            cambia={alt.confianza !== alerta.confianza}
            a={<ConfidenceBadge nivel={alerta.confianza} />}
            b={<ConfidenceBadge nivel={alt.confianza} />}
          />
          <span aria-hidden="true" className="text-apoyo">
            ·
          </span>
          <span>
            <Alterna cambia={nFuentesAlt !== nFuentes} a={fuentesTexto(nFuentes)} b={fuentesTexto(nFuentesAlt)} />
          </span>
          <span aria-hidden="true" className="text-apoyo">
            ·
          </span>
          <span>
            <Alterna
              cambia={alt.nivel_verificacion !== alerta.nivel_verificacion}
              a={VERIFICACION_ETIQUETA[alerta.nivel_verificacion]}
              b={VERIFICACION_ETIQUETA[alt.nivel_verificacion]}
            />
          </span>
        </p>

        <details className="group mt-3">
          {/* 44 px de alto para el dedo sin mover nada: el relleno de más lo devuelve el margen negativo. */}
          <summary className="-my-2 flex cursor-pointer list-none items-center gap-2 rounded-badge py-3 text-sm font-medium text-texto [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="chevron h-3 w-3">
              <path d="M2 4 6 8 10 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {nFuentesAlt !== nFuentes ? (
              // Un solo hijo del `flex`: si no, cada `span` alterno quedaría separado por el `gap`.
              <span>
                Fuentes (<Alterna cambia a={nFuentes} b={nFuentesAlt} />)
              </span>
            ) : (
              <>Fuentes ({nFuentes})</>
            )}
          </summary>
          {nFuentes === 0 ? (
            <p className="mt-2 text-sm text-apoyo">Esta alerta aún no tiene fuentes enlazadas.</p>
          ) : (
            <ul className="mt-2 space-y-3 pb-1">
              {alerta.fuentes.map((fuente, i) => {
                const href = safeHref(fuente.url);
                const quitada = alternativa !== undefined && !urlsAlt.has(fuente.url);
                return (
                  <li key={`${fuente.url}-${i}`} className="text-sm" data-quitada={quitada ? "" : undefined}>
                    <p className="text-xs text-apoyo">
                      {quitada ? (
                        // Solo se tacha la fuente: un tachado en el `<p>` se propagaría también al rótulo que lo explica.
                        <>
                          <span className="fuente-tachable">
                            {fuente.organismo} · {TIPO_FUENTE_ETIQUETA[fuente.tipo]}
                          </span>
                          <span className="solo-b"> · Quitada en la prueba</span>
                        </>
                      ) : (
                        <>
                          {fuente.organismo} · {TIPO_FUENTE_ETIQUETA[fuente.tipo]}
                        </>
                      )}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-texto underline decoration-linea-fuerte underline-offset-4 hover:decoration-texto"
                      >
                        {fuente.titulo}
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                    ) : (
                      <span className="text-texto">{fuente.titulo}</span>
                    )}
                    <p className="text-xs text-apoyo">
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
            <Subtitulo id={`${base}-correcciones-titulo`} className="text-sm font-medium text-texto">
              {retractada ? "Correcciones y retractación" : "Correcciones"}
            </Subtitulo>
            <ol className="mt-1 space-y-2">
              {alerta.correcciones.map((c) => (
                <li key={c.id} className="text-sm text-texto-suave">
                  <span className="text-xs text-apoyo">
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

        <p className="mt-3 text-xs text-apoyo">
          Revisado por {alerta.revisor} ·{" "}
          <time dateTime={alerta.fecha}>{formatearFechaHora(alerta.fecha)}</time>
        </p>

        {/* Al final del pie: al aparecer, nada de lo que está encima se desplaza. */}
        {pierdeImpacto ? (
          <p className="solo-b alerta-aviso-prueba mt-4 rounded-badge bg-fondo px-3 py-2.5 text-sm text-texto linea-fina">
            No podría publicarse como impacto alto: la regla pide dos organismos distintos y queda uno.
          </p>
        ) : null}
      </footer>
    </article>
  );
}
