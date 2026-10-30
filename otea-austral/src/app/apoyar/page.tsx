import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/layout/ContentPage";
import { Desglose } from "@/components/piezas/Desglose";
import { buttonClasses } from "@/components/ui/button";
import { safeHref } from "@/lib/domain/url";
import { donacionesActivas, enlaceDonaciones, TOPE_MENSUAL_BORRADORES_MAXIMO_USD } from "@/lib/env";

/** Con el apartado apagado ni el título se publica: un `metadata` fijo saldría también en la página 404. */
export function generateMetadata(): Metadata {
  if (!donacionesActivas()) notFound();
  return {
    title: "Apoyar el proyecto",
    description:
      "Aportes voluntarios por Mercado Pago para sostener Otea Austral: en qué se usan y qué no dan. Información y análisis; no constituye asesoría financiera.",
  };
}

/**
 * Lo que cuesta sostener el sitio, con cifras reales del proyecto y rotuladas como estimadas: el dominio (~US$ 12 al año,
 * `docs/alertas-reales.md`), los planes gratuitos previstos y el tope de la IA de los borradores, que fija el código.
 */
const COSTOS = [
  { concepto: "Dominio", cifra: "~US$ 12 al año" },
  { concepto: "Servidores y base", cifra: "plan gratuito" },
  { concepto: "Correo", cifra: "plan gratuito" },
  { concepto: "Tope de la IA", cifra: `US$ ${TOPE_MENSUAL_BORRADORES_MAXIMO_USD} al mes` },
] as const;

const SECCIONES = {
  uso: "apoyar-uso",
  noDa: "apoyar-no-da",
  impuestos: "apoyar-impuestos",
  datos: "apoyar-datos",
  aportar: "apoyar-aportar",
} as const;

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="apartado max-w-[720px]">
      <h2 id={id} className="titular text-titulo text-texto">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/**
 * Aportes voluntarios (`docs/despliegue.md` §15). Sin `DONACIONES_URL` válida la página no existe (404). El sitio solo
 * enlaza: el pago ocurre en Mercado Pago, en una pestaña nueva, y nada de Mercado Pago se carga aquí (la CSP no cambia).
 */
export default function ApoyarPage() {
  const enlace = enlaceDonaciones();
  const href = enlace ? safeHref(enlace) : undefined;
  if (!href) notFound();

  return (
    <ContentPage
      ruta="/apoyar"
      rotulo="Apoyar el proyecto"
      titulo="Apoyar el proyecto."
      intro={
        <p>
          Otea Austral se sostiene con un presupuesto chico. Si quieres, puedes hacer un aporte voluntario por Mercado Pago
          para cubrir lo que cuesta mantener el sitio en línea.
        </p>
      }
      aviso="Aporte voluntario · el pago ocurre en Mercado Pago"
      pieza={<Desglose filas={[...COSTOS]} />}
    >
      <Seccion id={SECCIONES.uso} titulo="En qué se usa">
        <div className="prosa max-w-[720px]">
          <p>Lo que se reúne cubre lo que cuesta mantener Otea Austral en línea. Son cifras estimadas, en dólares:</p>
          <ul>
            <li>
              <strong>Dominio</strong> (oteaustral.com, todavía sin comprar): ~US$ 12 al año.
            </li>
            <li>
              <strong>Servidores y base de datos</strong> (Google Cloud Run y Neon): previstos en sus planes gratuitos. Si el uso
              los supera, el exceso se paga.
            </li>
            <li>
              <strong>Correo</strong> (Resend, para confirmar inscripciones y los avisos de las cuentas): previsto en su plan
              gratuito, con la misma condición.
            </li>
            <li>
              <strong>Inteligencia artificial</strong> (la que ayuda a redactar borradores de alertas, que una persona revisa
              antes de publicar): un tope duro de US$ {TOPE_MENSUAL_BORRADORES_MAXIMO_USD} al mes, fijado en el código.
            </li>
          </ul>
          <p>
            El proyecto se planificó con un presupuesto total de unos US$ 40. Los precios y las cuotas gratuitas de cada
            proveedor pueden cambiar.
          </p>
        </div>
      </Seccion>
      <Seccion id={SECCIONES.noDa} titulo="Lo que el aporte no da">
        <div className="prosa max-w-[720px]">
          <p>
            El aporte es voluntario. No da acceso a recomendaciones, prioridad ni trato preferente, y no cambia qué se publica
            ni cómo: las alertas, la <Link href="/metodologia">metodología</Link> y las correcciones son las mismas para todas
            las personas.
          </p>
          <p>
            <strong>Otea entrega información y análisis. No constituye asesoría financiera</strong>, tampoco para quien aporta.
          </p>
        </div>
      </Seccion>
      <Seccion id={SECCIONES.impuestos} titulo="Impuestos y reembolsos">
        <div className="prosa max-w-[720px]">
          <p>
            El aporte no es deducible de impuestos. Si necesitas un reembolso, se rige por las condiciones de Mercado Pago.
          </p>
        </div>
      </Seccion>
      <Seccion id={SECCIONES.datos} titulo="Tus datos de pago">
        <div className="prosa max-w-[720px]">
          <p>
            El pago ocurre en Mercado Pago: el botón solo abre su página en una pestaña nueva. Este sitio no carga nada de
            Mercado Pago ni procesa pagos, y <strong>Otea Austral no recibe ni guarda tus datos de pago</strong> (tarjeta,
            cuenta o claves). Mercado Pago los trata según sus propias condiciones y su política de privacidad.
          </p>
          <p>
            Quien recibe el aporte ve en su cuenta de Mercado Pago lo que Mercado Pago informa de cada pago; el sitio no lo
            guarda. Más detalles en la <Link href="/privacidad">política de privacidad</Link>.
          </p>
        </div>
      </Seccion>
      <Seccion id={SECCIONES.aportar} titulo="Hacer un aporte">
        <div className="prosa max-w-[720px]">
          <p>Lo que sigue ocurre en Mercado Pago.</p>
        </div>
        <div className="mt-8">
          <a href={href} target="_blank" rel="noopener noreferrer" data-magnetico className={buttonClasses("primary")}>
            <span className="boton-etiqueta">Aportar en Mercado Pago</span>{" "}
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        </div>
      </Seccion>
    </ContentPage>
  );
}
