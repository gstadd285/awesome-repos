import type { Metadata } from "next";
import { revocarInvitacionAccion } from "@/app/admin/invitaciones/acciones";
import { AvisoAccesoPrivado } from "@/components/admin/AvisoAccesoPrivado";
import { TARJETA } from "@/components/admin/estilos";
import { FormularioInvitacion } from "@/components/admin/FormularioInvitacion";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { Ocultos } from "@/components/admin/Ocultos";
import { exigirSesion } from "@/lib/admin/acceso";
import {
  ENVIOS_POR_INVITACION,
  INVITACIONES_VIGENTES_MAX,
  VIGENCIA_INVITACION_DIAS,
  VIGENCIA_MAXIMA_INVITACION_DIAS,
} from "@/lib/cuentas/constantes";
import { servicioInvitaciones } from "@/lib/cuentas/instancia";
import type { EstadoInvitacion } from "@/lib/cuentas/invitaciones";
import { env } from "@/lib/env";
import { formatearFechaHora } from "@/lib/format";

export const metadata: Metadata = { title: "Invitaciones" };

const ESTADO: Record<EstadoInvitacion, string> = {
  vigente: "Vigente",
  agotada: `Sin correos (${ENVIOS_POR_INVITACION} de ${ENVIOS_POR_INVITACION})`,
  vencida: "Vencida",
  usada: "Usada",
  revocada: "Revocada",
};

const ACCION: Record<"emitida" | "revocada" | "usada", string> = { emitida: "Emitida", revocada: "Revocada", usada: "Usada" };

const MODO: Record<string, string> = {
  invitacion: "por invitación (acceso anticipado privado): solo se crean cuentas con estos códigos",
  abiertas: "abiertas: cualquiera puede crear una cuenta; los códigos todavía no se piden",
  memoria: "en memoria (desarrollo): los códigos no se piden",
  cerradas: "cerradas: nadie puede crear una cuenta todavía; puedes preparar los códigos",
};

/**
 * Invitaciones del acceso anticipado (`docs/alertas-reales.md` §6): emitir (alias y vigencia), ver su estado y revocar.
 * El código se muestra una sola vez al emitirlo; aquí nunca aparece (la base guarda solo su HMAC).
 */
export default async function InvitacionesPage({ searchParams }: PageProps<"/admin/invitaciones">) {
  const sesion = await exigirSesion();
  const { hecho } = await searchParams;
  const servicio = servicioInvitaciones();
  const lista = servicio ? await servicio.listar() : null;

  return (
    <>
      <p className="micro text-apoyo">Panel interno</p>
      <h1 className="titular mt-3 text-titulo text-texto">Invitaciones</h1>
      <p className="mt-4 max-w-[680px] leading-relaxed text-texto-suave">
        Cada código sirve para crear una sola cuenta, vence y se puede revocar. Las cuentas están {MODO[env.CUENTAS_MODO]}.
      </p>
      <AvisoAccesoPrivado modo={env.CUENTAS_MODO} className="mt-6 max-w-[680px]" />
      <p role="status" className="mt-4 min-h-[1.25rem] text-sm font-medium text-texto">
        {hecho === "revocada" ? "Invitación revocada. Queda en la auditoría." : null}
      </p>

      {!lista ? (
        <p className="mt-10 max-w-[680px] text-texto-suave">
          Para emitir invitaciones hace falta CUENTAS_SECRETO (npm run cuentas:secreto) en esta revisión: de él sale la clave
          que guarda la huella de cada código.
        </p>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
          <section aria-labelledby="emitir-titulo" className={TARJETA}>
            <h2 id="emitir-titulo" className="titular text-xl text-texto">
              Emitir
            </h2>
            <p className="mt-4 mb-5 text-sm text-texto-suave">
              {lista.vigentes} de {INVITACIONES_VIGENTES_MAX} vigentes.
            </p>
            <FormularioInvitacion dias={VIGENCIA_INVITACION_DIAS} maximo={VIGENCIA_MAXIMA_INVITACION_DIAS}>
              <Ocultos csrf={sesion.csrf} />
            </FormularioInvitacion>
          </section>

          <section aria-labelledby="auditoria-titulo" className={TARJETA}>
            <h2 id="auditoria-titulo" className="titular text-xl text-texto">
              Auditoría
            </h2>
            {lista.auditoria.length === 0 ? (
              <p className="mt-4 text-sm text-texto-suave">Todavía no hay movimientos.</p>
            ) : (
              <ul className="mt-4 space-y-1 text-sm text-texto-suave" aria-label="Últimos movimientos">
                {lista.auditoria.map((a, i) => (
                  <li key={`${a.invitacionId}-${a.accion}-${i}`}>
                    <time dateTime={a.fecha}>{formatearFechaHora(a.fecha)}</time> · {ACCION[a.accion]} · {a.alias}
                    {a.actor ? ` · por ${a.actor}` : " · al crear la cuenta"}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {lista && lista.invitaciones.length > 0 ? (
        <div className="relative mt-10 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Invitaciones, de la más reciente a la más antigua</caption>
            <thead className="micro text-apoyo">
              <tr className="border-b border-linea">
                <th scope="col" className="py-3 pr-4 font-normal">Alias</th>
                <th scope="col" className="py-3 pr-4 font-normal">Emitida</th>
                <th scope="col" className="py-3 pr-4 font-normal">Vence</th>
                <th scope="col" className="py-3 pr-4 font-normal">Estado</th>
                <th scope="col" className="py-3 pr-4 font-normal">Correos</th>
                <th scope="col" className="py-3 font-normal">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.invitaciones.map((i) => (
                <tr key={i.id} className="border-b border-linea align-top" data-estado={i.estado}>
                  <td className="py-3 pr-4 text-texto">{i.alias}</td>
                  <td className="py-3 pr-4 text-texto-suave">
                    <time dateTime={i.emitida}>{formatearFechaHora(i.emitida)}</time>
                  </td>
                  <td className="py-3 pr-4 text-texto-suave">
                    <time dateTime={i.vence}>{formatearFechaHora(i.vence)}</time>
                  </td>
                  <td className="py-3 pr-4 text-texto">
                    {ESTADO[i.estado]}
                    {i.usada ? (
                      <>
                        {" · "}
                        <time dateTime={i.usada}>{formatearFechaHora(i.usada)}</time>
                      </>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-texto-suave">{i.envios}</td>
                  <td className="py-3">
                    {i.estado === "vigente" || i.estado === "agotada" ? (
                      <FormularioPanel accion={revocarInvitacionAccion} boton="Revocar" variante="outline" titulo={`Revocar ${i.alias}`}>
                        <Ocultos csrf={sesion.csrf} id={i.id} />
                      </FormularioPanel>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
