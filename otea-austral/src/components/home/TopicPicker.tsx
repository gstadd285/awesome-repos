"use client";

import { useState } from "react";
import { CHIP_SECTOR, ESTILO_DIRECCION } from "@/components/alert-card/DirectionBadge";
import { DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { TEMAS, TEMA_ETIQUETA, type Tema } from "@/lib/domain/temas";
import { TEMA_BREVE, type AvisoPrevia } from "./temas";
import { TopicIcon } from "./TopicIcon";

const DIRECCIONES = ["gana", "condicionado", "pierde"] as const;

/** Cuántos avisos se ven en el teléfono antes de «y N más». */
const MAXIMO_TELEFONO = 3;

/** Clases finitas para el ancho de cada tramo de la barra (`flex-grow`), sin `style` (la CSP lo bloquea). */
const BARRA = ["barra-0", "barra-1", "barra-2", "barra-3", "barra-4", "barra-5", "barra-6", "barra-7", "barra-8", "barra-9", "barra-10", "barra-11", "barra-12"];

/**
 * «Elige qué seguir» y «Tu mañana»: los seis temas como interruptores compactos (`aria-pressed`) y, al lado, la vista
 * previa en tinta de los avisos de ejemplo de los temas elegidos, con su contador y una barra por dirección. Los avisos
 * que no corresponden se pliegan (`data-oculto`, `inert`, `aria-hidden`), no se desmontan, para animar su salida. Aún
 * no se guarda nada (llegará con las cuentas). Sin JavaScript se ve la selección por defecto ya filtrada.
 */
export function TopicPicker({ avisos }: { avisos: AvisoPrevia[] }) {
  const [elegidos, setElegidos] = useState<Tema[]>(["cobre", "divisas"]);

  function alternar(tema: Tema) {
    setElegidos((actual) => (actual.includes(tema) ? actual.filter((t) => t !== tema) : [...actual, tema]));
  }

  const resumen =
    elegidos.length === 0
      ? "Aún no eliges temas."
      : `Recibirías alertas de: ${TEMAS.filter((t) => elegidos.includes(t))
          .map((t) => TEMA_ETIQUETA[t])
          .join(", ")}.`;

  const visibles = avisos.filter((a) => elegidos.includes(a.tema));
  const porDireccion = Object.fromEntries(
    DIRECCIONES.map((d) => [d, visibles.reduce((n, a) => n + a.filas.filter((f) => f.direccion === d).length, 0)]),
  ) as Record<(typeof DIRECCIONES)[number], number>;
  const n = visibles.length;
  const restantes = Math.max(0, n - MAXIMO_TELEFONO);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-start lg:gap-14">
      {/* Con muchos temas marcados la vista previa crece: los interruptores la acompañan. */}
      <div className="lg:sticky lg:top-28">
        <ul aria-label="Temas disponibles" className="grid grid-cols-2 gap-2 sm:gap-3">
          {TEMAS.map((tema) => {
            const activo = elegidos.includes(tema);
            return (
              <li key={tema}>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={() => alternar(tema)}
                  className="tm-tema superficie-interactiva"
                >
                  <span className="tm-icono">
                    <TopicIcon tema={tema} className="tm-icono-svg" />
                  </span>
                  <span className="tm-nombre">{TEMA_ETIQUETA[tema]}</span>
                  <span className="tm-breve">{TEMA_BREVE[tema]}</span>
                  {/* El mismo texto en tinta, sobre un relleno recortado por un círculo que crece desde la marca: en
                      cada cuadro el texto se lee sobre su propio fondo. Decorativo: el nombre accesible es el de arriba. */}
                  <span className="tm-tinta" aria-hidden="true">
                    <span className="tm-nombre">{TEMA_ETIQUETA[tema]}</span>
                    <span className="tm-breve">{TEMA_BREVE[tema]}</span>
                  </span>
                  <span className="tm-marca" aria-hidden="true">
                    <svg viewBox="0 0 12 12" focusable="false">
                      <path className="tm-marca-mas" d="M6 2.5v7M2.5 6h7" />
                      <path className="tm-marca-check" d="M2.5 6.4 5 8.8l4.6-5.3" />
                    </svg>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-linea pt-4">
          <p className="text-base font-medium text-texto" aria-live="polite">
            {resumen}
          </p>
          <p className="text-sm text-apoyo">Tus preferencias aún no se guardan: es una vista previa.</p>
        </div>
      </div>

      <aside aria-label="Tu mañana, vista previa" className="tm-manana en-tinta">
        <header className="tm-cabeza flex items-center justify-between gap-3 pb-4">
          <p className="micro text-niebla">
            Tu mañana<span className="hidden sm:inline"> · vista previa</span>
          </p>
          <span className="ejemplo-tinta">Datos de ejemplo</span>
        </header>
        <p className="mt-5 flex items-baseline gap-3.5">
          <span className="tm-cifra-marco">
            <span key={n} className="tm-cifra">
              {n}
            </span>
          </span>
          <span className="text-base text-niebla">{n === 1 ? "aviso de ejemplo en tus temas" : "avisos de ejemplo en tus temas"}</span>
        </p>
        <div className="tm-barra" aria-hidden="true">
          {DIRECCIONES.map((d) => (
            <span key={d} className={`tm-barra-tramo tm-barra-${d} ${BARRA[Math.min(porDireccion[d], 12)]}`} />
          ))}
        </div>
        <ul className="tm-leyenda mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-niebla" aria-label="Sectores por dirección">
          {DIRECCIONES.map((d) => (
            <li key={d} data-direccion={d} className="icono-dir inline-flex items-center gap-1.5">
              <span className="cifras">{porDireccion[d]}</span> {DIRECCION_ETIQUETA[d].toLowerCase()}
            </li>
          ))}
        </ul>

        <ol className="tm-avisos">
          {avisos.map((a) => {
            const oculto = !elegidos.includes(a.tema);
            const extra = !oculto && visibles.indexOf(a) >= MAXIMO_TELEFONO;
            return (
              <li
                key={a.id}
                className={extra ? "tm-aviso tm-extra" : "tm-aviso"}
                data-oculto={oculto ? "" : undefined}
                inert={oculto}
                aria-hidden={oculto ? true : undefined}
              >
                {/* El cuerpo es la fila que se pliega (`0fr`): sin relleno propio, el aire lo dan los márgenes de sus hijos. */}
                <div className="tm-aviso-cuerpo">
                  <time className="tm-aviso-hora mt-4 flex items-baseline gap-2 font-mono text-xs text-niebla" dateTime={a.instante}>
                    <span className="tm-hora">{a.hora}</span> {a.dia}
                  </time>
                  <p className="tm-aviso-tema micro text-niebla">{TEMA_ETIQUETA[a.tema]}</p>
                  <p className="mt-1 font-serif text-lg leading-snug text-ivory">{a.evento}</p>
                  {/* El ícono de cada dirección lo dibuja el CSS (`[data-direccion]::before`): menos nodos. */}
                  <ul className="tm-chips mt-2.5 mb-4 flex flex-wrap gap-1.5" aria-label="Sectores que podrían verse afectados">
                    {a.filas.map((f) => (
                      <li key={f.sector} data-direccion={f.direccion} className={`${CHIP_SECTOR} ${ESTILO_DIRECCION[f.direccion]}`}>
                        <span className="sr-only">{DIRECCION_ETIQUETA[f.direccion]}: </span>
                        {f.sector}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
        {n === 0 ? <p className="pt-6 pb-2 font-serif text-lg text-niebla">Elige un tema para ver cómo llegaría tu mañana.</p> : null}
        {restantes > 0 ? (
          <p className="pt-3.5 text-sm text-niebla sm:hidden">
            y {restantes} {restantes === 1 ? "aviso más" : "avisos más"} en tus temas
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-normal text-niebla">Escenarios ficticios para mostrar el formato. Información, no asesoría.</p>
      </aside>
    </div>
  );
}
