/** Ocho pulsos de luz: el k-ésimo viene del sol y llega al grupo k de láminas (clases `pulso-0…7`). */
const PULSOS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Horizonte vivo del héroe: el emblema hecho escena sin tocar el logo. Un cielo que se entibia con un sol de latón
 * (un disco sin anillo: no es el emblema) cortado por la línea de horizonte, el filete de latón a sangre con su punto
 * incandescente, un suelo en perspectiva con el reflejo del sol y los pulsos que cruzan del horizonte al mercado, y
 * un grano de película estático. Todo decorativo (`aria-hidden`) y sin recibir clics.
 *
 * Sus piezas son elementos de la propia cuadrícula de `.h-hero` (`display: contents`) y se apoyan en los altos conocidos
 * del H1: la línea cae siempre entre las dos cajas, a cualquier ancho. Sin movimiento (reducido o sin JS) es el fotograma
 * final: sol arriba y sin pulsos. La entrada y el bucle de los pulsos viven en `globals.css`, dentro de la puerta; el
 * contenedor de los pulsos lleva `data-bucle` para que `DirectorEscena` los pause fuera de vista.
 */
export function Horizonte() {
  return (
    <div className="horizonte" aria-hidden="true">
      <div className="h-cielo">
        <div className="sol-halo" />
        <div className="sol-paralaje">
          <div className="sol" />
        </div>
      </div>
      <div className="h-suelo">
        <div className="h-reflejo" />
        <div className="h-reticula" />
        <div className="h-pulsos" data-bucle>
          {PULSOS.map((k) => (
            <span key={k} className={`pulso pulso-${k}`} />
          ))}
        </div>
      </div>
      <div className="h-horizonte" />
      <div className="h-grano" />
    </div>
  );
}
