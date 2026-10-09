import { buttonClasses } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { formatearFecha } from "@/lib/format";
import {
  CONTROLES,
  FUNCIONES,
  NIVELES,
  PERFIL,
  controlesDe,
  resumen,
} from "@/lib/security/nist-csf";
import { describirContacto } from "@/lib/security/security-txt";
import { ControlStatus } from "./ControlStatus";
import { FunctionIcon } from "./FunctionIcon";

/**
 * Perfil público de seguridad según el NIST CSF 2.0: las seis funciones, el
 * estado de cada control y cómo reportar una vulnerabilidad.
 */
export function SecurityProfile({ contacto }: { contacto: string }) {
  const total = resumen(CONTROLES);
  const canal = describirContacto(contacto);

  return (
    <>
      <section
        aria-labelledby="seguridad-titulo"
        className="mx-auto max-w-[760px] px-6 pt-16 text-center sm:pt-24"
      >
        <SectionEyebrow>Seguridad · NIST CSF 2.0</SectionEyebrow>
        <h1
          id="seguridad-titulo"
          className="text-headline-gradient mt-6 font-serif text-[36px] leading-[1.15] font-normal sm:text-heading-lg"
        >
          Cómo protegemos Otea Austral
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ivory-soft">
          Organizamos la seguridad con el Marco de Ciberseguridad (CSF) 2.0 del NIST, el instituto de
          estándares de Estados Unidos. Aquí mostramos qué está hecho, qué está a medias y qué es
          todavía un objetivo.
        </p>
        <p className="mt-4 text-sm text-mist">
          Autoevaluación: el NIST no certifica organizaciones, así que esto no es una
          certificación. Texto provisional, pendiente de revisión.
        </p>
      </section>

      <nav aria-label="Funciones del marco" className="mx-auto mt-16 max-w-[1000px] px-6">
        <ul className="relative grid grid-cols-3 gap-y-8 sm:grid-cols-6">
          <li
            aria-hidden="true"
            className="pointer-events-none absolute top-7 right-[8%] left-[8%] hidden h-px bg-glass-edge sm:block"
          />
          {FUNCIONES.map((f) => (
            <li key={f.codigo} className="relative flex justify-center">
              <a
                href={`#funcion-${f.codigo.toLowerCase()}`}
                className="group flex flex-col items-center gap-2 rounded-badge text-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ivory hairline transition-colors group-hover:bg-glass-fill-strong">
                  <FunctionIcon codigo={f.codigo} />
                </span>
                <span className="text-sm text-ivory">{f.nombre}</span>
                <span className="font-mono text-xs text-mist">{f.codigo}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <dl className="mx-auto mt-16 grid max-w-[1000px] grid-cols-2 gap-4 px-6 sm:grid-cols-4">
        <Dato termino="Implementados" valor={String(total.implementado)} />
        <Dato termino="Parciales" valor={String(total.parcial)} />
        <Dato termino="Objetivos" valor={String(total.objetivo)} />
        <Dato
          termino="Nivel (Tier)"
          valor={`${PERFIL.nivelActual} → ${PERFIL.nivelObjetivo}`}
          detalle={`${NIVELES[PERFIL.nivelActual]} hoy (estimado) · ${NIVELES[PERFIL.nivelObjetivo]} como objetivo`}
        />
      </dl>

      {/* Columnas tipo mampostería: tarjetas de distinta altura sin huecos. */}
      <div className="mx-auto mt-[120px] max-w-[1200px] px-6 lg:columns-2 lg:gap-6">
        {FUNCIONES.map((f) => {
          const id = `funcion-${f.codigo.toLowerCase()}`;
          return (
            <section
              key={f.codigo}
              id={id}
              aria-labelledby={`${id}-titulo`}
              className="glass mb-6 scroll-mt-24 break-inside-avoid rounded-card p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-glass-fill-strong text-ivory hairline">
                  <FunctionIcon codigo={f.codigo} className="h-5 w-5" />
                </span>
                <div>
                  <h2 id={`${id}-titulo`} className="font-serif text-2xl font-medium text-ivory">
                    {f.nombre} <span className="font-mono text-sm font-normal text-mist">{f.codigo}</span>
                  </h2>
                  <p className="mt-1 text-sm text-ivory-soft">{f.descripcion}</p>
                </div>
              </div>
              <ul className="mt-4">
                {controlesDe(f.codigo).map((c) => (
                  <li key={c.id} className="border-t border-glass-edge py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-ivory">{c.titulo}</h3>
                      <ControlStatus estado={c.estado} tercio={c.tercio} />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ivory-soft">{c.descripcion}</p>
                    <p className="mt-2 font-mono text-xs text-mist">
                      <span className="sr-only">Subcategorías del CSF: </span>
                      {c.subcategorias.join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section
        id="reportar"
        aria-labelledby="reportar-titulo"
        className="mx-auto mt-[120px] max-w-[760px] scroll-mt-24 px-6 text-center"
      >
        <SectionEyebrow>Divulgación responsable</SectionEyebrow>
        <h2 id="reportar-titulo" className="mt-6 font-serif text-[32px] leading-tight font-normal text-ivory">
          Reportar una vulnerabilidad
        </h2>
        <p className="mt-4 leading-relaxed text-ivory-soft">
          Si encuentras un problema de seguridad, avísanos de forma privada y danos tiempo para
          corregirlo antes de hacerlo público. Agradecemos los reportes de buena fe. Por ahora no
          hay programa de recompensas.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href={canal.href}
            className={buttonClasses("primary")}
            {...(canal.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            Reportar de forma privada
            {canal.externo ? <span className="sr-only"> (se abre en una pestaña nueva)</span> : null}
          </a>
          <a href="/.well-known/security.txt" className={buttonClasses("ghost")}>
            Ver security.txt
          </a>
        </div>
        <p className="mt-4 text-sm text-mist">Canal: {canal.texto}</p>
        <p className="mt-8 text-xs text-mist">
          Última revisión:{" "}
          <time dateTime={PERFIL.revisado}>{formatearFecha(PERFIL.revisado)}</time> · Próxima
          revisión (objetivo):{" "}
          <time dateTime={PERFIL.proximaRevision}>{formatearFecha(PERFIL.proximaRevision)}</time>
        </p>
      </section>
    </>
  );
}

function Dato({ termino, valor, detalle }: { termino: string; valor: string; detalle?: string }) {
  return (
    <div className="glass rounded-card p-5 text-center">
      <dt className="eyebrow">{termino}</dt>
      <dd className="mt-2 font-serif text-3xl text-ivory">{valor}</dd>
      {detalle ? <dd className="mt-1 text-xs text-mist">{detalle}</dd> : null}
    </div>
  );
}
