import Link from "next/link";
import { AvisoMovimiento } from "@/components/motion/ControlesMovimiento";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { buttonClasses } from "@/components/ui/button";
import { Blueprint } from "./Blueprint";
import { Board } from "./Board";
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
      <div className="historia-escenario mx-auto max-w-[1440px] px-6">
        <div className="h-luz luz-ventana" aria-hidden="true" />

        {/* Héroe: qué es, en una frase; una acción principal. En escritorio el texto va a la derecha. */}
        <div className="h-hero hero-rejilla">
          <div className="hero-titulo">
            <p className="anim-aparecer flex items-center gap-2.5 text-sm text-texto-suave">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-acento" />
              Próximamente · Inteligencia de eventos para mercados
            </p>
            <TextoEnMovimiento
              como="h1"
              efecto="letras"
              disparo="carga"
              texto="Del horizonte al mercado."
              className="titular mt-5 text-display text-texto"
            />
            <AvisoMovimiento />
          </div>
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="carga"
            texto="Te avisamos de los eventos globales que importan y explicamos qué sectores y activos podrían verse afectados: quién gana, quién pierde y bajo qué condición, con nivel de confianza y fuentes."
            className="hero-texto max-w-[470px] text-lede text-texto-suave"
          />
          <div className="hero-acciones anim-aparecer anim-retraso-4 flex flex-wrap items-center gap-3">
            <Link href="#lista-de-espera" className={buttonClasses("primary")}>
              Recibir alertas
            </Link>
            <Link href="#ejemplos" className={buttonClasses("outline")}>
              Ver una alerta de ejemplo
            </Link>
          </div>
        </div>

        <Ribbon className="h-cinta anim-aparecer anim-retraso-3" />

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
          </Link>
        </section>
      </div>
    </section>
  );
}
