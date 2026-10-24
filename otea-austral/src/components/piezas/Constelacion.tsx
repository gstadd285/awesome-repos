import type { TipoFuente } from "@/lib/domain/respaldo";

const ANCHO = 400;
/** Centro de cada ámbito y radio al que quedan sus fuentes: todas a la misma distancia, repartidas por igual. */
const CENTRO_Y = 98;
const RADIO = 50;

export type GrupoConstelacion = { titulo: string; fuentes: { id: string; tipo: TipoFuente }[] };

/** El tipo de la fuente va en el relleno: tinta (primaria), latón (secundaria) o un anillo (prensa). */
const TIPOS: { tipo: TipoFuente; nombre: string; fill: string; stroke?: string }[] = [
  { tipo: "primaria", nombre: "Primaria", fill: "#0F1B2D" },
  { tipo: "secundaria", nombre: "Secundaria", fill: "#B08D57" },
  { tipo: "prensa", nombre: "Prensa", fill: "#FCFAF6", stroke: "#0F1B2D" },
];
const ESTILO = Object.fromEntries(TIPOS.map((t) => [t.tipo, t])) as Record<TipoFuente, (typeof TIPOS)[number]>;

/**
 * Constelación de /fuentes: el registro como red. Cada ámbito es un nudo (rombo de latón) y cada fuente activa, un punto
 * unido a su ámbito por un vínculo; el tipo va en el relleno. Las fuentes de un ámbito quedan a la misma distancia y
 * repartidas por igual en un círculo: ni la altura ni el orden significan nada, así que no hay eje ni serie que se lea
 * como una cotización. Datos reales de `fuentesPorAmbito()`; la leyenda cuenta cada tipo. Decorativa: las mismas fuentes
 * están en las tablas.
 */
export function Constelacion({ grupos }: { grupos: GrupoConstelacion[] }) {
  const paso = ANCHO / grupos.length;
  let n = 0;
  const conteo = (tipo: TipoFuente) => grupos.reduce((t, g) => t + g.fuentes.filter((f) => f.tipo === tipo).length, 0);
  return (
    <svg viewBox={`0 0 ${ANCHO} 248`} className="pz mx-auto max-w-[460px]" aria-hidden="true">
      <g className="font-mono" fontSize="12" letterSpacing="0.6" fill="#4C5665" textAnchor="middle">
        {grupos.map((g, k) => {
          const cx = paso * (k + 0.5);
          const puntos = g.fuentes.map((f, i) => {
            const a = ((i / g.fuentes.length) * 2 - 0.5) * Math.PI;
            return { f, x: +(cx + Math.cos(a) * RADIO).toFixed(2), y: +(CENTRO_Y + Math.sin(a) * RADIO).toFixed(2) };
          });
          return (
            <g key={g.titulo}>
              {puntos.map((p) => (
                <path
                  key={p.f.id}
                  d={`M${cx},${CENTRO_Y}L${p.x},${p.y}`}
                  pathLength="1"
                  className="pz-trazo vinculo"
                  fill="none"
                  stroke="#B08D57"
                />
              ))}
              <path
                d={`M${cx},${CENTRO_Y - 7}l7,7-7,7-7-7z`}
                className="ambito"
                fill="#FCFAF6"
                stroke="#B08D57"
                strokeWidth="1.5"
              />
              {puntos.map((p) => (
                <circle
                  key={p.f.id}
                  cx={p.x}
                  cy={p.y}
                  r="5"
                  className={`estrella kx-i-${n++}`}
                  fill={ESTILO[p.f.tipo].fill}
                  stroke={ESTILO[p.f.tipo].stroke}
                  strokeWidth="1.5"
                />
              ))}
              <text x={cx} y={CENTRO_Y + RADIO + 38}>{`${g.titulo} · ${g.fuentes.length}`.toUpperCase()}</text>
            </g>
          );
        })}
        {TIPOS.map((t, i) => (
          <g key={t.tipo} transform={`translate(${ANCHO / 2 + (i - 1) * 128} 238)`}>
            <circle cx="-55" cy="-4" r="4.5" fill={t.fill} stroke={t.stroke} strokeWidth="1.5" />
            <text x="-45" textAnchor="start">{`${t.nombre} · ${conteo(t.tipo)}`.toUpperCase()}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
