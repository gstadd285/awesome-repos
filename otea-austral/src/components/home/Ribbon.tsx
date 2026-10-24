/**
 * La cinta como «mercado»: 24 láminas de pie sobre el suelo del horizonte, agrupadas por estado (gana →
 * condicionado → pierde, con tinta y bruma como separadores). Cada lámina tiene una clase fija `lamina-N` con su
 * posición, profundidad, giro (entre 32° y 68°: nunca de canto, así que no hay astillas) y altura, y se pone de pie
 * cuando le llega su pulso (entrada en `globals.css`, dentro de la puerta). Cuatro rótulos de temas se anclan con
 * guías de 1 px. Pieza decorativa: los rótulos son temas, no datos.
 */
type Color = "gana" | "condicionado" | "pierde" | "tinta" | "bruma";

const g: Color = "gana";
const c: Color = "condicionado";
const p: Color = "pierde";
const t: Color = "tinta";
const b: Color = "bruma";

/** Tres láminas por grupo (el grupo k recibe el pulso k): gana, condicionado y pierde, con separadores. */
const LAMINAS: Color[] = [g, g, b, g, g, g, g, t, c, c, b, c, c, c, c, t, p, p, b, p, p, p, t, p];

// Cada rótulo va anclado a una lámina (misma profundidad, sin giro) y entra con su pulso.
const ROTULOS = [
  { texto: "ORMUZ", clase: "rotulo-0" },
  { texto: "COBRE", clase: "rotulo-1" },
  { texto: "CHIPS", clase: "rotulo-2" },
  { texto: "TASAS", clase: "rotulo-3" },
];

export function Ribbon({ className = "" }: { className?: string }) {
  return (
    <div className={`cinta ${className}`} aria-hidden="true">
      <div className="cinta-pista">
        {LAMINAS.map((color, i) => (
          <span key={i} className={`lamina lamina-${i} lamina-${color}`} />
        ))}
        {ROTULOS.map((r) => (
          <span key={r.texto} className={`cinta-rotulo ${r.clase}`}>
            <span>{r.texto}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
