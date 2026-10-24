import { CONTROLES, FUNCIONES, controlesDe } from "@/lib/security/nist-csf";

const R_FUERA = 158;
const R_DENTRO = 96;
const R_AVANCE = 88;
/** Radios de las dos líneas de texto de cada sector (nombre y código), dentro del anillo. */
const R_NOMBRE = 136;
const R_CODIGO = 114;
const HUECO = 1.2;

const xy = (grados: number, radio: number) => {
  const a = (grados * Math.PI) / 180;
  return `${(Math.cos(a) * radio).toFixed(2)},${(Math.sin(a) * radio).toFixed(2)}`;
};

/** Sector anular entre `desde` y `hasta` (grados, 0 = este, horario). */
const sector = (desde: number, hasta: number) =>
  `M${xy(desde, R_FUERA)}A${R_FUERA},${R_FUERA} 0 0 1 ${xy(hasta, R_FUERA)}L${xy(hasta, R_DENTRO)}A${R_DENTRO},${R_DENTRO} 0 0 0 ${xy(desde, R_DENTRO)}Z`;

/** Arco de `desde` a `hasta` en `radio`; al revés (antihorario) para que el texto de la mitad de abajo no quede cabeza abajo. */
const arco = (desde: number, hasta: number, radio: number, alReves = false) =>
  alReves
    ? `M${xy(hasta, radio)}A${radio},${radio} 0 0 0 ${xy(desde, radio)}`
    : `M${xy(desde, radio)}A${radio},${radio} 0 0 1 ${xy(hasta, radio)}`;

/**
 * Dial de /seguridad: las seis funciones del NIST CSF 2.0 (nombres y códigos del perfil) en un anillo. Cada sector es un
 * enlace a su bloque, con su nombre y su código escritos a lo largo del arco, y por dentro un arco de latón con la parte
 * de sus controles ya implementada (`nist-csf.ts`). Un solo SVG con sus colores como atributos.
 */
export function DialCSF() {
  const paso = 360 / FUNCIONES.length;
  return (
    <nav aria-label="Funciones del marco" className="mx-auto max-w-[440px]">
      <svg viewBox="-162 -162 324 324" className="dial">
        {FUNCIONES.map((f, k) => {
          const centro = -90 + k * paso;
          const controles = controlesDe(f.codigo);
          const hechos = controles.filter((c) => c.estado === "implementado").length;
          const desde = centro - paso / 2 + HUECO;
          const hasta = centro + paso / 2 - HUECO;
          // En la mitad de abajo el texto va por dentro del arco: la línea de arriba (el nombre) es la interior.
          const abajo = centro > 0 && centro < 180;
          const id = `dial-${f.codigo.toLowerCase()}`;
          return (
            <a key={f.codigo} href={`#funcion-${f.codigo.toLowerCase()}`} aria-label={`${f.nombre} ${f.codigo}`}>
              <g className={`kx-i-${k}`}>
                <path d={sector(desde, hasta)} fill="#F6F3ED" stroke="#C9CACC" />
                <path id={`${id}-n`} d={arco(desde, hasta, abajo ? R_CODIGO : R_NOMBRE, abajo)} fill="none" />
                <path id={`${id}-c`} d={arco(desde, hasta, abajo ? R_NOMBRE : R_CODIGO, abajo)} fill="none" />
                <path d={arco(desde, hasta, R_AVANCE)} fill="none" stroke="#DBDBDA" strokeWidth="3" />
                {hechos ? (
                  <path
                    d={arco(desde, desde + ((hasta - desde) * hechos) / controles.length, R_AVANCE)}
                    pathLength="1"
                    className="pz-trazo"
                    fill="none"
                    stroke="#7A5E33"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                ) : null}
                <text textAnchor="middle" dominantBaseline="middle" aria-hidden="true">
                  <textPath href={`#${id}-n`} startOffset="50%" className="micro" fill="#0F1B2D">
                    {f.nombre}
                  </textPath>
                </text>
                <text textAnchor="middle" dominantBaseline="middle" aria-hidden="true">
                  <textPath href={`#${id}-c`} startOffset="50%" className="contador" fill="#7A5E33">
                    {f.codigo}
                  </textPath>
                </text>
              </g>
            </a>
          );
        })}
        <g aria-hidden="true" textAnchor="middle">
          <text y="-2" className="titular" fontSize="24" fill="#0F1B2D">
            CSF 2.0
          </text>
          <text y="20" className="font-mono" fontSize="9.5" letterSpacing="0.6" fill="#4C5665">
            {`NIST · ${CONTROLES.length} CONTROLES`}
          </text>
        </g>
      </svg>
      <p className="contador mt-3 text-center text-apoyo">Arco de latón: controles implementados</p>
    </nav>
  );
}
