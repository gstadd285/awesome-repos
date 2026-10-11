import type { Metadata } from "next";
import Link from "next/link";
import { Apartado, ContentPage } from "@/components/layout/ContentPage";
import { VERSION_CONSENTIMIENTO } from "@/lib/waitlist/schema";

export const metadata: Metadata = {
  title: "Condiciones de uso",
  description:
    "Condiciones de uso de Otea Austral: qué es el servicio, el asistente de preguntas y la lista de espera. Texto provisional.",
};

export default function TerminosPage() {
  return (
    <ContentPage
      ruta="/terminos"
      rotulo="Condiciones de uso"
      titulo="Condiciones de uso."
      intro={<p>Las reglas para usar el sitio, el asistente de preguntas y la lista de espera, en lenguaje simple.</p>}
      aviso="Texto provisional · pendiente de revisión legal"
    >
      <Apartado numero="01" titulo="Qué es Otea Austral">
        <p>
          Un servicio informativo que avisa de eventos globales y analiza qué sectores y activos podrían
          verse afectados, con su nivel de confianza y sus fuentes.
        </p>
      </Apartado>
      <Apartado numero="02" titulo="No es asesoría financiera">
        <p>
          <strong>Información y análisis. No constituye asesoría financiera.</strong> No recomendamos comprar
          ni vender ningún activo ni prometemos rentabilidad. Tus decisiones de inversión son tuyas; si
          necesitas asesoría, consulta a un profesional autorizado.
        </p>
      </Apartado>
      <Apartado numero="03" titulo="Exactitud y correcciones">
        <p>
          Verificamos según nuestra <Link href="/metodologia">metodología</Link>, pero podemos equivocarnos.
          Cuando ocurre, lo corregimos o retractamos a la vista, sin borrar la alerta original.
        </p>
      </Apartado>
      <Apartado numero="04" titulo="Datos de ejemplo">
        <p>
          El contenido marcado como «Datos de ejemplo» es ficticio y sirve para mostrar el servicio. No
          describe eventos ni fuentes reales.
        </p>
      </Apartado>
      <Apartado numero="05" titulo="Contenido de terceros">
        <p>
          Los documentos enlazados pertenecen a sus autores. Otea escribe sus propios resúmenes y no copia el
          texto de las fuentes.
        </p>
      </Apartado>
      <Apartado numero="06" titulo="Asistente de preguntas">
        <ul>
          <li>
            Responde preguntas sobre Otea Austral con las preguntas frecuentes del sitio, escritas por el
            equipo. Hoy lo hace sin inteligencia artificial.
          </li>
          <li>
            Si se activa la IA, la respuesta la redacta un modelo de un proveedor externo a partir de esos
            mismos textos, se marca como «Respuesta con IA» y cada frase se revisa antes de mostrarse. Aun así,
            puede tener errores: contrasta lo importante en la metodología y en las fuentes.
          </li>
          <li>
            No da consejos de inversión ni pronósticos de precios, y no sustituye a la metodología ni a las
            fuentes.
          </li>
          <li>
            No escribas datos personales: no los necesita. Qué pasa con tus preguntas está en la{" "}
            <Link href="/privacidad">política de privacidad</Link>.
          </li>
          <li>
            Podemos limitar o suspender el asistente en cualquier momento, por ejemplo para cuidar su costo o la
            seguridad del sitio.
          </li>
        </ul>
      </Apartado>
      <Apartado numero="07" titulo="Lista de espera y verificación en dos pasos">
        <p>
          Para inscribirte debes aceptar estas condiciones y el consentimiento para guardar tu correo (según la{" "}
          <Link href="/privacidad">política de privacidad</Link>). La inscripción se verifica en dos pasos: dejas tu
          correo y lo confirmas con el enlace que te enviamos, que vence a las 72 horas. Sin esa confirmación no
          quedas inscrito. Inscribe solo tu propio correo.
        </p>
      </Apartado>
      <Apartado numero="08" titulo="Uso aceptable">
        <p>
          No uses el servicio para fines ilícitos ni intentes vulnerar su seguridad o sobrecargarlo, por ejemplo
          con envíos automáticos masivos al formulario o al asistente. No intentes que el asistente ignore sus
          reglas ni que revele sus instrucciones. Si encuentras una vulnerabilidad, repórtala de forma privada
          (ver <Link href="/seguridad#reportar">Seguridad</Link>).
        </p>
      </Apartado>
      <Apartado numero="09" titulo="Marca y textos">
        <p>
          El nombre, el logo, el diseño y los textos de Otea Austral pertenecen a su titular, que se publicará
          en el <Link href="/aviso-legal">Aviso legal</Link>. No los uses de una forma que sugiera que Otea
          respalda tu producto o tu opinión.
        </p>
      </Apartado>
      <Apartado numero="10" titulo="Disponibilidad y responsabilidad">
        <p>
          El sitio está en desarrollo y se ofrece tal como está: puede cambiar, fallar o suspenderse. Otea no
          garantiza que la información sea exacta, completa ni esté al día, y no responde por las decisiones que
          alguien tome con ella, dentro de lo que permita la ley.
        </p>
      </Apartado>
      <Apartado numero="11" titulo="Ley aplicable y contacto">
        <p>
          La ley aplicable, la jurisdicción y el canal de contacto se publicarán aquí, junto con los datos del
          titular, antes del lanzamiento.
        </p>
      </Apartado>
      <Apartado numero="12" titulo="Cambios">
        <p>
          Publicaremos cualquier cambio de estas condiciones con su fecha en esta página. La versión de los
          textos que aceptas al inscribirte queda registrada junto con tu consentimiento. Versión de este texto:{" "}
          <span className="contador text-texto">{VERSION_CONSENTIMIENTO}</span>.
        </p>
      </Apartado>
    </ContentPage>
  );
}
