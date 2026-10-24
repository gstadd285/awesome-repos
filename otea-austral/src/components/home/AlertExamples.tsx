import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCard } from "@/components/alert-card/AlertCard";
import { CONFIANZA_ETIQUETA } from "@/components/alert-card/labels";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { vistaSinPrimaria, vistasPortada } from "@/data/ejemplo";
import { contarOrganismosDistintos } from "@/lib/domain/rules";
import type { Confianza } from "@/lib/domain/schemas";
import type { AlertView } from "@/lib/domain/view";
import { formatearDia } from "@/lib/format";

/** Los tres escenarios de la vitrina (por id, en el orden del selector). La prueba en vivo es la de Ormuz. */
const ESCENARIOS = [
  { clave: "ormuz", nombre: "Ormuz" },
  { clave: "chips", nombre: "Chips" },
  { clave: "cobre", nombre: "Cobre" },
] as const;

const NIVEL: Record<Confianza, number> = { baja: 1, media: 2, alta: 3 };

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const NUMERO = ["ninguna", "una", "dos", "tres", "cuatro"];
/** «una fuente», «dos fuentes» (con número en palabras hasta cuatro). */
const cuenta = (n: number, uno: string, varios: string) => `${NUMERO[n] ?? n} ${n === 1 ? uno : varios}`;

/** Por qué la confianza calculada es la que es: las reglas 1 y 2, contadas con las fuentes de esta alerta. */
function porQueConfianza(v: AlertView): string {
  const tipos = new Set(v.fuentes.map((f) => f.tipo));
  if (tipos.has("primaria")) return "hay una fuente primaria. Nadie la escribe a mano: sale de las fuentes.";
  if (tipos.has("secundaria")) return "su fuente es secundaria, y sin una primaria no llega a alta.";
  if (v.fuentes.length === 0) return "aún no tiene fuentes.";
  return contarOrganismosDistintos(v.fuentes) >= 2
    ? "solo hay prensa, de dos organismos: sirve para detectar, no para confirmar."
    : "solo hay una nota de prensa, que sirve para detectar, no para confirmar.";
}

/** La fila que se declaró por encima de lo que respaldan las fuentes (se muestra acotada). */
function filaAcotada(v: AlertView) {
  return v.filas.find((f) => NIVEL[f.confianza] > NIVEL[f.confianza_mostrada]);
}

function textoFuentes(v: AlertView): string {
  const organismos = contarOrganismosDistintos(v.fuentes);
  const base = `${mayuscula(cuenta(v.fuentes.length, "fuente", "fuentes"))} de ${
    organismos === 1 ? "un solo organismo" : cuenta(organismos, "organismo", "organismos distintos")
  }.`;
  const regla =
    v.impacto === "alto"
      ? organismos >= 2
        ? " Es lo que exige el impacto alto."
        : " Ya no alcanza para impacto alto."
      : " Para impacto alto harían falta dos organismos.";
  return `${base}${regla}`;
}

/** El valor real y el de la prueba (el CSS muestra uno u otro). */
function Alterna({ a, b }: { a: ReactNode; b?: ReactNode }) {
  if (b === undefined) return <>{a}</>;
  return (
    <>
      <span className="solo-a">{a}</span>
      <span className="solo-b">{b}</span>
    </>
  );
}

/**
 * Tres tramos (baja · media · alta), como el medidor de la historia, en un solo elemento: el CSS recorta los tramos con
 * una máscara y llena tantos como el nivel. En la prueba se retrae al nivel sin la primaria.
 */
function Medidor({ nivel, nivelPrueba }: { nivel: Confianza; nivelPrueba?: Confianza }) {
  return <span className="nota-medidor" data-nivel={nivel} data-nivel-b={nivelPrueba} aria-hidden="true" />;
}

/**
 * Las cuatro anotaciones de un escenario, en texto real: condición, confianza calculada, fuentes y correcciones. Todo
 * sale de los datos y de las reglas (`contarOrganismosDistintos`, la confianza ya calculada en la vista). En Ormuz, la
 * versión de la prueba («quita la fuente primaria») va en paralelo.
 */
function Notas({ v, prueba }: { v: AlertView; prueba?: AlertView }) {
  const acotada = filaAcotada(v);
  const correccion = v.correcciones.findLast((c) => c.tipo === "correccion");
  const notas: { titulo: string; texto: ReactNode; medidor?: ReactNode; enlace?: ReactNode }[] = [
    {
      titulo: "Condición",
      texto: `Cada efecto dice bajo qué condición ocurriría: «${minuscula(v.filas[0].condicion)}». Nunca dice «compra» ni «vende».`,
    },
    {
      titulo: "Confianza calculada",
      medidor: <Medidor nivel={v.confianza} nivelPrueba={prueba?.confianza} />,
      // El simulador de /metodologia calcula con las mismas reglas: aquí se ve un caso, allí se prueban todos.
      enlace: (
        <Link href="/metodologia#simulador" className="mt-1.5 inline-block text-sm text-texto underline underline-offset-4">
          Pruébalo en el simulador
        </Link>
      ),
      texto: (
        <Alterna
          a={`${mayuscula(CONFIANZA_ETIQUETA[v.confianza])}: ${porQueConfianza(v)}${
            acotada ? ` La fila «${acotada.sector}» se declaró ${acotada.confianza} y se muestra ${acotada.confianza_mostrada}.` : ""
          }`}
          b={
            prueba
              ? `${mayuscula(CONFIANZA_ETIQUETA[v.confianza])} → ${CONFIANZA_ETIQUETA[prueba.confianza]}: sin la primaria, ${porQueConfianza(prueba)}`
              : undefined
          }
        />
      ),
    },
    {
      titulo: "Fuentes",
      texto: (
        <Alterna
          a={`${textoFuentes(v)} Abre «Fuentes» para ver organismo, fecha y enlace.`}
          b={prueba ? textoFuentes(prueba) : undefined}
        />
      ),
    },
    {
      titulo: "Correcciones",
      texto: correccion
        ? `Corregida el ${formatearDia(correccion.fecha)}: la corrección queda a la vista y la alerta original no se borra.`
        : "Si algo cambia, la alerta pasa a «corregida» y el cambio queda a la vista, sin borrar el original.",
    },
  ];
  return (
    // Enfocable: en el teléfono es un riel desplazable (WCAG 2.1.1; en WebKit no se alcanzaría con el teclado). El riel
    // recibe el foco antes que el enlace al simulador que lleva dentro.
    <ol className="vitrina-notas escena grid gap-4" aria-label="Cómo leer esta alerta" tabIndex={0}>
      {notas.map((n, i) => (
        <li key={n.titulo} className={`nota nota-${i + 1} relative pt-3.5`}>
          {/* El número (01–04) lo pone un contador del CSS. */}
          <p className="nota-titulo">
            {n.titulo}
            {n.medidor}
          </p>
          <p className="nota-texto mt-1.5 max-w-[52ch] text-sm leading-relaxed text-texto-suave">{n.texto}</p>
          {n.enlace}
        </li>
      ))}
    </ol>
  );
}

/**
 * «Así se ve una alerta»: la vitrina anotada. Una hoja de papel con filo de latón (en la historia fija sube sobre el
 * escenario) con un selector de escenarios (Ormuz · Chips · Cobre, radios nativos) y la `AlertCard` real al centro,
 * con cuatro anotaciones de texto. En Ormuz, la prueba «quita la fuente primaria»: el servidor calcula la vista sin la
 * primaria con las reglas reales y el CSS (`.demo:has(…)`) cambia de una a otra, sin JavaScript. Sin `:has` se ve
 * Ormuz completo y sin controles.
 */
export function AlertExamples() {
  const prueba = vistaSinPrimaria("ejemplo-ormuz");
  return (
    <section id="ejemplos" aria-labelledby="ejemplos-titulo" className="hoja scroll-mt-24">
      {/* Vigía del capítulo: lejos de la pantalla, sus piezas ligadas al scroll sueltan la animación (ver `.vigia-producto`). */}
      <span className="vigia-producto" data-vigia aria-hidden="true" />
      <div className="mx-auto max-w-[1440px] px-6 py-16 sm:py-20 lg:py-[120px]">
        <SectionEyebrow>Alertas</SectionEyebrow>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <TextoEnMovimiento
            como="h2"
            id="ejemplos-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Así se ve una alerta."
            className="titular text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Quién gana, quién pierde y bajo qué condición, con la confianza calculada desde sus fuentes y las correcciones a la vista."
            className="max-w-[520px] text-lede text-texto-suave lg:justify-self-end"
          />
        </div>

        <fieldset className="demo vitrina mt-8 md:mt-12">
          <legend className="sr-only">Vitrina de alertas de ejemplo</legend>
          <div className="vitrina-mando">
            <fieldset className="vitrina-selector">
              <legend className="sr-only">Escenario</legend>
              {ESCENARIOS.map((e, i) => (
                <label key={e.clave} className="vitrina-segmento relative z-1 flex min-h-11 items-center justify-center gap-2.5 rounded-pill text-sm font-medium text-texto-suave">
                  <input
                    type="radio"
                    name="escenario"
                    id={`escenario-${e.clave}`}
                    value={e.clave}
                    defaultChecked={i === 0}
                    className="vitrina-radio"
                  />
                  <span className="vitrina-segmento-nombre">{e.nombre}</span>
                  <Medidor nivel={vistasPortada[i].confianza} />
                </label>
              ))}
              <span className="vitrina-pulgar" aria-hidden="true" />
            </fieldset>
            <label className="vitrina-prueba">
              <input type="checkbox" role="switch" id="prueba-ormuz" className="vitrina-prueba-campo" />
              <span className="vitrina-interruptor" aria-hidden="true" />
              Prueba: quita la fuente primaria
            </label>
          </div>
          {/* Resumen del cambio para lectores de pantalla (el CSS muestra la frase que corresponde). */}
          <p className="sr-only" aria-live="polite">
            <span className="solo-a">Con sus dos fuentes, la confianza calculada de Ormuz es alta.</span>
            <span className="solo-b">
              Sin la fuente primaria, la confianza calculada baja de alta a baja y la alerta no podría publicarse como
              impacto alto.
            </span>
          </p>

          {vistasPortada.map((v, i) => (
            <div key={v.id} className={`vitrina-panel vitrina-panel-${ESCENARIOS[i].clave}`}>
              <div className="vitrina-escena mt-6 grid gap-7">
                <AlertCard
                  alerta={v}
                  nivelTitulo={3}
                  className="vitrina-tarjeta"
                  alternativa={i === 0 ? prueba : undefined}
                />
                <Notas v={v} prueba={i === 0 ? prueba : undefined} />
              </div>
            </div>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
