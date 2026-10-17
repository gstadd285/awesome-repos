import { vistasEjemplo } from "@/data/ejemplo";
import { TEMA_ETIQUETA, Tema, type Direccion } from "@/lib/domain/schemas";
import { CONFIANZA_ETIQUETA, DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { TopicIcon } from "./TopicIcon";

type Tarjeta = { sector: string; evento: string; confianza: string };

const DIRECCIONES: Direccion[] = ["gana", "condicionado", "pierde"];

/** Tarjetas por dirección, tomadas de las alertas de ejemplo. */
function columnas(): { direccion: Direccion; tarjetas: Tarjeta[] }[] {
  return DIRECCIONES.map((direccion) => ({
    direccion,
    tarjetas: vistasEjemplo
      .flatMap((alerta) =>
        alerta.filas
          .filter((f) => f.direccion === direccion)
          .map((f) => ({
            sector: f.sector,
            evento: alerta.evento,
            confianza: CONFIANZA_ETIQUETA[f.confianza_mostrada],
          })),
      )
      .slice(0, 3),
  }));
}

/**
 * Tableta con el panel de Otea: temas a la izquierda y alertas por
 * dirección. Ilustración con datos de ejemplo (oculta a lectores de
 * pantalla: las alertas reales accesibles están en la sección de ejemplos).
 */
export function Board({ className = "" }: { className?: string }) {
  return (
    <div className={`tablero ${className}`} aria-hidden="true">
      <div className="tablero-marco">
        <div className="tablero-pantalla">
          <div className="tablero-cabecera">
            <span>Panel</span>
            <span className="tablero-chip">Datos de ejemplo</span>
          </div>
          <div className="tablero-cuerpo">
            <ul className="tablero-menu">
              {Tema.options.map((tema) => (
                <li key={tema}>
                  <TopicIcon tema={tema} />
                  {TEMA_ETIQUETA[tema]}
                </li>
              ))}
            </ul>
            <div className="tablero-columnas">
              {columnas().map((col) => (
                <div key={col.direccion} className="tablero-columna">
                  <p className="tablero-columna-titulo">{DIRECCION_ETIQUETA[col.direccion]}</p>
                  {col.tarjetas.map((t) => (
                    <div key={t.sector} className={`tablero-tarjeta tablero-tarjeta-${col.direccion}`}>
                      <p className="tablero-tarjeta-sector">{t.sector}</p>
                      <p className="tablero-tarjeta-evento">{t.evento}</p>
                      <span className="tablero-tarjeta-chip">Confianza {t.confianza}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
