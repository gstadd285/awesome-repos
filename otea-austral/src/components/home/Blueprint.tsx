import { CONFIANZA_ETIQUETA, TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { vistaEjemplo } from "@/data/ejemplo";
import { contarOrganismosDistintos } from "@/lib/domain/rules";
import { TEMA_ETIQUETA, type Confianza } from "@/lib/domain/schemas";

const NIVELES: Confianza[] = ["baja", "media", "alta"];

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Plano técnico del paso 01 («Verificamos antes de avisar.»): el suelo del héroe visto desde arriba. En el centro, la
 * ficha del evento (la alerta de ejemplo de Ormuz, con su tema, el medidor de confianza y «Datos de ejemplo»); al
 * frente, tres fichas de pie con las tres comprobaciones reales de la metodología, unidas al evento por hilos de latón;
 * una lente (un anillo de latón con mango: **no** es el emblema) que las recorre y un check que sella cada una. Cotas y
 * rumbos de dibujo técnico alrededor.
 *
 * Dos capas: `.plano` (plana, con su propia perspectiva) lleva la presencia (opacidad y posición) y `.plano-mundo`
 * (`preserve-3d`) la postura. Una opacidad en el mundo 3D lo aplanaría: las fichas de pie se proyectarían sobre el plano.
 *
 * Los textos salen de los datos y las reglas reales (`vistaEjemplo`, `contarOrganismosDistintos`). Decorativo
 * (`aria-hidden`): lo que explica el paso está en su texto. Sin movimiento se ve en su estado final: fichas selladas,
 * medidor lleno hasta la confianza calculada y la lente en reposo junto a la última ficha. La coreografía vive en
 * `globals.css` (`h-plano*` en la historia fija, `m-plano*` al armarse en pantallas estrechas).
 */
export function Blueprint({ className = "" }: { className?: string }) {
  const alerta = vistaEjemplo("ejemplo-ormuz");
  const primaria = alerta.fuentes.find((f) => f.tipo === "primaria") ?? alerta.fuentes[0];
  const organismos = contarOrganismosDistintos(alerta.fuentes);
  const llenos = NIVELES.indexOf(alerta.confianza) + 1;
  const fichas = [
    {
      titulo: TIPO_FUENTE_ETIQUETA.primaria,
      detalle: primaria?.organismo ?? "",
    },
    {
      titulo: "Dos organismos",
      detalle: `${organismos} ${organismos === 1 ? "organismo distinto" : "organismos distintos"}`,
    },
    { titulo: "Aprobación humana", detalle: "Revisada por una persona" },
  ];

  return (
    <div className={`plano ${className}`} aria-hidden="true">
      <div className="plano-mundo">
        <div className="plano-superficie reticula-puntos" />
        <div className="plano-cotas">
          <span className="plano-cota plano-cota-arriba" />
          <span className="plano-cota plano-cota-izquierda" />
          <span className="plano-etiqueta plano-etiqueta-n">000°</span>
          <span className="plano-etiqueta plano-etiqueta-e">090°</span>
          <span className="plano-etiqueta plano-etiqueta-lat">33°27′ S</span>
        </div>
        <div className="plano-hilos">
          <span className="plano-hilo plano-hilo-1" />
          <span className="plano-hilo plano-hilo-2" />
          <span className="plano-hilo plano-hilo-3" />
        </div>
        <div className="plano-evento">
          <div className="plano-evento-cabecera">
            <span>Evento · {TEMA_ETIQUETA[alerta.tema]}</span>
            {alerta.es_ejemplo ? <span className="plano-evento-chip">Datos de ejemplo</span> : null}
          </div>
          <p className="plano-evento-titulo">{alerta.evento}</p>
          <div className="plano-medidor">
            <span className="plano-medidor-rotulo">Confianza</span>
            {NIVELES.map((nivel, i) => (
              <span
                key={nivel}
                className={
                  i < llenos
                    ? `plano-segmento plano-segmento-${i + 1} plano-lleno`
                    : `plano-segmento plano-segmento-${i + 1}`
                }
              >
                {mayuscula(CONFIANZA_ETIQUETA[nivel])}
              </span>
            ))}
          </div>
        </div>
        {fichas.map((ficha, i) => (
          <div key={ficha.titulo} className={`plano-ficha plano-ficha-${i + 1}`}>
            <span className="plano-check" />
            <p className="plano-ficha-titulo">{ficha.titulo}</p>
            <p className="plano-ficha-detalle">{ficha.detalle}</p>
          </div>
        ))}
        <div className="plano-lente">
          <span className="plano-lente-anillo" />
        </div>
      </div>
    </div>
  );
}
