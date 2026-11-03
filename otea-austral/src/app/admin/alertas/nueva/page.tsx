import type { Metadata } from "next";
import Link from "next/link";
import { crearAlertaAccion } from "@/app/admin/alertas/acciones";
import { CamposAlerta } from "@/components/admin/CamposAlerta";
import { AYUDA, CAMPO, ENLACE, ETIQUETA, TARJETA } from "@/components/admin/estilos";
import { FormularioPanel } from "@/components/admin/FormularioPanel";
import { Ocultos } from "@/components/admin/Ocultos";
import { exigirSesion } from "@/lib/admin/acceso";

export const metadata: Metadata = { title: "Nueva alerta" };

export default async function NuevaAlertaPage() {
  const sesion = await exigirSesion();
  return (
    <>
      <p className="micro text-apoyo">
        <Link href="/admin/alertas" className={ENLACE}>
          Alertas
        </Link>{" "}
        / Nueva
      </p>
      <h1 className="titular mt-3 text-titulo text-texto">Nueva alerta</h1>
      <p className="mt-4 max-w-[680px] leading-relaxed text-texto-suave">
        Se guarda como borrador. Después podrás enlazar fuentes, ver la confianza calculada, enviarla a revisión y
        publicarla.
      </p>

      <FormularioPanel accion={crearAlertaAccion} boton="Guardar borrador" titulo="Nueva alerta" className={`${TARJETA} mt-10`}>
        <Ocultos csrf={sesion.csrf} />
        <CamposAlerta prefijo="nueva" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="nueva-revisor" className={ETIQUETA}>
              Revisado por
            </label>
            <input
              id="nueva-revisor"
              name="revisor"
              maxLength={80}
              required
              defaultValue="Equipo editorial de Otea Austral"
              className={CAMPO}
            />
            <p className={AYUDA}>Nombre público del equipo o un alias. Nunca un correo.</p>
          </div>
          <div className="flex items-start gap-3 pt-7">
            <input id="nueva-ejemplo" name="es_ejemplo" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" />
            <label htmlFor="nueva-ejemplo" className="text-sm leading-relaxed text-texto-suave">
              Datos de ejemplo: se mostrará marcada así. Úsalo para pruebas; no se puede cambiar después.
            </label>
          </div>
        </div>
      </FormularioPanel>
    </>
  );
}
