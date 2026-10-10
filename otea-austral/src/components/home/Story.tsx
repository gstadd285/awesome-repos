import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Blueprint } from "./Blueprint";
import { Board } from "./Board";
import { Ribbon } from "./Ribbon";

/**
 * Portada en cuatro pasos (001 — 004). En escritorio, con soporte de
 * animaciones ligadas al scroll y sin movimiento reducido, el escenario queda
 * fijo y las piezas se transforman al bajar: la cinta de eventos se pliega
 * sobre un plano técnico, del plano surge un tablero y las alertas caen
 * sobre él. En otros casos las piezas se apilan en orden de lectura.
 * Coreografía en globals.css (`h-*`).
 */
export function Story() {
  return (
    <section id="como-funciona" aria-label="Cómo funciona Otea Austral" className="historia">
      <div className="historia-escenario mx-auto max-w-[1440px] px-6">
        <p className="h-contador contador text-apoyo" aria-hidden="true">
          <span className="relative inline-block h-[1.4em] w-[3ch]">
            <span className="h-contador-paso">001</span>
            <span className="h-contador-paso">002</span>
            <span className="h-contador-paso">003</span>
            <span className="h-contador-paso">004</span>
          </span>
          <span> — 004</span>
        </p>

        <div className="h-luz luz-ventana" aria-hidden="true" />

        <div className="h-hero grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-start">
          <div>
            <h1 className="titular anim-aparecer text-display text-texto">Del horizonte al mercado.</h1>
            <p className="micro anim-aparecer anim-retraso-1 mt-6 flex items-center gap-2 text-texto-suave">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink" />
              Inteligencia de eventos para mercados · Próximamente
            </p>
          </div>
          <p className="anim-aparecer anim-retraso-2 max-w-[440px] text-base leading-relaxed text-texto-suave lg:justify-self-end">
            Te avisamos de los eventos globales que importan y explicamos qué sectores y activos podrían
            verse afectados: quién gana, quién pierde y bajo qué condición, con nivel de confianza y
            fuentes.
          </p>
        </div>

        <Ribbon className="h-cinta anim-aparecer anim-retraso-3" />

        <div className="h-hero-cta anim-aparecer anim-retraso-4 flex flex-col items-center gap-5 text-center">
          <p className="max-w-[380px] text-sm leading-relaxed text-texto-suave">
            ¿Quieres ver venir el próximo evento antes de que abra el mercado?
          </p>
          <Link href="#lista-de-espera" className={buttonClasses("primary")}>
            Recibir alertas
          </Link>
        </div>

        <a href="#temas" className="h-descubre micro inline-flex items-center gap-3 self-start text-texto">
          <span aria-hidden="true">↓</span> Descubre más
        </a>

        <section aria-labelledby="paso-2-titulo" className="h-paso h-paso-2">
          <p className="contador text-apoyo">002 — Verificación</p>
          <h2 id="paso-2-titulo" className="titular mt-4 text-titulo text-texto">
            Verificamos antes de avisar.
          </h2>
          <p className="mt-5 leading-relaxed text-texto-suave">
            Cada alerta cita sus fuentes. La confianza alta exige una fuente primaria, y una alerta de
            impacto alto necesita dos organismos distintos y una aprobación humana antes de publicarse.
          </p>
          <ul className="micro mt-6 flex flex-wrap gap-2 text-texto">
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Fuente primaria</li>
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Dos organismos</li>
            <li className="rounded-pill bg-papel-alto px-3 py-1.5 linea-fina">Aprobación humana</li>
          </ul>
        </section>

        <Blueprint className="h-plano" />

        <section aria-labelledby="paso-3-titulo" className="h-paso h-paso-3">
          <p className="contador text-apoyo">003 — Impacto</p>
          <h2 id="paso-3-titulo" className="titular mt-4 text-titulo text-texto">
            Quién gana, quién pierde y bajo qué condición.
          </h2>
          <p className="mt-5 leading-relaxed text-texto-suave">
            Cada evento se traduce en sectores y activos que podrían beneficiarse o verse presionados, junto
            con la condición que tendría que cumplirse. Información y análisis, nunca una recomendación.
          </p>
        </section>

        <Board className="h-tablero" />

        <section aria-labelledby="paso-4-titulo" className="h-paso h-paso-4">
          <p className="contador text-apoyo">004 — Tu panel</p>
          <h2 id="paso-4-titulo" className="titular mt-4 text-titulo text-texto">
            Tu panel antes de la apertura.
          </h2>
          <p className="mt-5 leading-relaxed text-texto-suave">
            Elige los temas que sigues y recibe un resumen antes de que abra el mercado. Sin ruido: solo lo
            que cambia el panorama, con sus fuentes a un clic.
          </p>
          <p className="micro mt-8 font-semibold text-texto">Información, no asesoría.</p>
          <Link href="/metodologia" className={buttonClasses("outline", "mt-4")}>
            Ver metodología
          </Link>
        </section>
      </div>
    </section>
  );
}
