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
      <section aria-labelledby="seguridad-titulo" className="mx-auto max-w-[1440px] px-6 pt-16 sm:pt-24">
        <SectionEyebrow numero="CSF 2.0" className="anim-aparecer">
          Seguridad
        </SectionEyebrow>
        <h1
          id="seguridad-titulo"
          className="titular anim-aparecer anim-retraso-1 mt-10 max-w-[18ch] text-display text-texto"
        >
          Cómo protegemos Otea Austral
        </h1>
        <p className="anim-aparecer anim-retraso-2 mt-8 max-w-[640px] text-lg leading-relaxed text-texto-suave">
          Organizamos la seguridad con el Marco de Ciberseguridad (CSF) 2.0 del NIST, el instituto de
          estándares de Estados Unidos. Aquí mostramos qué está hecho, qué está a medias y qué es
          todavía un objetivo.
        </p>
        <p className="anim-aparecer anim-retraso-3 mt-4 max-w-[640px] text-sm text-apoyo">
          Autoevaluación: el NIST no certifica organizaciones, así que esto no es una
          certificación. Texto provisional, pendiente de revisión.
        </p>
      </section>

      <nav aria-label="Funciones del marco" className="mx-auto mt-20 max-w-[1100px] px-6">
        <ul className="anim-escalonado relative grid grid-cols-3 gap-y-8 [--retraso-base:350ms] sm:grid-cols-6">
          <li
            aria-hidden="true"
            className="pointer-events-none absolute top-7 right-[8%] left-[8%] hidden h-px bg-linea-fuerte sm:block"
          />
          {FUNCIONES.map((f) => (
            <li key={f.codigo} className="relative flex justify-center">
              <a
                href={`#funcion-${f.codigo.toLowerCase()}`}
                className="group flex flex-col items-center gap-2 rounded-badge text-center"
              >
                <span className="superficie flex h-14 w-14 items-center justify-center rounded-full text-texto transition-colors group-hover:bg-papel">
                  <FunctionIcon codigo={f.codigo} />
                </span>
                <span className="micro text-texto">{f.nombre}</span>
                <span className="contador text-apoyo">{f.codigo}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <dl className="anim-escalonado mx-auto mt-16 grid max-w-[1100px] grid-cols-2 gap-4 px-6 [--retraso-base:600ms] sm:grid-cols-4">
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
      <div className="mx-auto mt-[120px] max-w-[1440px] px-6 lg:columns-2 lg:gap-6">
        {FUNCIONES.map((f) => {
          const id = `funcion-${f.codigo.toLowerCase()}`;
          return (
            <section
              key={f.codigo}
              id={id}
              aria-labelledby={`${id}-titulo`}
              className="superficie superficie-interactiva anim-revelar mb-6 scroll-mt-24 break-inside-avoid rounded-card p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fondo text-texto linea-fina">
                  <FunctionIcon codigo={f.codigo} className="h-5 w-5" />
                </span>
                <div>
                  <h2 id={`${id}-titulo`} className="titular text-2xl text-texto">
                    {f.nombre} <span className="contador font-normal text-apoyo">{f.codigo}</span>
                  </h2>
                  <p className="mt-1 text-sm text-texto-suave">{f.descripcion}</p>
                </div>
              </div>
              <ul className="mt-4">
                {controlesDe(f.codigo).map((c) => (
                  <li key={c.id} className="border-t border-linea py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-texto">{c.titulo}</h3>
                      <ControlStatus estado={c.estado} tercio={c.tercio} />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-texto-suave">{c.descripcion}</p>
                    <p className="contador mt-2 text-apoyo">
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
        className="anim-revelar mx-auto mt-[120px] max-w-[1440px] scroll-mt-24 px-6"
      >
        <SectionEyebrow numero="RFC 9116">Divulgación responsable</SectionEyebrow>
        <h2 id="reportar-titulo" className="titular mt-8 max-w-[20ch] text-titulo text-texto">
          Reportar una vulnerabilidad
        </h2>
        <p className="mt-6 max-w-[640px] leading-relaxed text-texto-suave">
          Si encuentras un problema de seguridad, avísanos de forma privada y danos tiempo para
          corregirlo antes de hacerlo público. Agradecemos los reportes de buena fe. Por ahora no
          hay programa de recompensas.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href={canal.href}
            className={buttonClasses("primary")}
            {...(canal.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            Reportar de forma privada
            {canal.externo ? <span className="sr-only"> (se abre en una pestaña nueva)</span> : null}
          </a>
          <a href="/.well-known/security.txt" className={buttonClasses("outline")}>
            Ver security.txt
          </a>
        </div>
        <p className="mt-4 text-sm text-apoyo">Canal: {canal.texto}</p>
        <p className="mt-8 text-xs text-apoyo">
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
    <div className="superficie rounded-card p-5">
      <dt className="micro text-apoyo">{termino}</dt>
      <dd className="titular mt-3 text-3xl text-texto">{valor}</dd>
      {detalle ? <dd className="mt-1 text-xs text-apoyo">{detalle}</dd> : null}
    </div>
  );
}
