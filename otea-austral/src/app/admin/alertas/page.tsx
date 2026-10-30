import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ENLACE } from "@/components/admin/estilos";
import { ESTADO_ETIQUETA, IMPACTO_ETIQUETA } from "@/components/admin/etiquetas";
import { buttonClasses } from "@/components/ui/button";
import { exigirSesion } from "@/lib/admin/acceso";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import { TEMA_ETIQUETA } from "@/lib/domain/temas";
import { formatearFechaHora } from "@/lib/format";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertasAdminPage() {
  await exigirSesion();
  const repo = repositorioAlertas();
  if (!repo) notFound();
  const alertas = await repo.listar();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="micro text-apoyo">Panel interno</p>
          <h1 className="titular mt-3 text-titulo text-texto">Alertas</h1>
        </div>
        <Link href="/admin/alertas/nueva" className={buttonClasses("primary")}>
          Nueva alerta
        </Link>
      </div>

      {alertas.length === 0 ? (
        <p className="mt-10 text-texto-suave">Todavía no hay alertas. Crea la primera como borrador.</p>
      ) : (
        <div className="relative mt-10 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Alertas, de la más reciente a la más antigua</caption>
            <thead className="micro text-apoyo">
              <tr className="border-b border-linea">
                <th scope="col" className="py-3 pr-4 font-normal">Evento</th>
                <th scope="col" className="py-3 pr-4 font-normal">Tema</th>
                <th scope="col" className="py-3 pr-4 font-normal">Estado</th>
                <th scope="col" className="py-3 pr-4 font-normal">Impacto</th>
                <th scope="col" className="py-3 pr-4 font-normal">Fuentes</th>
                <th scope="col" className="py-3 font-normal">Último cambio</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} className="border-b border-linea align-top">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/alertas/${a.id}`} className={ENLACE}>
                      {a.evento}
                    </Link>
                    {a.es_ejemplo ? <span className="ml-2 text-xs text-apoyo">(datos de ejemplo)</span> : null}
                  </td>
                  <td className="py-3 pr-4 text-texto-suave">{TEMA_ETIQUETA[a.tema]}</td>
                  <td className="py-3 pr-4 text-texto">{ESTADO_ETIQUETA[a.estado]}</td>
                  <td className="py-3 pr-4 text-texto-suave">{IMPACTO_ETIQUETA[a.impacto]}</td>
                  <td className="py-3 pr-4 text-texto-suave">{a.fuentes_activas}</td>
                  <td className="py-3 text-texto-suave">
                    <time dateTime={a.actualizada}>{formatearFechaHora(a.actualizada)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
