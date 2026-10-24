import type { TipoFuente } from "@/lib/domain/respaldo";

/**
 * Lugares de las estrellas respecto del pie de cada constelación en el horizonte: una figura distinta por ámbito (se
 * usan las primeras n, en este orden, que es también el del trazo). Si un ámbito tuviera más, siguen en `EXTRA`.
 */
const FIGURAS: readonly (readonly (readonly [number, number])[])[] = [
  [[-50, -38], [-24, -94], [4, -62], [28, -120], [52, -76]],
  [[-52, -82], [-30, -128], [-2, -96], [24, -112], [48, -48]],
  [[-56, -50], [-36, -94], [-8, -76], [12, -132], [40, -114], [58, -64], [26, -34]],
];
const EXTRA: readonly (readonly [number, number])[] = [[-20, -150], [0, -24], [54, -140], [-58, -128]];
const HORIZONTE = 184;
const ANCHO = 400;

export type GrupoConstelacion = { titulo: string; fuentes: { id: string; tipo: TipoFuente }[] };

/** El tipo de la fuente va en el relleno: tinta (primaria), latón (secundaria) o un anillo (prensa). */
const TIPOS: { tipo: TipoFuente; nombre: string; fill: string; stroke?: string }[] = [
  { tipo: "primaria", nombre: "Primaria", fill: "#0F1B2D" },
  { tipo: "secundaria", nombre: "Secundaria", fill: "#B08D57" },
  { tipo: "prensa", nombre: "Prensa", fill: "#FCFAF6", stroke: "#0F1B2D" },
];
const ESTILO = Object.fromEntries(TIPOS.map((t) => [t.tipo, t])) as Record<TipoFuente, (typeof TIPOS)[number]>;

/**
 * Constelación de /fuentes: un punto por fuente activa del registro, agrupado por ámbito sobre el horizonte, con el tipo
 * en el relleno. Datos reales de `fuentesPorAmbito()`; la leyenda cuenta cada tipo. Decorativa: las mismas fuentes están
 * en las tablas.
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
          const lugares = [...FIGURAS[k % FIGURAS.length], ...EXTRA];
          const puntos = g.fuentes.slice(0, lugares.length).map((f, i) => ({ f, x: cx + lugares[i][0], y: HORIZONTE + lugares[i][1] }));
          return (
            <g key={g.titulo}>
              <path
                d={puntos.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("")}
                pathLength="1"
                className="pz-trazo"
                fill="none"
                stroke="#B08D57"
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
              <text x={cx} y={HORIZONTE + 24}>{`${g.titulo} · ${g.fuentes.length}`.toUpperCase()}</text>
            </g>
          );
        })}
        <path d={`M6,${HORIZONTE}H${ANCHO - 6}`} pathLength="1" className="pz-trazo" stroke="#B08D57" strokeWidth="1.5" />
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
