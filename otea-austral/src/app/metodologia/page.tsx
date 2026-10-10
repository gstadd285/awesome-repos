import type { Metadata } from "next";
import Link from "next/link";
import { ConfidenceBadge } from "@/components/alert-card/ConfidenceBadge";
import { VERIFICACION_ETIQUETA } from "@/components/alert-card/labels";
import { Apartado, ContentPage } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "Metodología",
  description:
    "Cómo calcula Otea Austral la confianza de cada alerta, qué exige para publicarla y cómo corrige sus errores.",
};

export default function MetodologiaPage() {
  return (
    <ContentPage
      numero="02"
      rotulo="Metodología"
      titulo="Cómo verificamos cada alerta."
      intro={
        <p>
          La confianza de una alerta no la escribe nadie a mano: se calcula a partir de sus fuentes. Estas
          son las reglas, en palabras simples.
        </p>
      }
      aviso="Texto provisional · pendiente de revisión legal"
    >
      <Apartado numero="01" titulo="Niveles de confianza">
        <ul className="!list-none !pl-0">
          <li className="flex flex-wrap items-center gap-3">
            <ConfidenceBadge nivel="alta" />
            Hay al menos una fuente primaria: un comunicado oficial, un dato publicado por el organismo
            emisor o un documento regulatorio.
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <ConfidenceBadge nivel="media" />
            Hay una fuente secundaria, o notas de prensa de dos medios distintos.
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <ConfidenceBadge nivel="baja" />
            Solo hay una nota de prensa, o aún no hay fuentes.
          </li>
        </ul>
        <p>
          La prensa sirve para detectar, no para confirmar: una alerta con solo notas de prensa nunca supera
          la confianza media. Cada fila de una alerta puede tener menos confianza que la alerta, pero nunca
          más.
        </p>
      </Apartado>

      <Apartado numero="02" titulo="Nivel de verificación">
        <ul>
          <li>
            <strong>{VERIFICACION_ETIQUETA.fuente_oficial}:</strong> al menos una fuente primaria.
          </li>
          <li>
            <strong>{VERIFICACION_ETIQUETA.dos_fuentes}:</strong> dos organismos distintos (dos documentos
            del mismo organismo cuentan como uno).
          </li>
          <li>
            <strong>{VERIFICACION_ETIQUETA.una_fuente}:</strong> una sola fuente u organismo.
          </li>
          <li>
            <strong>{VERIFICACION_ETIQUETA.sin_verificar}:</strong> sin fuentes enlazadas.
          </li>
        </ul>
      </Apartado>

      <Apartado numero="03" titulo="Antes de publicar">
        <ul>
          <li>Toda alerta necesita al menos una fuente enlazada, con título, fecha y organismo.</li>
          <li>
            Una alerta de <strong>impacto alto</strong> exige dos fuentes de organismos distintos y una
            aprobación humana registrada después de su última edición.
          </li>
          <li>El resumen lo escribe Otea con sus propias palabras: enlazamos, no copiamos.</li>
        </ul>
      </Apartado>

      <Apartado numero="04" titulo="Correcciones y retractaciones">
        <p>
          Una alerta publicada no se edita en silencio. Si cambia su contenido, queda marcada como{" "}
          <strong>corregida</strong>, con la fecha y el texto de la corrección a la vista.
        </p>
        <p>
          Si resulta equivocada, se <strong>retracta</strong>: sigue visible, tachada y con el aviso de
          retractación arriba. No borramos alertas. Cada cambio queda en un registro que solo admite agregar
          filas.
        </p>
      </Apartado>

      <Apartado numero="05" titulo="Lo que no hacemos">
        <ul>
          <li>No recomendamos comprar ni vender, ni prometemos rentabilidad.</li>
          <li>No presentamos datos de ejemplo como reales: siempre van marcados.</li>
          <li>
            No publicamos cifras de usuarios, rendimiento o aciertos que no podamos respaldar. Si mostramos
            metas, las llamamos objetivos.
          </li>
        </ul>
        <p>
          ¿Ves un error? Revisa las <Link href="/fuentes">fuentes</Link> o escríbenos por el canal de{" "}
          <Link href="/seguridad#reportar">seguridad</Link> si es un problema técnico.
        </p>
      </Apartado>
    </ContentPage>
  );
}
