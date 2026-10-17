import { CONFIANZA_ETIQUETA, DIRECCION_ETIQUETA, TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { DirectionIcon } from "@/components/alert-card/DirectionBadge";
import { vistaEjemplo } from "@/data/ejemplo";
import { contarOrganismosDistintos } from "@/lib/domain/rules";
import { TEMA_ETIQUETA, type Confianza, type Direccion } from "@/lib/domain/schemas";

const DIRECCIONES: Direccion[] = ["gana", "condicionado", "pierde"];
const SEGMENTOS: Record<Confianza, number> = { baja: 1, media: 2, alta: 3 };

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Alerta viva del héroe en el teléfono y la tableta (bajo 1024 px): el producto en el primer pliegue. Es la alerta
 * de ejemplo de Ormuz y todo lo que muestra sale de los datos y de las reglas reales (`vistaEjemplo`): la confianza
 * y el medidor se calculan desde las fuentes, la fuente es la primaria, los organismos se cuentan como los cuenta la
 * regla del impacto alto y las filas son la primera de cada dirección. Nada se escribe a mano.
 *
 * Decorativa (`aria-hidden`): la versión accesible y completa está en «Así se ve una alerta.» (`#ejemplos`). Sin
 * movimiento se ve completa y quieta; con la puerta abierta sale de su línea de base, los checks hacen *pop*, el
 * medidor se llena por segmentos y cada fila se enciende cuando llega un pulso del horizonte (`globals.css`).
 */
export function AlertaViva() {
  const alerta = vistaEjemplo("ejemplo-ormuz");
  const primaria = alerta.fuentes.find((f) => f.tipo === "primaria") ?? alerta.fuentes[0];
  const organismos = contarOrganismosDistintos(alerta.fuentes);
  const llenos = SEGMENTOS[alerta.confianza];
  const filas = DIRECCIONES.flatMap((direccion) => alerta.filas.find((f) => f.direccion === direccion) ?? []);

  return (
    <div className="alerta-viva" aria-hidden="true">
      <div className="av-cabecera">
        <span className="av-tema">{TEMA_ETIQUETA[alerta.tema]}</span>
        {alerta.es_ejemplo ? <span className="av-ejemplo">Datos de ejemplo</span> : null}
      </div>
      <p className="av-titulo">{alerta.evento}</p>
      {primaria ? (
        <p className="av-fuente">
          <span className="av-check" />
          <span className="av-tipo">{TIPO_FUENTE_ETIQUETA[primaria.tipo].replace("Fuente ", "")}</span>
          <span className="av-organismo">{primaria.organismo}</span>
        </p>
      ) : null}
      <div className="av-confianza">
        <span className="av-rotulo">Confianza</span>
        <span className="av-medidor">
          {[0, 1, 2].map((i) => (
            <i key={i} className={i < llenos ? "av-segmento av-lleno" : "av-segmento"} />
          ))}
        </span>
        <span className="av-nivel">{mayuscula(CONFIANZA_ETIQUETA[alerta.confianza])}</span>
      </div>
      <ul className="av-filas">
        {filas.map((fila) => (
          <li key={fila.direccion} className="av-fila">
            <span className={`av-chip av-chip-${fila.direccion}`}>
              <DirectionIcon direccion={fila.direccion} />
              {DIRECCION_ETIQUETA[fila.direccion]}
            </span>
            <span className="av-sector">
              {fila.sector}
              <span className="av-condicion">{fila.condicion}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="av-sello">
        <span className="av-sello-marca" />
        <span>
          Revisada por una persona
          {alerta.impacto === "alto" ? " · Impacto alto" : null}
        </span>
        <span className="av-organismos">
          {organismos} {organismos === 1 ? "organismo" : "organismos"}
        </span>
      </p>
    </div>
  );
}
