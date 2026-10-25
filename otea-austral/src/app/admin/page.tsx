import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoSinAccesoPrivado } from "@/components/admin/AvisoSinAccesoPrivado";
import { FormularioAcceso } from "@/components/admin/FormularioAcceso";
import { ENLACE, TARJETA } from "@/components/admin/estilos";
import { sesionActual } from "@/lib/admin/acceso";
import { colaEventos } from "@/lib/ingesta/cola";
import { formatearFechaHora } from "@/lib/format";

export const metadata: Metadata = { title: "Inicio" };

const RESULTADO_ETIQUETA: Record<string, string> = {
  ok: "Correcta",
  parcial: "Parcial",
  fallida: "Fallida",
  omitida: "Omitida (otra corrida tenía el turno)",
};

/** Sin sesión, el acceso con dos pasos. Con sesión, el tablero (`docs/alertas-reales.md` §5): ingesta y cola. */
export default async function PanelPage() {
  const sesion = await sesionActual();
  if (!sesion) {
    return (
      <section aria-labelledby="acceso-titulo" className="mx-auto max-w-[460px]">
        <h1 id="acceso-titulo" className="titular text-titulo text-texto">
          Acceso al panel.
        </h1>
        <p className="mt-4 leading-relaxed text-texto-suave">
          Verificación en dos pasos: escribe tu frase de acceso y el código de seis dígitos de tu app de autenticación.
        </p>
        <FormularioAcceso />
      </section>
    );
  }

  const cola = colaEventos();
  if (!cola) notFound();
  const t = await cola.tablero(new Date());
  const c = t.ultimaCorrida;

  return (
    <>
      <p className="micro text-apoyo">Panel interno</p>
      <h1 className="titular mt-3 text-titulo text-texto">Tablero</h1>
      <AvisoSinAccesoPrivado className="mt-6 max-w-[680px]" />

      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="ingesta-titulo" className={TARJETA}>
          <h2 id="ingesta-titulo" className="titular text-xl text-texto">
            Ingesta
          </h2>
          {c ? (
            <p className="mt-4 text-sm text-texto-suave">
              Última corrida: <time dateTime={c.inicio}>{formatearFechaHora(c.inicio)}</time> ·{" "}
              <strong className="font-semibold text-texto">{RESULTADO_ETIQUETA[c.resultado] ?? c.resultado}</strong> · {c.feeds}{" "}
              feeds · {c.nuevos} ítems nuevos · {c.fallos} fallos
            </p>
          ) : (
            <p className="mt-4 text-sm text-texto-suave">
              Todavía no hay corridas: la ingesta está apagada (servicio de tareas) o no hay feeds verificados.
            </p>
          )}
          {t.feedsConProblemas.length > 0 ? (
            <div className="mt-4 text-sm text-texto-suave">
              <p className="font-medium text-texto">Feeds en pausa o con fallos:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {t.feedsConProblemas.map((f) => (
                  <li key={f.feedUrl}>
                    {f.organismo} · {f.ultimoError ?? "sin código"} · {f.fallosSeguidos} fallos seguidos
                    {f.pausadoHasta ? (
                      <>
                        {" · en pausa hasta "}
                        <time dateTime={f.pausadoHasta}>{formatearFechaHora(f.pausadoHasta)}</time>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-texto-suave">Ningún feed en pausa ni con fallos.</p>
          )}
        </section>

        <section aria-labelledby="cola-titulo" className={TARJETA}>
          <h2 id="cola-titulo" className="titular text-xl text-texto">
            Cola
          </h2>
          <p className="mt-4 text-sm text-texto-suave">
            <strong className="font-semibold text-texto">{t.eventosPendientes}</strong>{" "}
            {t.eventosPendientes === 1 ? "evento candidato pendiente" : "eventos candidatos pendientes"}
            {t.itemsSinEvento > 0 ? ` · ${t.itemsSinEvento} ítems esperan la próxima agrupación` : null}.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/admin/eventos" className={ENLACE}>
              Revisar la cola de eventos
            </Link>
          </p>
          <p className="mt-2 text-sm">
            <Link href="/admin/alertas" className={ENLACE}>
              Ver las alertas
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
