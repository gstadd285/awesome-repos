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
      ruta="/privacidad"
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
            <strong>Lista de espera (cuando abra):</strong> tu correo, la fecha y la versión de los textos que
            aceptaste (el consentimiento para guardar tu correo y las{" "}
            <Link href="/terminos">condiciones de uso</Link>). Otea no guarda tu IP ni datos de tu navegador en su
            base de datos. El correo se guarda cifrado: el sitio no tiene permiso para leerlo de vuelta de la base
            de datos y solo el equipo de Otea, con una clave aparte, lo descifra para avisarte del lanzamiento.
          </li>
          <li>
            <strong>Asistente de preguntas:</strong> lo que escribes se usa solo para responderte y no se guarda en
            la base de datos de Otea ni en sus registros. Hoy el asistente responde con las preguntas frecuentes del
            sitio, sin inteligencia artificial. Si se activa la IA, el texto de tu pregunta (sin tu IP) se envía a
            Anthropic, el proveedor del modelo, para redactar la respuesta; por eso no escribas datos personales.
            Las preguntas que traen un correo, un teléfono o un RUT no se procesan ni se envían a ningún proveedor.
          </li>
          <li>
            <strong>Límites de uso:</strong> para frenar abusos, el sitio cuenta las solicitudes al formulario y al
            asistente con una huella irreversible de tu IP que vive solo en la memoria del servidor y se descarta al
            reiniciarlo. No se guarda.
          </li>
          <li>
            <strong>Registros del servidor:</strong> el proveedor de alojamiento registra cada solicitud al
            sitio, incluidas tu dirección IP y tu navegador, por un máximo de 30 días y solo para seguridad y
            diagnóstico. Otea no los usa para identificarte ni los une a tu correo.
          </li>
          <li>
            <strong>Reportes técnicos de seguridad:</strong> si el navegador bloquea un script no
            autorizado, nos avisa sin IP ni identificadores (ver <Link href="/seguridad">Seguridad</Link>).
          </li>
        </ul>
      </Apartado>
      <Apartado numero="03" titulo="Para qué">
        <p>
          Para verificar tu inscripción en dos pasos (dejas tu correo y haces clic en el enlace que te enviamos),
          avisarte del lanzamiento y responder tus preguntas en el asistente. No vendemos ni cedemos tus datos, y
          no los usamos para publicidad.
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
          condiciones. Si se activa la IA del asistente, Anthropic (el proveedor del modelo) recibirá el texto de
          cada pregunta y los textos del sitio con que se redacta la respuesta; antes de activarla confirmaremos
          aquí su región y sus condiciones, incluido cuánto tiempo conserva lo que recibe.
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
