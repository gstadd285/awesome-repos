import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  agregarFuenteAccion,
  aprobarAccion,
  editarAccion,
  enviarARevisionAccion,
  publicarAccion,
  retirarFuenteAccion,
  retractarAccion,
  type Hecho,
} from "@/app/admin/alertas/acciones";
import { AlertCard } from "@/components/alert-card/AlertCard";
import { TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { CamposAlerta } from "@/components/admin/CamposAlerta";
import { AYUDA, CAMPO, ENLACE, ETIQUETA, TARJETA } from "@/components/admin/estilos";
import { ACCION_ETIQUETA, ESTADO_ETIQUETA, IMPACTO_ETIQUETA } from "@/components/admin/etiquetas";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { Ocultos } from "@/components/admin/Ocultos";
import { exigirSesion } from "@/lib/admin/acceso";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import { safeHref } from "@/lib/domain/url";
import { formatearFecha, formatearFechaHora, hoyEnChile } from "@/lib/format";

export const metadata: Metadata = { title: "Alerta" };

const AVISOS: Record<Hecho, string> = {
  creada: "Alerta creada como borrador.",
  revision: "Alerta enviada a revisión.",
  aprobada: "Aprobación registrada en la auditoría.",
  publicada: "Alerta publicada.",
  editada: "Cambios guardados.",
  retractada: "Alerta retractada. Sigue visible, tachada, con el aviso arriba.",
  "fuente-agregada": "Fuente enlazada.",
  "fuente-retirada": "Fuente retirada. Queda en el historial.",
};

const esHecho = (v: unknown): v is Hecho => typeof v === "string" && Object.hasOwn(AVISOS, v);

/** Texto público obligatorio cuando el cambio afecta a una alerta ya publicada (regla 4). */
function CampoCorreccion({ prefijo }: { prefijo: string }) {
  return (
    <div className="mt-4">
      <label htmlFor={`${prefijo}-correccion`} className={ETIQUETA}>
        Texto público de la corrección
      </label>
      <textarea id={`${prefijo}-correccion`} name="texto_correccion" rows={3} maxLength={600} required className={CAMPO} />
      <p className={AYUDA}>La alerta está publicada: el cambio se muestra como corrección con su fecha.</p>
    </div>
  );
}

export default async function DetalleAlertaPage({ params, searchParams }: PageProps<"/admin/alertas/[id]">) {
  const sesion = await exigirSesion();
  const repo = repositorioAlertas();
  if (!repo) notFound();
  const { id } = await params;
  const { hecho } = await searchParams;
  const detalle = await repo.obtener(id);
  if (!detalle) notFound();
  const registro = await repo.fuentesDelRegistro();

  const { alerta, version, vista, auditoria } = detalle;
  const publicada = alerta.estado === "publicada" || alerta.estado === "corregida";
  const retractada = alerta.estado === "retractada";
  const enEdicion = alerta.estado === "borrador" || alerta.estado === "en_revision";
  const ocultos = <Ocultos csrf={sesion.csrf} id={alerta.id} version={version} />;
  const aviso = esHecho(hecho) ? AVISOS[hecho] : null;

  return (
    <>
      <p className="micro text-apoyo">
        <Link href="/admin/alertas" className={ENLACE}>
          Alertas
        </Link>{" "}
        / Detalle
      </p>
      <h1 className="mt-3 max-w-[30ch] font-serif text-3xl leading-tight text-texto">{alerta.evento}</h1>
      <p className="mt-3 text-sm text-texto-suave">
        <strong className="font-semibold text-texto">{ESTADO_ETIQUETA[alerta.estado]}</strong> ·{" "}
        {IMPACTO_ETIQUETA[alerta.impacto]} · versión {version} · creada el{" "}
        <time dateTime={detalle.creada}>{formatearFechaHora(detalle.creada)}</time>
        {alerta.es_ejemplo ? " · Datos de ejemplo" : null}
      </p>
      <p role="status" className="mt-4 min-h-[1.25rem] text-sm font-medium text-texto">
        {aviso}
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="vista-titulo">
          <h2 id="vista-titulo" className="micro text-apoyo">
            Así se ve en el sitio
          </h2>
          <AlertCard alerta={vista} nivelTitulo={3} className="mt-4" />
        </section>

        <section aria-labelledby="estado-titulo" className={TARJETA}>
          <h2 id="estado-titulo" className="titular text-xl text-texto">
            Estado y publicación
          </h2>
          {enEdicion ? (
            detalle.motivosParaNoPublicar.length > 0 ? (
              <div className="mt-4 text-sm text-texto-suave">
                <p className="font-medium text-texto">Para publicar falta:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {detalle.motivosParaNoPublicar.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-texto">Cumple las reglas para publicarse.</p>
            )
          ) : null}

          {alerta.estado === "borrador" ? (
            <FormularioPanel accion={enviarARevisionAccion} boton="Enviar a revisión" variante="outline" titulo="Enviar a revisión">
              {ocultos}
            </FormularioPanel>
          ) : null}

          {alerta.estado === "en_revision" ? (
            <FormularioPanel accion={aprobarAccion} boton="Registrar aprobación" variante="outline" titulo="Aprobar" className="mt-4">
              {ocultos}
              <label htmlFor="aprobar-nota" className={`${ETIQUETA} mt-2 block`}>
                Nota de la aprobación (interna, opcional)
              </label>
              <input id="aprobar-nota" name="nota" maxLength={500} className={CAMPO} />
            </FormularioPanel>
          ) : null}

          {enEdicion ? (
            <FormularioPanel accion={publicarAccion} boton="Publicar" titulo="Publicar" className="mt-2">
              {ocultos}
            </FormularioPanel>
          ) : null}

          {publicada ? (
            <FormularioPanel accion={retractarAccion} boton="Retractar" variante="outline" titulo="Retractar" className="mt-4">
              {ocultos}
              <p className="text-sm text-texto-suave">
                La alerta sigue visible, tachada y con este aviso arriba. No se borra.
              </p>
              <label htmlFor="retractar-texto" className={`${ETIQUETA} mt-4 block`}>
                Texto público de la retractación
              </label>
              <textarea id="retractar-texto" name="texto_publico" rows={3} maxLength={600} required className={CAMPO} />
            </FormularioPanel>
          ) : null}

          {retractada ? (
            <p className="mt-4 text-sm text-texto-suave">
              Retractada: se mantiene publicada, tachada, y ya no admite cambios.
            </p>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="fuentes-titulo" className="mt-16">
        <h2 id="fuentes-titulo" className="titular text-2xl text-texto">
          Fuentes
        </h2>
        <p className="mt-2 max-w-[680px] text-sm text-texto-suave">
          Se guarda la referencia (organismo, título, enlace y fechas), nunca el texto. El organismo y el tipo se copian
          del registro al enlazar.
        </p>

        {detalle.enlaces.length === 0 ? (
          <p className="mt-6 text-sm text-apoyo">Aún no hay fuentes enlazadas.</p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {detalle.enlaces.map((e) => {
              const href = safeHref(e.url);
              return (
                <li key={e.id} className={`${TARJETA} ${e.retirada ? "opacity-80" : ""}`}>
                  <p className="text-xs text-apoyo">
                    {e.organismo} · {TIPO_FUENTE_ETIQUETA[e.tipo]}
                    {e.retirada ? (
                      <>
                        {" · "}
                        <strong className="font-semibold text-texto">Retirada</strong> el{" "}
                        <time dateTime={e.retirada}>{formatearFechaHora(e.retirada)}</time>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                        {e.titulo_documento}
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                    ) : (
                      e.titulo_documento
                    )}
                  </p>
                  <p className="mt-1 text-xs text-apoyo">
                    Publicado el {formatearFecha(e.fecha_publicacion)} · consultado el {formatearFecha(e.fecha_consulta)}
                    {e.identificador ? ` · ${e.identificador}` : null}
                  </p>
                  {!e.retirada && !retractada ? (
                    <details className="mt-3">
                      <summary className="micro cursor-pointer text-texto-suave">Retirar esta fuente</summary>
                      <FormularioPanel accion={retirarFuenteAccion} boton="Retirar fuente" variante="outline" titulo={`Retirar ${e.titulo_documento}`}>
                        {ocultos}
                        <input type="hidden" name="enlace_id" value={e.id} />
                        {publicada ? <CampoCorreccion prefijo={`retirar-${e.id}`} /> : null}
                      </FormularioPanel>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!retractada ? (
          <FormularioPanel accion={agregarFuenteAccion} boton="Enlazar fuente" titulo="Enlazar fuente" className={`${TARJETA} mt-6`}>
            {ocultos}
            <h3 className="titular text-lg text-texto">Enlazar un documento</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="fuente-registro" className={ETIQUETA}>
                  Fuente del registro
                </label>
                <select id="fuente-registro" name="source_id" required className={CAMPO}>
                  {registro.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.organismo} · {f.nombre} ({TIPO_FUENTE_ETIQUETA[f.tipo].toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fuente-titulo" className={ETIQUETA}>
                  Título del documento
                </label>
                <input id="fuente-titulo" name="titulo_documento" maxLength={300} required className={CAMPO} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fuente-url" className={ETIQUETA}>
                  Enlace (solo https)
                </label>
                <input id="fuente-url" name="url" type="url" maxLength={2048} required placeholder="https://" className={CAMPO} />
              </div>
              <div>
                <label htmlFor="fuente-publicacion" className={ETIQUETA}>
                  Fecha de publicación
                </label>
                <input id="fuente-publicacion" name="fecha_publicacion" type="date" required className={CAMPO} />
              </div>
              <div>
                <label htmlFor="fuente-consulta" className={ETIQUETA}>
                  Fecha de consulta
                </label>
                <input
                  id="fuente-consulta"
                  name="fecha_consulta"
                  type="date"
                  required
                  defaultValue={hoyEnChile()}
                  className={CAMPO}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fuente-identificador" className={ETIQUETA}>
                  Identificador (opcional)
                </label>
                <input id="fuente-identificador" name="identificador" maxLength={120} className={CAMPO} />
                <p className={AYUDA}>Número de documento, de resolución o ID del organismo.</p>
              </div>
            </div>
            {publicada ? <CampoCorreccion prefijo="agregar" /> : null}
          </FormularioPanel>
        ) : null}
      </section>

      {!retractada ? (
        <section aria-labelledby="editar-titulo" className="mt-16">
          <h2 id="editar-titulo" className="titular text-2xl text-texto">
            Editar contenido
          </h2>
          <FormularioPanel
            accion={editarAccion}
            boton={publicada ? "Publicar corrección" : "Guardar cambios"}
            titulo="Editar contenido"
            className={`${TARJETA} mt-6`}
          >
            {ocultos}
            <CamposAlerta prefijo="editar" alerta={alerta} />
            {publicada ? <CampoCorreccion prefijo="editar" /> : null}
          </FormularioPanel>
        </section>
      ) : null}

      <section aria-labelledby="auditoria-titulo" className="mt-16">
        <h2 id="auditoria-titulo" className="titular text-2xl text-texto">
          Auditoría
        </h2>
        <p className="mt-2 text-sm text-texto-suave">Registro de solo agregar: no se edita ni se borra.</p>
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
              {auditoria.map((f) => (
                <tr key={f.id} className="border-b border-linea align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-suave">
                    <time dateTime={f.fecha}>{formatearFechaHora(f.fecha)}</time>
                  </td>
                  <td className="py-3 pr-4 text-texto">{ACCION_ETIQUETA[f.accion]}</td>
                  <td className="py-3 pr-4 text-texto-suave">{f.actor}</td>
                  <td className="py-3 text-texto-suave">{f.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
