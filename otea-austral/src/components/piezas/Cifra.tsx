/**
 * Una columna del rodillo: veinte dígitos que terminan en el suyo (rueda una vuelta entera antes de detenerse). Como el
 * último renglón es siempre el dígito, la posición final es la misma para todas (`translate` de −19 renglones).
 */
const columna = (digito: number) =>
  Array.from({ length: 20 }, (_, i) => (digito + 1 + i) % 10).join("\n");

/**
 * Cifra de rodillo (solo conteos reales del código: niveles, fuentes, ámbitos, funciones, controles).
 *
 * El número va como texto (`.cifra-texto`, lo único que leen los lectores de pantalla) y, encima, una copia
 * `aria-hidden` en columnas de dígitos (`.cifra-rodillo`). Fuera de la puerta de movimiento el rodillo no existe
 * (`display: none`) y se ve el texto; con la puerta abierta el texto queda transparente en su sitio (mismo ancho, sin
 * saltos) y cada columna rueda hasta su dígito (la posición final la da la clase, no la animación).
 */
export function Cifra({ valor, className = "" }: { valor: number; className?: string }) {
  const texto = String(valor);
  return (
    <span className={`cifra titular relative block text-titulo leading-none text-texto cifras ${className}`}>
      <span className="cifra-texto">{texto}</span>
      <span className="cifra-rodillo" aria-hidden="true">
        {texto.split("").map((digito, i) => (
          <span key={i} className={`cifra-col whitespace-pre-line kx-i-${i}`}>
            {columna(Number(digito))}
          </span>
        ))}
      </span>
    </span>
  );
}
