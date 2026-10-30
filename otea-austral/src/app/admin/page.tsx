import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoAccesoPrivado } from "@/components/admin/AvisoAccesoPrivado";
import { dolares } from "@/components/admin/BorradorIa";
import { FormularioAcceso } from "@/components/admin/FormularioAcceso";
import { ENLACE, TARJETA } from "@/components/admin/estilos";
import { sesionActual } from "@/lib/admin/acceso";
import { avisosDeOperacion } from "@/lib/ingesta/avisos";
import { colaEventos } from "@/lib/ingesta/cola";
import { formatearFechaHora } from "@/lib/format";
import { env } from "@/lib/env";

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
  const ahora = new Date();
  const t = await cola.tablero(ahora);
  const c = t.ultimaCorrida;
  const g = t.gastoMes;
  const r = t.resumen;
  const avisos = avisosDeOperacion(t, ahora);

  return (
    <>
      <p className="micro text-apoyo">Panel interno</p>
      <h1 className="titular mt-3 text-titulo text-texto">Tablero</h1>
      <AvisoAccesoPrivado modo={env.CUENTAS_MODO} className="mt-6 max-w-[680px]" />
      {/* Lo primero de la rutina de cada mañana (docs/rutina-diaria.md): qué revisar hoy. */}
      <div role="note" aria-label="Avisos de operación" className="mt-6 max-w-[680px] rounded-badge bg-papel-alto p-4 text-sm leading-relaxed text-texto linea-fina">
        {avisos.length > 0 ? (
          <>
            <p className="font-semibold">Revisa hoy:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Sin avisos de operación.</p>
        )}
      </div>

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
          {t.feedsSinNovedades.length > 0 ? (
            <div className="mt-4 text-sm text-texto-suave">
              <p className="font-medium text-texto">Sin ítems nuevos en 14 días:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {t.feedsSinNovedades.map((f) => (
                  <li key={f.feedUrl}>
                    {f.organismo} · último ítem{" "}
                    {f.ultimoItem ? <time dateTime={f.ultimoItem}>{formatearFechaHora(f.ultimoItem)}</time> : "nunca"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="cola-titulo" className={TARJETA}>
          <h2 id="cola-titulo" className="titular text-xl text-texto">
            Cola
          </h2>
          <p className="mt-4 text-sm text-texto-suave">
            <strong className="font-semibold text-texto">{t.eventosPendientes}</strong>{" "}
            {t.eventosPendientes === 1 ? "evento candidato pendiente" : "eventos candidatos pendientes"}
            {t.itemsSinEvento > 0 ? ` · ${t.itemsSinEvento} ítems esperan la próxima agrupación` : null}
            {" · "}
            <strong className="font-semibold text-texto">{t.borradoresPendientes}</strong>{" "}
            {t.borradoresPendientes === 1 ? "borrador con IA por revisar" : "borradores con IA por revisar"}.
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

        <section aria-labelledby="gasto-titulo" className={TARJETA}>
          <h2 id="gasto-titulo" className="titular text-xl text-texto">
            Gasto de la IA
          </h2>
          {g.topeMicros ? (
            <p className="mt-4 text-sm text-texto-suave">
              Borradores este mes: <strong className="font-semibold text-texto">{dolares(g.micros)}</strong> de un tope de{" "}
              {dolares(g.topeMicros)} · {g.llamadas} {g.llamadas === 1 ? "llamada" : "llamadas"}
              {g.micros >= g.topeMicros * 0.8 ? (
                <strong className="font-semibold text-texto"> · Aviso: pasó el 80 % del tope del mes.</strong>
              ) : null}
            </p>
          ) : (
            <p className="mt-4 text-sm text-texto-suave">
              Sin gasto de borradores este mes: la IA de borradores está apagada (por omisión) o todavía no llamó al modelo.
            </p>
          )}
          <p className="mt-2 text-sm text-texto-suave">
            Toda la IA (asistente y borradores) desde el primer día: {dolares(t.gastoTotalMicros)}. El tope mensual de los borradores
            no pasa de US$ 5; el límite del espacio de trabajo en la consola de Anthropic es la última barrera.
          </p>
        </section>

        <section aria-labelledby="resumen-titulo" className={TARJETA}>
          <h2 id="resumen-titulo" className="titular text-xl text-texto">
            Resumen diario
          </h2>
          <p className="mt-4 text-sm text-texto-suave">
            <strong className="font-semibold text-texto">{r.suscritas}</strong> {r.suscritas === 1 ? "cuenta lo pidió" : "cuentas lo pidieron"} · hoy{" "}
            {r.enviadosHoy} {r.enviadosHoy === 1 ? "enviado" : "enviados"}
            {r.fallidosHoy > 0 ? ` · ${r.fallidosHoy} sin salir` : null}.
          </p>
          {r.ultimaCorrida ? (
            <p className="mt-2 text-sm text-texto-suave">
              Última corrida: <time dateTime={r.ultimaCorrida.inicio}>{formatearFechaHora(r.ultimaCorrida.inicio)}</time> ·{" "}
              <strong className="font-semibold text-texto">{RESULTADO_ETIQUETA[r.ultimaCorrida.resultado] ?? r.ultimaCorrida.resultado}</strong> ·{" "}
              {r.ultimaCorrida.enviados} {r.ultimaCorrida.enviados === 1 ? "enviado" : "enviados"} de {r.ultimaCorrida.cuentas}{" "}
              {r.ultimaCorrida.cuentas === 1 ? "cuenta revisada" : "cuentas revisadas"} (sin alertas nuevas en sus temas, no se envía) ·{" "}
              {r.ultimaCorrida.fallos} fallos
            </p>
          ) : (
            <p className="mt-2 text-sm text-texto-suave">Todavía no corrió: el resumen está apagado por omisión (servicio de tareas).</p>
          )}
        </section>
      </div>
    </>
  );
}
