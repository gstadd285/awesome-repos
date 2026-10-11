import type { Metadata } from "next";
import { Apartado, ContentPage } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Información legal sobre Otea Austral. Texto provisional.",
};

export default function AvisoLegalPage() {
  return (
    <ContentPage
      ruta="/aviso-legal"
      rotulo="Aviso legal"
      titulo="Aviso legal."
      aviso="Texto provisional · pendiente de revisión legal"
    >
      <Apartado numero="01" titulo="Titular">
        <p>
          Otea Austral es un proyecto en desarrollo. La razón social, el domicilio y los datos de contacto se
          publicarán aquí antes del lanzamiento.
        </p>
      </Apartado>
      <Apartado numero="02" titulo="Carácter informativo">
        <p>
          <strong>Información y análisis. No constituye asesoría financiera</strong> ni una oferta o
          invitación a comprar o vender valores.
        </p>
      </Apartado>
      <Apartado numero="03" titulo="Organismos citados">
        <p>
          Los nombres de bancos centrales, reguladores y organismos internacionales se usan solo para citar
          fuentes. No implican relación, patrocinio ni respaldo.
        </p>
      </Apartado>
      <Apartado numero="04" titulo="Enlaces externos">
        <p>
          Los enlaces a sitios de terceros se abren en una pestaña nueva. Otea no controla su contenido ni
          su disponibilidad.
        </p>
      </Apartado>
    </ContentPage>
  );
}
