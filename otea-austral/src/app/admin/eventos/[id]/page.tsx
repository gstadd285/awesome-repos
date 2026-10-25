import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearAlertaDesdeEventoAccion, descartarEventoAccion } from "@/app/admin/eventos/acciones";
import { AvisoAccesoPrivado } from "@/components/admin/AvisoAccesoPrivado";
import { CamposAlerta } from "@/components/admin/CamposAlerta";
import { AYUDA, CAMPO, ENLACE, ETIQUETA, TARJETA } from "@/components/admin/estilos";
import {
  ACCION_EVENTO_ETIQUETA,
  CONFIANZA_POSIBLE_ETIQUETA,
  describirSenales,
  ESTADO_EVENTO_ETIQUETA,
  temaEventoEtiqueta,
} from "@/components/admin/etiquetas";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { FuentesEvento } from "@/components/admin/FuentesEvento";
import { Ocultos } from "@/components/admin/Ocultos";
import { TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { exigirSesion } from "@/lib/admin/acceso";
import { colaEventos } from "@/lib/ingesta/cola";
import { MAX_FUENTES_POR_ALERTA } from "@/lib/ingesta/cola-postgres";
import { formatearFechaHora } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Evento candidato" };

/**
 * Un evento candidato: señales, fuentes y las dos acciones de la cola sin IA (`docs/alertas-reales.md` §5). Crear una
 * alerta la deja en borrador, con las fuentes elegidas ya enlazadas y `es_ejemplo` falso; después sigue el flujo de
 * siempre en `/admin/alertas/[id]`.
 */
export default async function EventoPage({ params }: PageProps<"/admin/eventos/[id]">) {
  const sesion = await exigirSesion();
  const cola = colaEventos();
  if (!cola) notFound();
  const { id } = await params;
  const evento = await cola.obtener(id, new Date());
  if (!evento) notFound();
  const pendiente = evento.estado !== "descartado" && evento.estado !== "convertido";
  const tema = evento.tema === "sin_tema" ? undefined : evento.tema;

  return (
    <>
      <p className="micro text-apoyo">
        <Link href="/admin/eventos" className={ENLACE}>
          Eventos
        </Link>{" "}
        / Detalle
      </p>
      <p className="micro mt-6 text-apoyo">Primer título de las fuentes</p>
      <h1 className="mt-2 max-w-[30ch] font-serif text-3xl leading-tight text-texto">{evento.tituloReferencia}</h1>
      <p className="mt-3 text-sm text-texto-suave">
        <strong className="font-semibold text-texto">{ESTADO_EVENTO_ETIQUETA[evento.estado]}</strong> ·{" "}
        {temaEventoEtiqueta(evento.tema)} · puntaje {evento.puntaje} · confianza posible{" "}
        {CONFIANZA_POSIBLE_ETIQUETA[evento.confianzaPosible].toLowerCase()} ·{" "}
        <time dateTime={evento.primero}>{formatearFechaHora(evento.primero)}</time>
        {evento.ultimo !== evento.primero ? (
          <>
            {" – "}
            <time dateTime={evento.ultimo}>{formatearFechaHora(evento.ultimo)}</time>
          </>
        ) : null}
        {evento.cerrado ? " · cerrado a nuevas fuentes" : null}
      </p>
      <p className="mt-2 text-sm text-texto-suave">Señales: {describirSenales(evento.senales, evento.claveAgenda).join(" · ")}.</p>
      {evento.alertId ? (
        <p className="mt-2 text-sm text-texto">
          <Link href={`/admin/alertas/${evento.alertId}`} className={ENLACE}>
            Ver la alerta creada desde este evento
          </Link>
        </p>
      ) : null}
      <AvisoAccesoPrivado modo={env.CUENTAS_MODO} className="mt-6 max-w-[680px]" />

      <section aria-labelledby="fuentes-titulo" className="mt-16">
        <h2 id="fuentes-titulo" className="titular text-2xl text-texto">
          Fuentes
        </h2>
        <p className="mt-2 max-w-[680px] text-sm text-texto-suave">
          Solo metadatos: título, enlace, fecha y organismo. Abre cada documento oficial antes de escribir; el resumen va con
          palabras de Otea, nunca copiado.
        </p>
        <FuentesEvento fuentes={evento.fuentes} className="mt-6" />
        {evento.fuentesOcultas > 0 ? (
          <p className="mt-2 text-xs text-apoyo">Y {evento.fuentesOcultas} fuentes más que no caben en esta vista.</p>
        ) : null}
      </section>

      {pendiente ? (
        <section aria-labelledby="crear-titulo" className="mt-16">
          <h2 id="crear-titulo" className="titular text-2xl text-texto">
            Crear alerta desde este evento
          </h2>
          <FormularioPanel
            accion={crearAlertaDesdeEventoAccion}
            boton="Crear borrador con estas fuentes"
            titulo="Crear alerta desde el evento"
            className={`${TARJETA} mt-6`}
          >
            <Ocultos csrf={sesion.csrf} />
            <input type="hidden" name="evento_id" value={evento.id} />
            <fieldset className="grid gap-3">
              <legend className={ETIQUETA}>Fuentes que se enlazan (hasta {MAX_FUENTES_POR_ALERTA})</legend>
              {evento.fuentes.map((f, i) => (
                <div key={f.id} className="flex items-start gap-3">
                  <input
                    id={`item-${f.id}`}
                    name="item"
                    type="checkbox"
                    value={f.id}
                    defaultChecked={i < MAX_FUENTES_POR_ALERTA}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
                  />
                  <label htmlFor={`item-${f.id}`} className="text-sm leading-relaxed text-texto-suave">
                    {f.organismo} ({TIPO_FUENTE_ETIQUETA[f.tipo].toLowerCase()}) · {f.titulo}
                  </label>
                </div>
              ))}
              <p className={AYUDA}>
                Se copian el título, el enlace, la fecha y el identificador de cada una; la fecha de consulta es hoy.
              </p>
            </fieldset>
            <div className="mt-5">
              <CamposAlerta prefijo="evento" tema={tema} />
            </div>
            <div className="mt-5">
              <label htmlFor="evento-revisor" className={ETIQUETA}>
                Revisado por
              </label>
              <input
                id="evento-revisor"
                name="revisor"
                maxLength={80}
                required
                defaultValue="Equipo editorial de Otea Austral"
                className={CAMPO}
              />
              <p className={AYUDA}>Nombre público del equipo o un alias. Nunca un correo.</p>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-texto-suave">
              Alerta real, no de ejemplo: nace como borrador. Después la envías a revisión, la apruebas y la publicas; en
              /alertas solo la verán las cuentas con sesión.
            </p>
          </FormularioPanel>

          <FormularioPanel accion={descartarEventoAccion} boton="Descartar evento" variante="outline" titulo="Descartar evento" className={`${TARJETA} mt-6`}>
            <Ocultos csrf={sesion.csrf} />
            <input type="hidden" name="evento_id" value={evento.id} />
            <label htmlFor="descartar-nota" className={`${ETIQUETA} block`}>
              Motivo (interno, opcional)
            </label>
            <input id="descartar-nota" name="nota" maxLength={500} className={CAMPO} />
            <p className={AYUDA}>Queda en la auditoría del evento; sirve para calibrar el puntaje.</p>
          </FormularioPanel>
        </section>
      ) : null}

      <section aria-labelledby="auditoria-titulo" className="mt-16">
        <h2 id="auditoria-titulo" className="titular text-2xl text-texto">
          Auditoría
        </h2>
        <p className="mt-2 text-sm text-texto-suave">Registro de solo agregar: no se edita ni se borra.</p>
        {evento.auditoria.length === 0 ? (
          <p className="mt-6 text-sm text-apoyo">Sin acciones todavía.</p>
        ) : (
          <div className="relative mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="micro text-apoyo">
                <tr className="border-b border-linea">
                  <th scope="col" className="py-3 pr-4 font-normal">Fecha</th>
                  <th scope="col" className="py-3 pr-4 font-normal">Acción</th>
                  <th scope="col" className="py-3 pr-4 font-normal">Actor</th>
                  <th scope="col" className="py-3 font-normal">Nota</th>
                </tr>
              </thead>
              <tbody>
                {evento.auditoria.map((f) => (
                  <tr key={`${f.fecha}-${f.accion}`} className="border-b border-linea align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-texto-suave">
                      <time dateTime={f.fecha}>{formatearFechaHora(f.fecha)}</time>
                    </td>
                    <td className="py-3 pr-4 text-texto">{ACCION_EVENTO_ETIQUETA[f.accion]}</td>
                    <td className="py-3 pr-4 text-texto-suave">{f.actor}</td>
                    <td className="py-3 text-texto-suave">{f.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
