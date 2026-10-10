/**
 * Cinta 3D de láminas en los colores de Otea (estado y marca). Es una pieza
 * decorativa: las láminas ondean con CSS (`otea-ola` en globals.css) y los
 * rótulos son temas, no datos.
 */
const COLORES = ["pierde", "condicionado", "tinta", "gana", "bruma"] as const;
const SECUENCIA = [0, 0, 1, 2, 2, 3, 4, 0, 1, 1, 2, 3, 3, 4, 0, 0, 1, 2];
const LAMINAS = Array.from({ length: 36 }, (_, i) => COLORES[SECUENCIA[i % SECUENCIA.length]]);

// Posiciones fijas (clases completas para que Tailwind las detecte).
const ROTULOS = [
  { texto: "COBRE", pos: "left-[9%] top-[6%]" },
  { texto: "ORMUZ", pos: "left-[27%] top-[88%]" },
  { texto: "USD/CLP", pos: "left-[71%] top-[4%]" },
  { texto: "ARANCELES", pos: "left-[84%] top-[80%]" },
  { texto: "CHIPS", pos: "left-[50%] top-[1%]" },
  { texto: "TASAS", pos: "left-[4%] top-[74%]" },
  { texto: "LITIO", pos: "left-[38%] top-[10%]" },
  { texto: "FLETES", pos: "left-[62%] top-[92%]" },
  { texto: "BRENT", pos: "left-[90%] top-[22%]" },
  { texto: "FED", pos: "left-[17%] top-[40%]" },
  { texto: "OPEP", pos: "left-[78%] top-[52%]" },
  { texto: "YUAN", pos: "left-[45%] top-[84%]" },
];

export function Ribbon({ className = "" }: { className?: string }) {
  return (
    <div className={`cinta ${className}`} aria-hidden="true">
      <div className="cinta-pista">
        {LAMINAS.map((color, i) => (
          <span key={i} className={`cinta-lamina cinta-lamina-${color}`} />
        ))}
      </div>
      <div>
        {ROTULOS.map((r) => (
          <span key={r.texto} className={`cinta-chip ${r.pos}`}>
            {r.texto}
          </span>
        ))}
      </div>
    </div>
  );
}
