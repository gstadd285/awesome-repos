"use client";

import { useState } from "react";
import { TEMAS, TEMA_ETIQUETA, type Tema } from "@/lib/domain/temas";
import { TEMA_DESCRIPCION } from "./temas";
import { TopicIcon } from "./TopicIcon";

/**
 * «Elige qué seguir»: los seis temas como tarjetas que se marcan y se desmarcan. Aún no se guardan
 * (llegará con las cuentas), así que es una vista previa. Botones con `aria-pressed`.
 */
export function TopicPicker() {
  const [elegidos, setElegidos] = useState<Tema[]>(["cobre", "divisas"]);

  function alternar(tema: Tema) {
    setElegidos((actual) =>
      actual.includes(tema) ? actual.filter((t) => t !== tema) : [...actual, tema],
    );
  }

  const resumen =
    elegidos.length === 0
      ? "Aún no eliges temas."
      : `Recibirías alertas de: ${TEMAS
          .filter((t) => elegidos.includes(t))
          .map((t) => TEMA_ETIQUETA[t])
          .join(", ")}.`;

  return (
    <div>
      <ul aria-label="Temas disponibles" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMAS.map((tema) => {
          const activo = elegidos.includes(tema);
          return (
            <li key={tema}>
              <button
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(tema)}
                className={`flex h-full w-full flex-col gap-6 rounded-card p-5 text-left transition-[background-color,box-shadow] duration-300 ${
                  activo
                    ? "bg-ink text-ivory shadow-[0_24px_48px_-28px_rgb(15_27_45/0.6)]"
                    : "superficie superficie-interactiva text-texto"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      activo ? "bg-ivory/10 text-ivory" : "bg-fondo text-texto"
                    }`}
                  >
                    <TopicIcon tema={tema} />
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      activo ? "bg-acento text-ink" : "linea-fina text-apoyo"
                    }`}
                  >
                    {activo ? "✓" : "+"}
                  </span>
                </span>
                <span>
                  <span className="titular block text-xl">{TEMA_ETIQUETA[tema]}</span>
                  <span
                    className={`mt-2 block text-sm leading-relaxed ${activo ? "text-ivory" : "text-texto-suave"}`}
                  >
                    {TEMA_DESCRIPCION[tema]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-linea pt-5">
        <p className="text-base font-medium text-texto" aria-live="polite">
          {resumen}
        </p>
        <p className="text-sm text-apoyo">Tus preferencias aún no se guardan: es una vista previa.</p>
      </div>
    </div>
  );
}
