import type { Metadata } from "next";
import Link from "next/link";
import { FormularioEliminar } from "@/components/cuenta/FormulariosDeCuenta";
import { NavegacionCuenta } from "@/components/cuenta/NavegacionCuenta";
import { SeccionCuenta, SinDatos } from "@/components/cuenta/Paneles";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { exigirSesionCuenta } from "@/lib/cuentas/acceso";
import { servicioCuentas } from "@/lib/cuentas/instancia";
import { formatearDia } from "@/lib/format";

export const metadata: Metadata = { title: "Tus datos", robots: { index: false, follow: false } };

const GUARDAMOS: { dato: string; detalle: string }[] = [
  { dato: "Tu correo", detalle: "Cifrado. Sirve para entrar y para avisarte de cambios en tu cuenta." },
  { dato: "Tu contraseña", detalle: "Solo como un hash que no se puede revertir: ni nosotros podemos leerla." },
  { dato: "Tu nombre", detalle: "Solo si lo escribes. Se usa para saludarte." },
  { dato: "Tus preferencias", detalle: "Los temas que sigues y, si pediste el resumen diario por correo, desde cuándo." },
  {
    dato: "Tus resúmenes",
    detalle: "Si pediste el resumen diario: qué días se envió, qué período cubrió y cuántas alertas llevaba (90 días), sin su contenido; y el hash del enlace para dejarlo (60 días).",
  },
  { dato: "La verificación en dos pasos", detalle: "Si la activas: el secreto de tu app (cifrado) y el hash de tus códigos de recuperación." },
  { dato: "Tus sesiones", detalle: "Un identificador que no sirve para entrar, el navegador y el sistema aproximados (por ejemplo «Chrome en Windows») y las fechas de uso." },
  { dato: "Tu actividad de seguridad", detalle: "Qué pasó y cuándo (entrar, cambiar la contraseña…), durante 90 días. Sin dirección IP." },
  { dato: "Tu invitación", detalle: "Si creaste la cuenta con una invitación del acceso anticipado: cuál fue (su etiqueta interna) y cuándo la usaste." },
  { dato: "Qué aceptaste", detalle: "La versión de las condiciones de uso y de la política de privacidad, y la fecha en que las aceptaste." },
];

export default async function DatosPage() {
  const sesion = await exigirSesionCuenta();
  const perfil = await servicioCuentas().perfil(sesion.cuentaId);
  return (
    <ContentPage
      ruta="/cuenta/datos"
      rotulo="Tus datos"
      titulo="Tus datos."
      intro={<p>Qué guardamos de ti, cómo llevártelo y cómo borrarlo. Tú decides.</p>}
    >
      <NavegacionCuenta actual="datos" csrf={sesion.csrf} />
      <SeccionCuenta primera id="guardamos" titulo="Qué guardamos" descripcion={<p>Solo lo necesario para que tu cuenta funcione.</p>}>
        <ul className="divide-y divide-linea rounded-badge linea-fina">
          {GUARDAMOS.map((g) => (
            <li key={g.dato} className="p-4">
              <p className="text-sm font-semibold text-texto">{g.dato}</p>
              <p className="mt-1 text-sm leading-relaxed text-texto-suave">{g.detalle}</p>
            </li>
          ))}
        </ul>
        {perfil ? (
          <p className="mt-4 text-sm leading-relaxed text-apoyo">
            Aceptaste las <Link href="/terminos" className="enlace text-texto">condiciones de uso</Link> y la{" "}
            <Link href="/privacidad" className="enlace text-texto">política de privacidad</Link> (versión {perfil.versionTextos}) el{" "}
            {formatearDia(perfil.aceptado)}.
          </p>
        ) : null}
      </SeccionCuenta>
      <SeccionCuenta
        id="descargar"
        titulo="Descargar mis datos"
        descripcion={<p>Un archivo con todo lo anterior, para que lo guardes o lo lleves a otro lugar.</p>}
      >
        {/* Un enlace normal (no `Link`): es una descarga, no una página, y no debe precargarse. */}
        <a href="/cuenta/exportar" download className={buttonClasses("outline")}>
          Descargar mis datos (JSON)
        </a>
        <p className="mt-3 text-sm text-apoyo">No incluye tu contraseña, el secreto de la verificación en dos pasos ni tus códigos de recuperación.</p>
      </SeccionCuenta>
      <SeccionCuenta
        id="eliminar"
        titulo="Eliminar mi cuenta"
        descripcion={
          <p>
            Borramos tu correo, tu contraseña, tus preferencias, tus sesiones y tu actividad. No se puede deshacer, y te enviamos un correo para confirmarlo. Las
            copias de seguridad que mantiene el proveedor de la base de datos pueden conservar esos datos por un tiempo limitado.
          </p>
        }
      >
        {perfil ? <FormularioEliminar csrf={sesion.csrf} dosPasos={perfil.dosPasos} /> : <SinDatos />}
      </SeccionCuenta>
    </ContentPage>
  );
}
