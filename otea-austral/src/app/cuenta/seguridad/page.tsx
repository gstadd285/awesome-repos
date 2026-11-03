import type { Metadata } from "next";
import { FormularioClave, ListaSesiones, PanelDosPasos } from "@/components/cuenta/FormulariosDeCuenta";
import { NavegacionCuenta } from "@/components/cuenta/NavegacionCuenta";
import { Banner, SeccionCuenta, SinDatos, textoDeAviso } from "@/components/cuenta/Paneles";
import { ContentPage } from "@/components/layout/ContentPage";
import { exigirSesionCuenta } from "@/lib/cuentas/acceso";
import { DESCRIPCION_EVENTO } from "@/lib/cuentas/formato";
import { servicioCuentas } from "@/lib/cuentas/instancia";
import { qrParaEnlace } from "@/lib/cuentas/qr";
import { formatearDia, formatearFechaHora } from "@/lib/format";

export const metadata: Metadata = { title: "Seguridad de la cuenta", robots: { index: false, follow: false } };

export default async function SeguridadCuentaPage({ searchParams }: PageProps<"/cuenta/seguridad">) {
  const sesion = await exigirSesionCuenta();
  const { aviso } = await searchParams;
  const servicio = servicioCuentas();
  const [perfil, sesiones, eventos, pendiente] = await Promise.all([
    servicio.perfil(sesion.cuentaId),
    servicio.sesionesAbiertas(sesion),
    servicio.actividad(sesion.cuentaId),
    sesion.dosPasos ? Promise.resolve(null) : servicio.dosPasosPendiente(sesion.cuentaId),
  ]);
  const texto = textoDeAviso(aviso);
  return (
    <ContentPage
      ruta="/cuenta/seguridad"
      rotulo="Seguridad de la cuenta"
      titulo="Seguridad."
      intro={<p>Tu contraseña, el segundo paso al entrar y los lugares donde tienes la sesión abierta.</p>}
    >
      {texto ? <Banner>{texto}</Banner> : null}
      <NavegacionCuenta actual="seguridad" csrf={sesion.csrf} />
      {perfil ? (
        <>
          <SeccionCuenta
            primera
            id="contrasena"
            titulo="Contraseña"
            descripcion={<p>Cámbiala si crees que otra persona la conoce. Al cambiarla cerramos tus demás sesiones y te avisamos por correo.</p>}
          >
            <FormularioClave csrf={sesion.csrf} dosPasos={perfil.dosPasos} />
          </SeccionCuenta>
          <SeccionCuenta
            id="dos-pasos"
            titulo="Verificación en dos pasos"
            descripcion={<p>Un código que cambia cada 30 segundos y que solo tu teléfono genera. Es opcional y es la mejor defensa si alguien descubre tu contraseña.</p>}
          >
            <PanelDosPasos
              csrf={sesion.csrf}
              activa={perfil.dosPasos}
              desde={perfil.dosPasosDesde ? formatearDia(perfil.dosPasosDesde) : null}
              codigosLibres={perfil.codigosLibres}
              pendiente={pendiente ? { ...pendiente, qr: qrParaEnlace(pendiente.uri) } : null}
            />
          </SeccionCuenta>
          <SeccionCuenta
            id="sesiones"
            titulo="Sesiones abiertas"
            descripcion={<p>Si ves una que no reconoces, ciérrala y cambia tu contraseña. Una sesión se cierra sola tras 7 días sin uso o 30 días desde que se inició.</p>}
          >
            <ListaSesiones
              csrf={sesion.csrf}
              sesiones={sesiones.map((s) => ({
                id: s.id,
                dispositivo: s.dispositivo ?? "Dispositivo desconocido",
                iniciada: formatearFechaHora(s.creada),
                ultimoUso: formatearFechaHora(s.ultimoUso),
                esActual: s.esActual,
              }))}
            />
          </SeccionCuenta>
          <SeccionCuenta
            id="actividad"
            titulo="Actividad reciente"
            descripcion={<p>Lo último que pasó en tu cuenta. Guardamos estos registros 90 días y no incluyen tu dirección IP.</p>}
          >
            {eventos.length > 0 ? (
              <ul className="divide-y divide-linea rounded-badge linea-fina">
                {eventos.map((e, i) => (
                  <li key={`${e.fecha}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 text-sm">
                    <span className="font-medium text-texto">{DESCRIPCION_EVENTO[e.tipo]}</span>
                    <time dateTime={e.fecha} className="text-apoyo">
                      {formatearFechaHora(e.fecha)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-apoyo">Todavía no hay actividad que mostrar.</p>
            )}
          </SeccionCuenta>
        </>
      ) : (
        <SinDatos />
      )}
    </ContentPage>
  );
}
