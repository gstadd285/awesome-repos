import { ContentPage } from "@/components/layout/ContentPage";
import { DialCSF } from "@/components/piezas/DialCSF";
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
    <ContentPage
      ruta="/seguridad"
      rotulo="Seguridad"
      titulo="Cómo protegemos Otea Austral"
      intro={
        <>
          <p>
            Organizamos la seguridad con el Marco de Ciberseguridad (CSF) 2.0 del NIST, el instituto de
            estándares de Estados Unidos. Aquí mostramos qué está hecho, qué está a medias y qué es
            todavía un objetivo.
          </p>
          <p className="mt-4 text-sm text-apoyo">
            Autoevaluación: el NIST no certifica organizaciones, así que esto no es una
            certificación. Texto provisional, pendiente de revisión.
          </p>
        </>
      }
      cifras={[
        { valor: FUNCIONES.length, rotulo: "funciones" },
        { valor: total.implementado, rotulo: "implementados" },
        { valor: total.parcial, rotulo: "parciales" },
        { valor: total.objetivo, rotulo: "objetivos" },
      ]}
      pieza={<DialCSF />}
      indice={[
        ...FUNCIONES.map((f) => ({ numero: f.codigo, titulo: f.nombre, id: `funcion-${f.codigo.toLowerCase()}` })),
        { numero: "RFC", titulo: "Reportar una vulnerabilidad", id: "reportar" },
      ]}
    >
      {FUNCIONES.map((f) => {
        const id = `funcion-${f.codigo.toLowerCase()}`;
        return (
          <section key={f.codigo} id={id} aria-labelledby={`${id}-titulo`} className="superficie mb-6 max-w-[720px] rounded-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fondo text-texto linea-fina">
                <FunctionIcon codigo={f.codigo} className="h-5 w-5" />
              </span>
              <div>
                <h2 id={`${id}-titulo`} className="titular text-titulo text-texto">
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

      <section id="reportar" aria-labelledby="reportar-titulo" className="apartado max-w-[720px]">
        <SectionEyebrow numero="RFC 9116">Divulgación responsable</SectionEyebrow>
        <h2 id="reportar-titulo" className="titular mt-6 text-titulo text-texto">
          Reportar una vulnerabilidad
        </h2>
        <div className="prosa max-w-[720px]">
          <p>
            Si encuentras un problema de seguridad, avísanos de forma privada y danos tiempo para
            corregirlo antes de hacerlo público. Agradecemos los reportes de buena fe. Por ahora no
            hay programa de recompensas.
          </p>
        </div>
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
        <p className="mt-6 text-sm text-apoyo">
          Nivel (Tier) {PERFIL.nivelActual} → {PERFIL.nivelObjetivo}: {NIVELES[PERFIL.nivelActual]} hoy (estimado) ·{" "}
          {NIVELES[PERFIL.nivelObjetivo]} como objetivo.
        </p>
        <p className="mt-2 text-xs text-apoyo">
          Última revisión:{" "}
          <time dateTime={PERFIL.revisado}>{formatearFecha(PERFIL.revisado)}</time> · Próxima
          revisión (objetivo):{" "}
          <time dateTime={PERFIL.proximaRevision}>{formatearFecha(PERFIL.proximaRevision)}</time>
        </p>
      </section>
    </ContentPage>
  );
}
