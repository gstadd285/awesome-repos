/** Radio de los anillos del radar, en unidades del dibujo (el centro, en el horizonte, es el origen). */
const ANILLOS = [44, 88, 132] as const;
const R = ANILLOS[ANILLOS.length - 1];

/** Punto a `grados` (0 = este, negativo = sobre el horizonte) y `radio` del centro. */
const punto = (grados: number, radio: number) => {
  const a = (grados * Math.PI) / 180;
  return `${(Math.cos(a) * radio).toFixed(1)},${(Math.sin(a) * radio).toFixed(1)}`;
};

/**
 * «Radar que otea» (/alertas): un sol de latón en el horizonte y un barrido que da tres vueltas y se detiene sobre el
 * cielo (solo con movimiento; quieto, ya está en su sitio, a −58°). No dibuja ecos que no existen. Decorativo.
 */
export function Radar({ rotulo }: { rotulo: string }) {
  return (
    <svg viewBox="-200 -172 400 222" className="pz mx-auto max-w-[460px]" aria-hidden="true">
      <defs>
        <clipPath id="radar-cielo">
          <rect x="-200" y="-172" width="400" height="172" />
        </clipPath>
        <linearGradient id="radar-haz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B08D57" stopOpacity="0" />
          <stop offset="1" stopColor="#B08D57" stopOpacity="0.42" />
        </linearGradient>
      </defs>
      <g clipPath="url(#radar-cielo)" fill="none">
        {ANILLOS.map((r) => (
          <circle key={r} r={r} pathLength="1" className="pz-trazo" stroke="#A8ACB2" />
        ))}
        {[-150, -120, -90, -60, -30].map((g) => (
          <path key={g} d={`M${punto(g, 18)}L${punto(g, R + 10)}`} stroke="#CDCED0" strokeDasharray="2 4" />
        ))}
        <g className="radar-barrido" transform="rotate(-58)">
          <path d={`M0,0L${punto(-34, R)}A${R},${R} 0 0 1 ${punto(0, R)}Z`} fill="url(#radar-haz)" />
          <path d={`M0,0L${punto(0, R)}`} stroke="#7A5E33" strokeWidth="1.5" />
        </g>
        <circle r="9" fill="#B08D57" />
      </g>
      <path d="M-192,0H192" pathLength="1" className="pz-trazo" stroke="#B08D57" strokeWidth="1.5" />
      <text y="36" textAnchor="middle" className="font-mono" fontSize="11" letterSpacing="1" fill="#4C5665">
        {rotulo.toUpperCase()}
      </text>
    </svg>
  );
}
