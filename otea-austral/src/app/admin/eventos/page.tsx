import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { descartarEventoAccion } from "@/app/admin/eventos/acciones";
import { AvisoAccesoPrivado } from "@/components/admin/AvisoAccesoPrivado";
import { describirIntento, ResumenBorrador } from "@/components/admin/BorradorIa";
import { CAMPO, ENLACE, ETIQUETA, TARJETA } from "@/components/admin/estilos";
import {
  CONFIANZA_POSIBLE_ETIQUETA,
  describirSenales,
  ESTADO_EVENTO_ETIQUETA,
  temaEventoEtiqueta,
} from "@/components/admin/etiquetas";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { FuentesEvento } from "@/components/admin/FuentesEvento";
import { Ocultos } from "@/components/admin/Ocultos";
import { buttonClasses } from "@/components/ui/button";
import { exigirSesion } from "@/lib/admin/acceso";
import { UMBRAL_BORRADOR } from "@/lib/ingesta/agrupar";
import { colaEventos } from "@/lib/ingesta/cola";
import { formatearFechaHora } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Eventos candidatos" };

/**
 * Cola de eventos candidatos (`docs/alertas-reales.md` §5): ordenada por puntaje y hora, cada evento con sus fuentes
 * enlazadas al documento oficial y, si la IA dejó uno, su borrador (banderas, anticopia y dudas). Desde aquí se descarta;
 * para revisar el borrador o crear una alerta se abre el evento.
 */
export default async function EventosPage({ searchParams }: PageProps<"/admin/eventos">) {
  const sesion = await exigirSesion();
  const cola = colaEventos();
  if (!cola) notFound();
  const { hecho } = await searchParams;
  const eventos = await cola.pendientes(new Date());

  return (
    <>
      <p className="micro text-apoyo">Panel interno</p>
      <h1 className="titular mt-3 text-titulo text-texto">Eventos candidatos</h1>
      <p className="mt-4 max-w-[680px] leading-relaxed text-texto-suave">
        La ingesta agrupa los títulos de las fuentes oficiales por tema y fecha y, si la IA de borradores está activa, deja un
        borrador para los eventos sobre el umbral cuyas fuentes lo permiten. Revisa las fuentes, acepta o descarta el borrador,
        descarta lo que no sirva o crea a mano una alerta en borrador. Nada se publica solo.
      </p>
      <AvisoAccesoPrivado modo={env.CUENTAS_MODO} className="mt-6 max-w-[680px]" />
      <p role="status" className="mt-4 min-h-[1.25rem] text-sm font-medium text-texto">
        {hecho === "descartado" ? "Evento descartado. Queda en la auditoría." : null}
      </p>

      {eventos.length === 0 ? (
        <p className="mt-10 text-texto-suave">
          No hay eventos pendientes. La ingesta está apagada o todavía no hay feeds verificados que leer.
        </p>
      ) : (
        <ol className="mt-10 grid gap-4" aria-label="Eventos pendientes, por puntaje">
          {eventos.map((e) => (
            <li key={e.id} className={TARJETA}>
              <p className="text-xs text-apoyo">
                {temaEventoEtiqueta(e.tema)} · <strong className="font-semibold text-texto">Puntaje {e.puntaje}</strong>
                {e.puntaje >= UMBRAL_BORRADOR ? " (sobre el umbral)" : null} · {ESTADO_EVENTO_ETIQUETA[e.estado]} · confianza
                posible {CONFIANZA_POSIBLE_ETIQUETA[e.confianzaPosible].toLowerCase()}
                {e.cerrado ? " · cerrado a nuevas fuentes" : null}
              </p>
              <h2 className="mt-2 font-serif text-xl leading-tight text-texto">
                <Link href={`/admin/eventos/${e.id}`} className={ENLACE}>
                  {e.tituloReferencia}
                </Link>
              </h2>
              <p className="mt-1 text-xs text-apoyo">
                <time dateTime={e.primero}>{formatearFechaHora(e.primero)}</time>
                {e.ultimo !== e.primero ? (
                  <>
                    {" – "}
                    <time dateTime={e.ultimo}>{formatearFechaHora(e.ultimo)}</time>
                  </>
                ) : null}
                {" · "}
                {describirSenales(e.senales, e.claveAgenda).join(" · ")}
              </p>
              <FuentesEvento fuentes={e.fuentes} className="mt-4" />
              {e.fuentesOcultas > 0 ? (
                <p className="mt-2 text-xs text-apoyo">Y {e.fuentesOcultas} fuentes más en el detalle.</p>
              ) : null}
              {e.borrador?.estado === "pendiente" ? (
                <ResumenBorrador borrador={e.borrador} className="mt-4" />
              ) : e.ultimoIntento && !e.borrador ? (
                <p className="mt-4 text-xs text-apoyo">La IA no dejó borrador: {describirIntento(e.ultimoIntento)}.</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                <Link href={`/admin/eventos/${e.id}`} className={buttonClasses("primary", "mt-4")}>
                  Revisar y crear alerta
                </Link>
                <details>
                  <summary className="micro mt-4 min-h-11 cursor-pointer pt-3 text-texto-suave">Descartar</summary>
                  <FormularioPanel
                    accion={descartarEventoAccion}
                    boton="Descartar evento"
                    variante="outline"
                    titulo={`Descartar ${e.tituloReferencia}`}
                  >
                    <Ocultos csrf={sesion.csrf} />
                    <input type="hidden" name="evento_id" value={e.id} />
                    <label htmlFor={`nota-${e.id}`} className={`${ETIQUETA} mt-2 block`}>
                      Motivo (interno, opcional)
                    </label>
                    <input id={`nota-${e.id}`} name="nota" maxLength={500} className={CAMPO} />
                  </FormularioPanel>
                </details>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
