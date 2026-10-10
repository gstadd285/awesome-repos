"use client";

import { useState } from "react";
import { TEMAS, TEMA_ETIQUETA, type Tema } from "@/lib/domain/temas";
import { TopicIcon } from "./TopicIcon";

/**
 * Vista previa de "Tus temas": se pueden marcar temas, pero aún no se
 * guardan (llegará con las cuentas). Botones con `aria-pressed`.
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
    <div className="superficie rounded-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="micro text-texto">Tus temas</p>
        <span className="micro rounded-badge bg-fondo px-2 py-1 text-texto-suave linea-fina">
          Vista previa
        </span>
      </div>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Temas disponibles">
        {TEMAS.map((tema) => {
          const activo = elegidos.includes(tema);
          return (
            <li key={tema}>
              <button
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(tema)}
                className={`inline-flex items-center gap-2 rounded-badge px-3 py-2 text-sm transition-colors ${
                  activo
                    ? "bg-ink text-ivory"
                    : "bg-papel text-texto-suave linea-fina hover:bg-papel-alto hover:text-texto"
                }`}
              >
                <TopicIcon tema={tema} className="h-4 w-4" />
                {TEMA_ETIQUETA[tema]}
                <span aria-hidden="true">{activo ? "✓" : "+"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 border-t border-linea pt-4 text-sm text-texto" aria-live="polite">
        {resumen}
      </p>
      <p className="mt-2 text-xs text-apoyo">Tus preferencias aún no se guardan: es una vista previa.</p>
    </div>
  );
}
