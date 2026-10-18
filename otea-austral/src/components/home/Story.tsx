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
 * Portada: el héroe y tres pasos (01 — 03) como un solo plano-secuencia. En escritorio (≥ 1024 px), con líneas de tiempo
 * y con el movimiento activado, el escenario queda fijo (470vh) a sangre: el titular se pone, la cinta se tiende y se
 * junta en la ficha del evento mientras la cámara se inclina sobre el suelo, que se vuelve el plano técnico; una lente
 * verifica tres fuentes; el plano se vuelve tableta, bajan tres corrientes y caen las alertas; la tableta queda de frente
 * con el alba detrás y el escenario se apaga en el relevo. Los textos de los pasos son 2D y entran enteros, con un riel
 * 01 · 02 · 03 abajo a la izquierda. En el resto de pantallas las piezas se apilan (rejilla alternada desde 768 px) y se
 * arman al entrar (`escena`); los textos se revelan una sola vez (`data-texto`). Con movimiento reducido o sin JS, todo
 * queda quieto en su estado final. Coreografía en globals.css (`h-*`, `m-*`, `kx-*`).
 */
/** Los tres pasos del riel y sus anclas dentro de la historia fija. */
const RIEL = [
  { ancla: "paso-verificar", nombre: "Verificación" },
  { ancla: "paso-impacto", nombre: "Impacto" },
  { ancla: "paso-panel", nombre: "Tu panel" },
];

/** Tramos con vigía (franja observada): lo que ya salió del héroe, la cinta, el plano y lo que verifica sobre él, la
    tableta y el alba con el velo. */
const VIGIAS = ["inicio", "salida", "titulo", "cinta", "plano", "verificar", "tablero", "alba"] as const;

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
          <p className="contador h-paso-numero">01 — Verificación</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-2-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Verificamos antes de avisar."
            className="titular h-paso-titulo"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada alerta cita sus fuentes. La confianza alta exige una fuente primaria, y una alerta de impacto alto necesita dos organismos distintos y una aprobación humana antes de publicarse."
            className="h-paso-texto"
          />
        </section>

        <Blueprint className="h-plano escena" />

        <section aria-labelledby="paso-3-titulo" className="h-paso h-paso-3">
          <p className="contador h-paso-numero">02 — Impacto</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-3-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Quién gana, quién pierde y bajo qué condición."
            className="titular h-paso-titulo"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Cada evento se traduce en sectores y activos que podrían beneficiarse o verse presionados, junto con la condición que tendría que cumplirse. Información y análisis, nunca una recomendación."
            className="h-paso-texto"
          />
        </section>

        <Board className="h-tablero escena" />

        <section aria-labelledby="paso-4-titulo" className="h-paso h-paso-4">
          <p className="contador h-paso-numero">03 — Tu panel</p>
          <TextoEnMovimiento
            como="h2"
            id="paso-4-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Tu panel antes de la apertura."
            className="titular h-paso-titulo"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Elige los temas que sigues y recibe un resumen antes de que abra el mercado. Sin ruido: solo lo que cambia el panorama, con sus fuentes a un clic."
            className="h-paso-texto"
          />
          <p className="micro mt-7 font-semibold text-texto">Información, no asesoría.</p>
          <Link href="/metodologia" className={buttonClasses("outline", "mt-4")}>
            Ver metodología
            <Flecha />
          </Link>
        </section>

        {/* El alba detrás del panel ya de frente (solo en la historia fija), el riel de los tres pasos y el velo del
            relevo (hermano de las piezas 3D, nunca su ancestro: una opacidad en un ancestro aplanaría el 3D). */}
        <div className="h-alba" aria-hidden="true">
          <span className="h-alba-sol" />
        </div>
        <nav className="h-riel" aria-label="Pasos de la historia">
          <ol>
            {RIEL.map((paso, i) => (
              <li key={paso.ancla}>
                <a href={`#${paso.ancla}`} className="h-riel-paso">
                  <span className="h-riel-numero">0{i + 1}</span>
                  {paso.nombre}
                </a>
              </li>
            ))}
          </ol>
          <span className="h-riel-linea" aria-hidden="true">
            <span className="h-riel-avance" />
          </span>
        </nav>
        <div className="h-velo" aria-hidden="true" />
      </div>
      {/* Anclas del riel: puntos del recorrido de la historia fija (no ocupan lugar). */}
      {RIEL.map((paso, i) => (
        <span key={paso.ancla} id={paso.ancla} className={`h-ancla h-ancla-${i + 1}`} />
      ))}
      {/* Vigías: franjas invisibles que `DirectorEscena` observa; fuera de su ventana, las piezas decorativas de ese tramo
          dejan de dibujarse (ver `.h-vigia` en globals.css). */}
      {VIGIAS.map((tramo) => (
        <span key={tramo} className={`h-vigia h-vigia-${tramo}`} data-vigia aria-hidden="true" />
      ))}
    </section>
  );
}
