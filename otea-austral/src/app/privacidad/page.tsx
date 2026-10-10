import type { Metadata } from "next";
import Link from "next/link";
import { Apartado, ContentPage } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Qué datos trata Otea Austral, para qué y cómo ejercer tus derechos. Texto provisional.",
};

export default function PrivacidadPage() {
  return (
    <ContentPage
      numero="L1"
      rotulo="Privacidad"
      titulo="Tus datos, los mínimos."
      intro={<p>Qué datos tratamos, para qué y cómo puedes pedir que los cambiemos o los borremos.</p>}
      aviso="Texto provisional · pendiente de revisión legal"
    >
      <Apartado numero="01" titulo="Quién es responsable">
        <p>
          Otea Austral es un proyecto en desarrollo. Antes de abrir la lista de espera publicaremos aquí la
          identidad del responsable y una dirección de contacto para temas de privacidad.
        </p>
      </Apartado>
      <Apartado numero="02" titulo="Qué datos tratamos">
        <ul>
          <li>
            <strong>Visitas:</strong> el sitio no usa cookies de seguimiento ni analítica. Solo el equipo de
            Otea recibe una cookie técnica de sesión al entrar a su panel interno.
          </li>
          <li>
            <strong>Lista de espera (cuando abra):</strong> tu correo, la fecha y la versión del
            consentimiento que aceptaste. Nada más: ni tu IP ni datos de tu navegador.
          </li>
          <li>
            <strong>Reportes técnicos de seguridad:</strong> si el navegador bloquea un script no
            autorizado, nos avisa sin IP ni identificadores (ver <Link href="/seguridad">Seguridad</Link>).
          </li>
        </ul>
      </Apartado>
      <Apartado numero="03" titulo="Para qué">
        <p>
          Para confirmar tu inscripción (te pediremos hacer clic en un enlace) y avisarte del lanzamiento. No
          vendemos ni cedemos tus datos, y no los usamos para publicidad.
        </p>
      </Apartado>
      <Apartado numero="04" titulo="Con qué base y por cuánto tiempo">
        <p>
          Con tu consentimiento, que puedes retirar cuando quieras. Guardamos el correo hasta que te des de
          baja. El enlace de confirmación vence a las 72 horas y las inscripciones que no se confirman se
          borran solas a los 30 días.
        </p>
      </Apartado>
      <Apartado numero="05" titulo="Quién más los ve">
        <p>
          Los proveedores previstos, que solo reciben lo necesario para prestar su servicio: Google Cloud Run
          (alojamiento del sitio), Neon (base de datos) y Resend (envío del correo de confirmación), con
          servidores en Estados Unidos. Antes de abrir la lista de espera confirmaremos aquí sus regiones y
          condiciones.
        </p>
      </Apartado>
      <Apartado numero="06" titulo="Tus derechos">
        <p>
          Puedes pedir acceder a tus datos, corregirlos, eliminarlos u oponerte a su uso. El canal para
          hacerlo se publicará junto con los datos del responsable.
        </p>
      </Apartado>
      <Apartado numero="07" titulo="Cambios">
        <p>Si esta política cambia, publicaremos la nueva versión con su fecha en esta página.</p>
      </Apartado>
    </ContentPage>
  );
}
