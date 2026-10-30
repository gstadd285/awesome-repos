import type { Metadata } from "next";
import Link from "next/link";
import { FormularioPerfil } from "@/components/cuenta/FormulariosDeCuenta";
import { NavegacionCuenta } from "@/components/cuenta/NavegacionCuenta";
import { Banner, SinDatos, textoDeAviso } from "@/components/cuenta/Paneles";
import { ContentPage } from "@/components/layout/ContentPage";
import { exigirSesionCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";
import { formatearDia } from "@/lib/format";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

export default async function PerfilPage({ searchParams }: PageProps<"/cuenta">) {
  const sesion = await exigirSesionCuenta();
  const { aviso } = await searchParams;
  const perfil = await servicioCuentas().perfil(sesion.cuentaId);
  const texto = textoDeAviso(aviso);
  return (
    <ContentPage
      ruta="/cuenta"
      rotulo="Mi cuenta"
      titulo="Tu perfil."
      intro={<p>{sesion.nombre ? `Hola, ${sesion.nombre}. ` : ""}Elige qué temas sigues, cuida tu contraseña y revisa qué guardamos de ti.</p>}
    >
      {texto ? <Banner>{texto}</Banner> : null}
      <NavegacionCuenta actual="perfil" csrf={sesion.csrf} />
      {perfil ? (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FormularioPerfil
            csrf={sesion.csrf}
            nombre={perfil.nombre}
            temas={perfil.temas}
            resumen={perfil.resumenPrevio}
            resumenDesde={perfil.resumenDesde ? formatearDia(perfil.resumenDesde) : null}
          />
          <aside aria-labelledby="resumen-cuenta" className="self-start rounded-card bg-papel-alto p-6 linea-fina">
            <h2 id="resumen-cuenta" className="titular text-lg text-texto">
              Tu cuenta
            </h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-apoyo">Correo</dt>
                <dd className="break-all font-medium text-texto" data-testid="correo-cuenta">
                  {perfil.correo ?? "No disponible"}
                </dd>
              </div>
              <div>
                <dt className="text-apoyo">Cuenta creada</dt>
                <dd className="font-medium text-texto">{formatearDia(perfil.creada)}</dd>
              </div>
              <div>
                <dt className="text-apoyo">Contraseña cambiada</dt>
                <dd className="font-medium text-texto">{formatearDia(perfil.claveCambiada)}</dd>
              </div>
              <div>
                <dt className="text-apoyo">Verificación en dos pasos</dt>
                <dd className="font-medium text-texto">
                  {perfil.dosPasos ? "Activada" : "Apagada"} ·{" "}
                  <Link href="/cuenta/seguridad" className="enlace">
                    Administrar
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-apoyo">
              Tu correo es el identificador de tu cuenta y, por ahora, no se puede cambiar. Si necesitas usar otro, crea una cuenta nueva y elimina esta desde{" "}
              <Link href="/cuenta/datos" className="enlace text-texto">
                Tus datos
              </Link>
              .
            </p>
          </aside>
        </div>
      ) : (
        <SinDatos />
      )}
    </ContentPage>
  );
}
