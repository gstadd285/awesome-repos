import Link from "next/link";
import { AvisoMovimiento } from "@/components/motion/ControlesMovimiento";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { buttonClasses } from "@/components/ui/button";
import { Flecha } from "@/components/ui/Flecha";
import { AlertaViva } from "./AlertaViva";
import { Blueprint } from "./Blueprint";
import { Board } from "./Board";
import { Horizonte } from "./Horizonte";
import { Ribbon } from "./Ribbon";

/**
 * Portada: héroe y tres pasos (01 — 03). En escritorio (≥ 1024 px), con soporte de
 * animaciones ligadas al scroll y con el movimiento activado, el escenario queda
 * fijo y las piezas se transforman al bajar: la cinta de eventos se pliega
 * sobre un plano técnico, del plano surge un tablero y las alertas caen
 * sobre él; el texto de cada paso se escribe al ritmo de su tramo. En el resto
 * de pantallas las piezas se apilan en orden de lectura y se arman al entrar
 * (`escena`: ligadas al scroll o, sin soporte, disparadas por el motor); con el
 * movimiento reducido se ven quietas. Coreografía en globals.css (`h-*`, `m-*`, `kx-*`).
 */
export function Story() {
  return (
    <section id="como-funciona" aria-label="Cómo funciona Otea Austral" className="historia">
      <div className="historia-escenario">
        {/* Héroe «Horizonte vivo»: el H1 partido por el horizonte, la entrada y la acción principal debajo, y la
            cinta de pie sobre el suelo. Bajo 1024 px, además, una alerta de ejemplo en el primer pliegue. */}
        <div className="h-hero">
          <Horizonte />
          <p className="hero-antetitulo">
            <span aria-hidden="true" className="hero-punto" />
            Próximamente · Inteligencia de eventos para mercados
          </p>
          <h1 className="titular h1-horizonte">
            <span className="sr-only">Del horizonte al mercado.</span>
            <span aria-hidden="true" className="h1-caja h1-caja-1">
              <span className="h1-linea-1">
                <span className="h1-palabra">Del</span> <span className="h1-palabra">horizonte</span>
              </span>
            </span>
            <span aria-hidden="true" className="h1-caja h1-caja-2">
              <span className="h1-linea-2">al mercado.</span>
            </span>
          </h1>
          <div className="hero-debajo">
            <p className="hero-texto">
              Te avisamos de los eventos globales que importan y explicamos qué sectores y activos podrían verse
              afectados: quién gana, quién pierde y bajo qué condición, con nivel de confianza y fuentes.
            </p>
            <div className="hero-mando">
              <div className="hero-acciones">
                <Link href="#lista-de-espera" data-magnetico className={buttonClasses("primary")}>
                  <span className="boton-etiqueta">Recibir alertas</span>
                </Link>
                <Link href="#ejemplos" className={buttonClasses("outline")}>
                  Ver una alerta de ejemplo
                  <Flecha direccion="abajo" />
                </Link>
              </div>
            </div>
          </div>
          {/* Solo si el sistema pide menos movimiento: va en el cielo (escritorio), bajo las acciones junto a la alerta
              (tableta) o después de la alerta (teléfono). Nunca mueve el héroe, que así queda idéntico al fotograma
              final de la entrada. La alerta viva es decorativa (`aria-hidden`): el orden de lectura y de foco no cambia. */}
          <div className="hero-aviso">
            <AvisoMovimiento />
          </div>
          <AlertaViva />
          <Ribbon className="h-cinta" />
          {/* Dos capas: el párrafo lleva la salida ligada a la historia y el `span`, la entrada por tiempo (en un solo
              elemento, la clave de salida en su 0 % pisaba la entrada diferida). */}
          <p className="hero-desliza" aria-hidden="true" data-bucle>
            <span className="hero-desliza-asomo">
              Desliza
              <span className="hero-gota" />
            </span>
          </p>
        </div>

        <section aria-labelledby="paso-2-titulo" className="h-paso h-paso-2">
          <p className="contador text-apoyo">01 — Verificación</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-2-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Verificamos antes de avisar."
            className="titular mt-4 text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada alerta cita sus fuentes. La confianza alta exige una fuente primaria, y una alerta de impacto alto necesita dos organismos distintos y una aprobación humana antes de publicarse."
            className="mt-5 text-lg leading-relaxed text-texto-suave"
          />
          <ul className="micro mt-6 flex flex-wrap gap-2 text-texto">
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Fuente primaria</li>
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Dos organismos</li>
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Aprobación humana</li>
          </ul>
        </section>

        <Blueprint className="h-plano escena" />

        <section aria-labelledby="paso-3-titulo" className="h-paso h-paso-3">
          <p className="contador text-apoyo">02 — Impacto</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-3-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Quién gana, quién pierde y bajo qué condición."
            className="titular mt-4 text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada evento se traduce en sectores y activos que podrían beneficiarse o verse presionados, junto con la condición que tendría que cumplirse. Información y análisis, nunca una recomendación."
            className="mt-5 text-lg leading-relaxed text-texto-suave"
          />
        </section>

        <Board className="h-tablero escena" />

        <section aria-labelledby="paso-4-titulo" className="h-paso h-paso-4">
          <p className="contador text-apoyo">03 — Tu panel</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-4-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Tu panel antes de la apertura."
            className="titular mt-4 text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Elige los temas que sigues y recibe un resumen antes de que abra el mercado. Sin ruido: solo lo que cambia el panorama, con sus fuentes a un clic."
            className="mt-5 text-lg leading-relaxed text-texto-suave"
          />
          <p className="micro mt-8 font-semibold text-texto">Información, no asesoría.</p>
          <Link href="/metodologia" className={buttonClasses("outline", "mt-4")}>
            Ver metodología
            <Flecha />
          </Link>
        </section>
      </div>
    </section>
  );
}
