import type { Metadata } from "next";
import Link from "next/link";
import { Apartado, ContentPage } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "Términos",
  description: "Condiciones de uso de Otea Austral. Texto provisional.",
};

export default function TerminosPage() {
  return (
    <ContentPage
      numero="L2"
      rotulo="Términos"
      titulo="Condiciones de uso."
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
      <Apartado numero="06" titulo="Uso aceptable">
        <p>
          No uses el servicio para fines ilícitos ni intentes vulnerar su seguridad. Si encuentras una
          vulnerabilidad, repórtala de forma privada (ver <Link href="/seguridad#reportar">Seguridad</Link>).
        </p>
      </Apartado>
      <Apartado numero="07" titulo="Cambios">
        <p>Publicaremos cualquier cambio de estas condiciones con su fecha en esta página.</p>
      </Apartado>
    </ContentPage>
  );
}
