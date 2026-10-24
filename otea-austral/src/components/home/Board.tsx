import { vistasPortada } from "@/data/ejemplo";
import { TEMA_ETIQUETA, Tema, type Direccion } from "@/lib/domain/schemas";
import { CONFIANZA_ETIQUETA, DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { TopicIcon } from "./TopicIcon";

type Tarjeta = { clave: string; sector: string; evento: string; confianza: string; corregida: boolean; nueva: boolean };

const DIRECCIONES: Direccion[] = ["gana", "condicionado", "pierde"];

/** La alerta de ejemplo más reciente: sus tarjetas son las «nuevas» y su tema, el que se ilumina en el menú. */
const masReciente = vistasPortada.reduce((a, b) => (Date.parse(b.fecha) > Date.parse(a.fecha) ? b : a));

/**
 * Tarjetas por dirección, tomadas de las alertas de ejemplo (las tres primeras de cada una), y el total de filas de
 * esa dirección en los datos (el contador de la columna). «Corregida» es el estado real de la alerta; «Nueva» marca la
 * tarjeta de la alerta más reciente en la última columna en llegar.
 */
function columnas(): { direccion: Direccion; total: number; tarjetas: Tarjeta[] }[] {
  return DIRECCIONES.map((direccion) => {
    const filas = vistasPortada.flatMap((alerta) =>
      alerta.filas
        .filter((f) => f.direccion === direccion)
        .map((f) => ({
          clave: `${alerta.id}-${f.sector}`,
          sector: f.sector,
          evento: alerta.evento,
          confianza: CONFIANZA_ETIQUETA[f.confianza_mostrada],
          corregida: alerta.estado === "corregida",
          nueva: direccion === "pierde" && alerta.id === masReciente.id,
        })),
    );
    const tarjetas = filas.slice(0, 3);
    // Una sola tarjeta «Nueva».
    let marcada = false;
    for (const t of tarjetas) {
      t.nueva = t.nueva && !marcada;
      marcada ||= t.nueva;
    }
    return { direccion, total: filas.length, tarjetas };
  });
}

/**
 * El panel de Otea en una tableta (paso 02 y 03): temas a la izquierda y alertas por dirección. Tres corrientes de color
 * bajan del evento a sus columnas, las tarjetas caen en ellas y, ya de frente, llega el aviso del resumen pre-apertura.
 * Ilustración con datos de ejemplo (oculta a lectores de pantalla: las alertas accesibles están en «Así se ve una
 * alerta.»). Sin movimiento se ve completa, de frente y con el aviso. Coreografía en `globals.css`.
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
                <li key={tema} className={tema === masReciente.tema ? "tablero-menu-activo" : undefined}>
                  <TopicIcon tema={tema} />
                  {TEMA_ETIQUETA[tema]}
                </li>
              ))}
            </ul>
            <div className="tablero-columnas">
              <div className="tablero-corrientes">
                {DIRECCIONES.map((d) => (
                  <i key={d} className={`tablero-corriente tablero-corriente-${d}`} />
                ))}
              </div>
              {columnas().map((col) => (
                <div key={col.direccion} className="tablero-columna">
                  <p className="tablero-columna-titulo">
                    {DIRECCION_ETIQUETA[col.direccion]}
                    <span className="tablero-contador">{col.total}</span>
                  </p>
                  {col.tarjetas.map((t) => (
                    <div key={t.clave} className={`tablero-tarjeta tablero-tarjeta-${col.direccion}`}>
                      <p className="tablero-tarjeta-sector">{t.sector}</p>
                      <p className="tablero-tarjeta-evento">{t.evento}</p>
                      <p className="tablero-tarjeta-pie">
                        <span className="tablero-tarjeta-chip">Confianza {t.confianza}</span>
                        {t.corregida ? <span className="tablero-corregida">Corregida</span> : null}
                      </p>
                      {t.nueva ? <span className="tablero-nueva">Nueva</span> : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="tablero-aviso">
        <span className="tablero-aviso-sol" />
        <span className="tablero-aviso-texto">
          <span className="tablero-aviso-titulo">Resumen pre-apertura</span>
          <span className="tablero-aviso-detalle">{vistasPortada.length} alertas en tus temas · Datos de ejemplo</span>
        </span>
      </div>
    </div>
  );
}
