import { Emblem } from "@/components/brand/Emblem";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «2026-10-borrador-3» → «octubre de 2026»: la fecha que la propia versión del texto declara (o nada si no la trae). */
export function fechaDeVersion(version: string): string | undefined {
  const m = /^(\d{4})-(\d{2})\b/.exec(version);
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && mes ? `${mes} de ${m[1]}` : undefined;
}

/**
 * Sello en relieve de los textos legales: el emblema en tinta al 8 % (la geometría intacta; solo cambian sus colores) con
 * su sombra de 1 px, y en el anillo el nombre del documento, su versión y su fecha reales (`VERSION_CONSENTIMIENTO`).
 * Sin versión (aviso legal) dice solo que el texto es provisional. Decorativo: la versión también se lee al pie.
 */
export function Sello({ documento, version }: { documento: string; version?: string }) {
  const fecha = version ? fechaDeVersion(version) : undefined;
  const partes = [documento, version ? `Versión ${version}` : "Texto provisional", fecha, "Otea Austral"].filter(Boolean);
  const anillo = `${partes.join(" · ")} · `.toUpperCase();
  return (
    <figure className="grid place-items-center gap-4 text-center">
      <svg viewBox="-100 -100 200 200" className="w-full max-w-xs" aria-hidden="true">
        <defs>
          <path id="sello-texto" d="M0,-80a80,80 0 1,1 0,160a80,80 0 1,1 0,-160" />
        </defs>
        <circle r="96" pathLength="1" className="pz-trazo" fill="none" stroke="#CDCED0" />
        <circle r="66" pathLength="1" className="pz-trazo" fill="none" stroke="#CDCED0" />
        <text className="font-mono" fontSize="9.4" fill="#4C5665">
          <textPath href="#sello-texto" textLength="497" lengthAdjust="spacing">
            {anillo}
          </textPath>
        </text>
        {/* El relieve: la sombra 1 px abajo a la derecha y el emblema en tinta al 8 % encima. */}
        <Emblem variant="relieve-sombra" x={-63} y={-44} width={128} />
        <Emblem variant="relieve" x={-64} y={-45.5} width={128} />
      </svg>
      <figcaption className="contador text-apoyo">
        {version ? (
          <>
            Versión {version}
            {fecha ? ` · ${fecha}` : null}
          </>
        ) : (
          "Texto provisional"
        )}
      </figcaption>
    </figure>
  );
}
