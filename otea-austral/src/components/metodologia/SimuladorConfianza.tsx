"use client";

import { useState, useSyncExternalStore } from "react";
import {
  acotarConfianza,
  calcularConfianza,
  calcularNivelVerificacion,
  contarOrganismosDistintos,
  type Confianza,
  type FuenteRespaldo,
  type NivelVerificacion,
  type TipoFuente,
} from "@/lib/domain/respaldo";

/** Una fuente del banco del simulador (de los datos de ejemplo, ya validados en el servidor). */
export type FuenteSimulador = FuenteRespaldo & { id: string };
/** Una fila de la alerta de ejemplo: su sector y la confianza que declaró el analista. */
export type FilaSimulador = { sector: string; declarada: Confianza };

const CONFIANZA: Record<Confianza, string> = { baja: "baja", media: "media", alta: "alta" };
const VERIFICACION: Record<NivelVerificacion, string> = {
  sin_verificar: "Sin verificar",
  una_fuente: "Una fuente",
  dos_fuentes: "Dos fuentes independientes",
  fuente_oficial: "Fuente oficial",
};
const TIPO: Record<TipoFuente, string> = { primaria: "Primaria", secundaria: "Secundaria", prensa: "Prensa" };

/** La razón del resultado en una frase que cita la regla de `CLAUDE.md` / `rules.ts`. */
function razon(fuentes: readonly FuenteRespaldo[], organismos: number): string {
  if (fuentes.length === 0) return "Sin fuentes la confianza es baja: solo se calcula a partir de ellas (regla 6).";
  if (fuentes.some((f) => f.tipo === "primaria")) return "Hay una fuente primaria: es lo único que permite confianza alta (regla 1).";
  if (fuentes.some((f) => f.tipo === "secundaria")) return "Una fuente secundaria sin primaria llega a confianza media (regla 2).";
  return organismos >= 2
    ? "Solo prensa: con dos organismos distintos llega a media, nunca a alta (regla 2)."
    : "Solo prensa y de un solo organismo: la confianza es baja (regla 2).";
}

const sinSuscripcion = () => () => {};

/**
 * Simulador de confianza de /metodologia, con las reglas reales (`respaldo.ts`, sin Zod en el navegador): cada fuente
 * de ejemplo es un interruptor (`aria-pressed`); el medidor, el nivel, la razón, «¿Podría ser impacto alto?» y las filas
 * de la alerta de Ormuz (confianza declarada y mostrada) se recalculan al pulsar. El estado inicial es el del servidor
 * (las fuentes reales de la alerta de ejemplo) y los botones esperan a hidratar; sin JavaScript se ve ese estado.
 */
export function SimuladorConfianza({
  banco,
  inicial,
  filas,
}: {
  banco: FuenteSimulador[];
  inicial: string[];
  filas: FilaSimulador[];
}) {
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const [activas, setActivas] = useState<readonly string[]>(inicial);
  const fuentes = banco.filter((f) => activas.includes(f.id));
  const confianza = calcularConfianza(fuentes);
  const nivel = calcularNivelVerificacion(fuentes);
  const organismos = contarOrganismosDistintos(fuentes);
  const conmutar = (id: string) =>
    setActivas((antes) => (antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id]));

  return (
    <div id="simulador">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-linea pb-4">
        <p className="micro text-texto">Simulador de confianza</p>
        <p className="micro text-apoyo">Datos de ejemplo</p>
      </div>

      <div className="mt-5 grid items-center gap-x-6 gap-y-2 sm:grid-cols-2">
        <Medidor confianza={confianza} />
        <div aria-live="polite">
          <p className="titular text-2xl text-texto">
            Confianza <strong className="font-semibold">{CONFIANZA[confianza]}</strong>
          </p>
          <p className="contador mt-1 text-apoyo">{VERIFICACION[nivel]}</p>
          <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">{razon(fuentes, organismos)}</p>
        </div>
      </div>

      <div role="group" aria-label="Fuentes de la alerta de ejemplo de Ormuz" className="mt-5 grid gap-2 sm:grid-cols-2">
        {banco.map((f) => {
          const activa = activas.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={activa}
              disabled={!hidratado}
              onClick={() => conmutar(f.id)}
              className={`sim-fuente flex min-h-11 items-start gap-2.5 rounded-badge px-3 py-2.5 text-left text-sm leading-snug ${
                activa ? "bg-papel-alto text-texto filete-fuerte" : "bg-papel text-texto-suave linea-fina"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-badge ${activa ? "bg-ink" : "linea-fina"}`}
              >
                {activa ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3">
                    <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#B08D57" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <span className="grid gap-1">
                <span>{f.organismo}</span>
                <span className="contador text-apoyo">
                  <span className="sr-only">, fuente </span>
                  {TIPO[f.tipo]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 border-t border-linea pt-4">
        <div>
          <p className="micro text-texto">¿Podría ser impacto alto?</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-texto-suave">
            <li>
              <span aria-hidden="true" className="mr-2 font-semibold text-texto">
                {organismos >= 2 ? "✓" : "✕"}
              </span>
              Dos organismos distintos: {organismos >= 2 ? "sí" : "no"} <span className="contador text-apoyo">({organismos})</span>
            </li>
            <li>
              <span aria-hidden="true" className="mr-2 text-apoyo">
                –
              </span>
              Aprobación de una persona tras la última edición: se registra al revisar
            </li>
          </ul>
        </div>
        <table className="w-full text-left text-xs">
          <caption className="micro pb-2 text-left text-texto">Filas de la alerta de Ormuz</caption>
          <thead>
            <tr>
              {["Sector", "Declarada", "Mostrada"].map((c) => (
                <th key={c} scope="col" className="border-t border-linea py-1.5 pr-4 font-normal text-apoyo">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const mostrada = acotarConfianza(fila.declarada, confianza);
              const acotada = mostrada !== fila.declarada;
              return (
                <tr key={fila.sector} className="border-t border-linea text-texto-suave">
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    {fila.sector}
                  </th>
                  <td className="py-1.5 pr-4">{CONFIANZA[fila.declarada]}</td>
                  <td className={`py-1.5 ${acotada ? "font-semibold text-brass-deep" : ""}`}>
                    {CONFIANZA[mostrada]}
                    {acotada ? <span className="sr-only"> (acotada)</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <noscript>
        <p className="mt-4 text-sm text-apoyo">Sin JavaScript se ve el estado inicial: la alerta de Ormuz con sus dos fuentes.</p>
      </noscript>
    </div>
  );
}

const ORDEN: Record<Confianza, number> = { baja: 0, media: 1, alta: 2 };
const TRAMOS = [
  { desde: -178, hasta: -122, nivel: 0 },
  { desde: -118, hasta: -62, nivel: 1 },
  { desde: -58, hasta: -2, nivel: 2 },
] as const;

/** Arco de radio 84 entre dos ángulos (0 = este, negativos = arriba). */
function arco(desde: number, hasta: number) {
  const p = (g: number) => {
    const a = (g * Math.PI) / 180;
    return `${(Math.cos(a) * 84).toFixed(1)},${(Math.sin(a) * 84).toFixed(1)}`;
  };
  return `M${p(desde)}A84,84 0 0 1 ${p(hasta)}`;
}

/**
 * Medidor de tres niveles con aguja: los tramos hasta el nivel van en tinta y la aguja apunta al suyo (−60°, 0° o 60°;
 * con la puerta abierta, la aguja salta con un rebote). Decorativo: el nivel se lee al lado.
 */
function Medidor({ confianza }: { confianza: Confianza }) {
  const nivel = ORDEN[confianza];
  return (
    <svg viewBox="-104 -112 208 130" className="mx-auto w-full max-w-[220px]" aria-hidden="true">
      {TRAMOS.map((t) => (
        <path
          key={t.nivel}
          d={arco(t.desde, t.hasta)}
          fill="none"
          strokeWidth="12"
          stroke={t.nivel <= nivel ? "#0F1B2D" : "#D9D7D2"}
        />
      ))}
      <g className="font-mono" fontSize="9.5" letterSpacing="0.8" fill="#4C5665" textAnchor="middle">
        <text x="-84" y="16">BAJA</text>
        <text y="-101">MEDIA</text>
        <text x="84" y="16">ALTA</text>
      </g>
      <g className="aguja" transform={`rotate(${(nivel - 1) * 60})`}>
        <path d="M0,-70L3.2,0L-3.2,0Z" fill="#0F1B2D" />
        <circle r="7" fill="#B08D57" stroke="#0F1B2D" strokeWidth="2" />
      </g>
    </svg>
  );
}
