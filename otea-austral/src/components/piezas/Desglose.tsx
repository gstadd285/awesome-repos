/** Una fila del desglose: el concepto y su cifra tal como se publica en el cuerpo de la página (estimada). */
export type FilaDesglose = { concepto: string; cifra: string };

const PRIMERA = 104;
const PASO = 38;

/**
 * Desglose de /apoyar: lo que cuesta sostener el sitio como una libreta de cuentas bajo el horizonte (un sol de latón a
 * medio salir: **no** es el emblema; con la puerta, el horizonte se traza). Cada concepto con su cifra y un filete punteado;
 * sin barras, ejes ni metas, así que no se lee como un gráfico ni como un avance hacia un objetivo. Las cifras llegan de la
 * página (las mismas del texto) y se rotulan como estimadas. Decorativo: todo está también en el cuerpo.
 */
export function Desglose({ filas }: { filas: FilaDesglose[] }) {
  const alto = PRIMERA + filas.length * PASO + 22;
  return (
    <svg viewBox={`0 0 400 ${alto}`} className="pz mx-auto max-w-[460px]" aria-hidden="true">
      <text x="8" y="22" className="font-mono" fontSize="11" letterSpacing="1" fill="#4C5665">
        LO QUE CUESTA SOSTENERLO
      </text>
      <path d="M306,62a24,24 0 0 1 48,0z" fill="#B08D57" />
      <path d="M8,62H392" pathLength="1" className="pz-trazo" fill="none" stroke="#B08D57" strokeWidth="1.5" />
      {filas.map((f, i) => {
        const y = PRIMERA + i * PASO;
        return (
          <g key={f.concepto}>
            <text x="8" y={y} className="font-serif" fontSize="16" fill="#0F1B2D">
              {f.concepto}
            </text>
            <text x="392" y={y} textAnchor="end" className="font-mono" fontSize="12" fill="#7A5E33">
              {f.cifra}
            </text>
            <path d={`M8,${y + 14}H392`} fill="none" stroke="#CDCED0" strokeDasharray="2 4" />
          </g>
        );
      })}
      <text x="8" y={alto - 6} className="font-mono" fontSize="11" letterSpacing="1" fill="#4C5665">
        CIFRAS ESTIMADAS · EN DÓLARES
      </text>
    </svg>
  );
}
