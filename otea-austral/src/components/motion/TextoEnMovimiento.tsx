import { Fragment } from "react";

/**
 * Tope de unidades (letras o palabras) con índice propio. Coincide con las clases `kx-i-0 … kx-i-79`
 * de `globals.css`; pasado el tope, el índice se satura (solo se pierde el escalonado).
 */
export const MAX_INDICE = 79;

// Clases completas y literales: `motion.test.ts` comprueba que cada una existe en el CSS.
const EFECTOS = { letras: "kx-letras", palabras: "kx-palabras", lectura: "kx-lectura" } as const;
const DISPAROS = { carga: "kx-carga", scroll: "kx-scroll" } as const;

export type EfectoTexto = keyof typeof EFECTOS;
export type DisparoTexto = keyof typeof DISPAROS;

type TextoEnMovimientoProps = {
  texto: string;
  /**
   * `letras`: cada letra sube desde una máscara (solo titulares H1: partir en letras pierde el kerning).
   * `palabras`: cada palabra sube desde una máscara. `lectura`: cada palabra pasa de tenue a plena.
   */
  efecto: EfectoTexto;
  /** `carga`: al cargar la página. `scroll`: al bajar, ligado al scroll y reversible. */
  disparo: DisparoTexto;
  como?: "h1" | "h2" | "h3" | "p" | "span";
  id?: string;
  className?: string;
};

/**
 * Texto que aparece en movimiento, solo con CSS (ver «Texto en movimiento» en `globals.css`).
 *
 * El texto se emite dos veces: una copia visible solo para lectores de pantalla (`sr-only`) y otra
 * decorativa y partida (`aria-hidden`), así que el nombre accesible del titular no cambia. La CSP
 * prohíbe `style` en el HTML: el índice de cada unidad va en una clase `kx-i-N`.
 * Sin movimiento (reducido, sin soporte de animaciones ligadas al scroll, impresión) el texto se ve completo.
 */
export function TextoEnMovimiento({
  texto,
  efecto,
  disparo,
  como: Etiqueta = "p",
  id,
  className = "",
}: TextoEnMovimientoProps) {
  const palabras = texto.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  let n = 0;
  const indice = () => `kx-i-${Math.min(n++, MAX_INDICE)}`;

  return (
    <Etiqueta id={id} className={`kx ${EFECTOS[efecto]} ${DISPAROS[disparo]} ${className}`.trim()}>
      <span className="sr-only">{texto}</span>
      <span aria-hidden="true" className="kx-visual">
        {palabras.map((palabra, i) => (
          <Fragment key={`${i}-${palabra}`}>
            {i > 0 ? " " : null}
            {efecto === "lectura" ? (
              <span className={`kx-w ${indice()}`}>{palabra}</span>
            ) : (
              <span className="kx-m">
                {efecto === "letras" ? (
                  Array.from(palabra).map((letra, j) => (
                    <span key={j} className={`kx-l ${indice()}`}>
                      {letra}
                    </span>
                  ))
                ) : (
                  <span className={`kx-p ${indice()}`}>{palabra}</span>
                )}
              </span>
            )}
          </Fragment>
        ))}
      </span>
    </Etiqueta>
  );
}
