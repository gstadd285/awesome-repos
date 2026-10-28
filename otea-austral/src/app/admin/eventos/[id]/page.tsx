import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  aceptarBorradorAccion,
  crearAlertaDesdeEventoAccion,
  descartarBorradorAccion,
  descartarEventoAccion,
  pedirBorradorAccion,
} from "@/app/admin/eventos/acciones";
import { AvisoAccesoPrivado } from "@/components/admin/AvisoAccesoPrivado";
import { describirIntento, dolares, ResumenBorrador } from "@/components/admin/BorradorIa";
import { CamposAlerta } from "@/components/admin/CamposAlerta";
import { AYUDA, CAMPO, ENLACE, ETIQUETA, TARJETA } from "@/components/admin/estilos";
import {
  ACCION_EVENTO_ETIQUETA,
  CONFIANZA_POSIBLE_ETIQUETA,
  describirSenales,
  ESTADO_EVENTO_ETIQUETA,
  MOTIVO_DESCARTE_ETIQUETA,
  temaEventoEtiqueta,
} from "@/components/admin/etiquetas";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { FuentesEvento } from "@/components/admin/FuentesEvento";
import { Ocultos } from "@/components/admin/Ocultos";
import { TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { exigirSesion } from "@/lib/admin/acceso";
import { aContenidoAlerta, MOTIVOS_DESCARTE } from "@/lib/borradores/esquema";
import { colaEventos } from "@/lib/ingesta/cola";
import { MAX_FUENTES_POR_ALERTA, type FuenteDeEvento } from "@/lib/ingesta/cola-postgres";
import { formatearFechaHora } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Evento candidato" };

const AVISOS: Record<string, string> = {
  "borrador-descartado": "Borrador con IA descartado. Queda en la auditoría; el evento sigue en la cola.",
  "borrador-pedido": "Borrador pedido: lo redacta la próxima corrida del servicio de tareas, si allí la IA está activa.",
};

/** Casillas de las fuentes que se enlazan (las mismas para la alerta a mano y para aceptar un borrador). */
function CasillasFuentes({ prefijo, fuentes }: { prefijo: string; fuentes: readonly FuenteDeEvento[] }) {
  return (
    <fieldset className="grid gap-3">
      <legend className={ETIQUETA}>Fuentes que se enlazan (hasta {MAX_FUENTES_POR_ALERTA})</legend>
      {fuentes.map((f, i) => (
        <div key={f.id} className="flex items-start gap-3">
          <input
            id={`${prefijo}-${f.id}`}
            name="item"
            type="checkbox"
            value={f.id}
            defaultChecked={i < MAX_FUENTES_POR_ALERTA}
            className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
          />
          <label htmlFor={`${prefijo}-${f.id}`} className="text-sm leading-relaxed text-texto-suave">
            {f.organismo} ({TIPO_FUENTE_ETIQUETA[f.tipo].toLowerCase()}) · {f.titulo}
          </label>
        </div>
      ))}
      <p className={AYUDA}>Se copian el título, el enlace, la fecha y el identificador de cada una; la fecha de consulta es hoy.</p>
    </fieldset>
  );
}

function CampoRevisor({ prefijo }: { prefijo: string }) {
  return (
    <div className="mt-5">
      <label htmlFor={`${prefijo}-revisor`} className={ETIQUETA}>
        Revisado por
      </label>
      <input
        id={`${prefijo}-revisor`}
        name="revisor"
        maxLength={80}
        required
        defaultValue="Equipo editorial de Otea Austral"
        className={CAMPO}
      />
      <p className={AYUDA}>Nombre público del equipo o un alias. Nunca un correo.</p>
    </div>
  );
}

/**
 * Un evento candidato: señales, fuentes y las acciones de la cola (`docs/alertas-reales.md` §5). Si la IA dejó un
 * borrador, se muestra con sus banderas, la anticopia y las dudas, en el mismo formulario de alta (editable): aceptarlo
 * crea la alerta en borrador con las fuentes elegidas; descartarlo pide un motivo. Crear una alerta a mano sigue igual.
 * Toda alerta nace en borrador y `es_ejemplo` falso; después sigue el flujo de siempre en `/admin/alertas/[id]`.
 */
export default async function EventoPage({ params, searchParams }: PageProps<"/admin/eventos/[id]">) {
  const sesion = await exigirSesion();
  const cola = colaEventos();
  if (!cola) notFound();
  const { id } = await params;
  const { hecho } = await searchParams;
  const evento = await cola.obtener(id, new Date());
  if (!evento) notFound();
  const pendiente = evento.estado !== "descartado" && evento.estado !== "convertido";
  const tema = evento.tema === "sin_tema" ? undefined : evento.tema;
  const aviso = typeof hecho === "string" && Object.hasOwn(AVISOS, hecho) ? AVISOS[hecho] : null;
  const borrador = evento.borrador;
  const contenidoBorrador =
    pendiente && tema && borrador?.estado === "pendiente" && borrador.contenido
      ? aContenidoAlerta(borrador.contenido, tema, evento.confianzaPosible)
      : null;

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
      <p role="status" className="mt-4 min-h-[1.25rem] text-sm font-medium text-texto">
        {aviso}
      </p>

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
        <section aria-labelledby="ia-titulo" className="mt-16">
          <h2 id="ia-titulo" className="titular text-2xl text-texto">
            Borrador con IA
          </h2>
          {contenidoBorrador && borrador ? (
            <>
              <p className="mt-2 max-w-[680px] text-sm text-texto-suave">
                Lo redactó Claude sin herramientas, con los metadatos y, si las fuentes lo permiten, su texto leído al vuelo (nunca
                guardado). Pasó la revisión automática; tú compruebas los hechos en las fuentes, lo editas y decides. La confianza de
                cada fila es la que respaldan las fuentes (puedes bajarla).
              </p>
              <ResumenBorrador borrador={borrador} className={`${TARJETA} mt-6`} />
              <FormularioPanel
                accion={aceptarBorradorAccion}
                boton="Crear alerta con este borrador"
                titulo="Aceptar el borrador con IA"
                className={`${TARJETA} mt-6`}
              >
                <Ocultos csrf={sesion.csrf} />
                <input type="hidden" name="evento_id" value={evento.id} />
                <input type="hidden" name="borrador_id" value={borrador.id} />
                <CasillasFuentes prefijo="borrador-item" fuentes={evento.fuentes} />
                <div className="mt-5">
                  <CamposAlerta prefijo="borrador" alerta={contenidoBorrador} />
                </div>
                <CampoRevisor prefijo="borrador" />
                <p className="mt-5 text-sm leading-relaxed text-texto-suave">
                  Alerta real, no de ejemplo: nace como borrador, con lo que dejes aquí. Después la envías a revisión, la apruebas y la
                  publicas; nada se publica solo.
                </p>
              </FormularioPanel>
              <FormularioPanel
                accion={descartarBorradorAccion}
                boton="Descartar borrador"
                variante="outline"
                titulo="Descartar el borrador con IA"
                className={`${TARJETA} mt-6`}
              >
                <Ocultos csrf={sesion.csrf} />
                <input type="hidden" name="borrador_id" value={borrador.id} />
                <label htmlFor="borrador-motivo" className={`${ETIQUETA} block`}>
                  Motivo
                </label>
                <select id="borrador-motivo" name="motivo" required defaultValue="" className={CAMPO}>
                  <option value="" disabled>
                    Elige un motivo
                  </option>
                  {MOTIVOS_DESCARTE.map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_DESCARTE_ETIQUETA[m]}
                    </option>
                  ))}
                </select>
                <label htmlFor="borrador-nota" className={`${ETIQUETA} mt-4 block`}>
                  Nota (interna, opcional)
                </label>
                <input id="borrador-nota" name="nota" maxLength={400} className={CAMPO} />
                <p className={AYUDA}>Queda en la auditoría del evento; sirve para calibrar la IA. El evento sigue en la cola.</p>
              </FormularioPanel>
            </>
          ) : (
            <div className="mt-2 max-w-[680px] text-sm text-texto-suave">
              {borrador ? (
                <p>
                  Este evento ya tuvo su borrador con IA ({borrador.estado === "aceptado" ? "aceptado" : "descartado"}
                  {borrador.motivoDescarte ? `: ${MOTIVO_DESCARTE_ETIQUETA[borrador.motivoDescarte].toLowerCase()}` : ""}, costó{" "}
                  {dolares(borrador.costoMicros)}). Puedes crear la alerta a mano.
                </p>
              ) : evento.estado === "solicitado" ? (
                <p>Borrador pedido: lo redacta la próxima corrida del servicio de tareas, si allí la IA está activa.</p>
              ) : evento.ultimoIntento ? (
                <p>La IA no dejó borrador: {describirIntento(evento.ultimoIntento)}. Crea la alerta a mano.</p>
              ) : !evento.lecturaIa ? (
                <p>
                  Ninguna fuente de este evento permite la lectura con IA (lectura_ia): nada de él llega al modelo. Crea la
                  alerta a mano.
                </p>
              ) : (
                <p>Todavía sin borrador: la IA redacta los eventos sobre el umbral al final de cada corrida, si está activa.</p>
              )}
              {evento.sePuedePedir ? (
                <FormularioPanel accion={pedirBorradorAccion} boton="Pedir borrador con IA" variante="outline" titulo="Pedir borrador con IA">
                  <Ocultos csrf={sesion.csrf} />
                  <input type="hidden" name="evento_id" value={evento.id} />
                  <p className="mt-2">
                    Para un evento bajo el umbral: lo redacta la próxima corrida y cuenta para el tope mensual (un borrador cuesta
                    décimas de centavo).
                  </p>
                </FormularioPanel>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

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
            <CasillasFuentes prefijo="item" fuentes={evento.fuentes} />
            <div className="mt-5">
              <CamposAlerta prefijo="evento" tema={tema} />
            </div>
            <CampoRevisor prefijo="evento" />
            <p className="mt-5 text-sm leading-relaxed text-texto-suave">
              Alerta real, no de ejemplo: nace como borrador. Después la envías a revisión, la apruebas y la publicas; en
              /alertas solo la verán las cuentas con sesión.
              {borrador?.estado === "pendiente" ? " Si la creas a mano, el borrador con IA se descarta (motivo «otro»)." : null}
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

      {evento.intentos.length > 0 ? (
        <section aria-labelledby="intentos-titulo" className="mt-16">
          <h2 id="intentos-titulo" className="titular text-2xl text-texto">
            Intentos de la IA
          </h2>
          <p className="mt-2 text-sm text-texto-suave">Solo el resultado y un código: ningún texto rechazado se guarda.</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-texto-suave">
            {evento.intentos.map((i) => (
              <li key={`${i.creado}-${i.resultado}`}>
                <time dateTime={i.creado}>{formatearFechaHora(i.creado)}</time> · {describirIntento(i)} · {i.llamadas}{" "}
                {i.llamadas === 1 ? "llamada" : "llamadas"} · {dolares(i.costoMicros)}
              </li>
            ))}
          </ul>
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
