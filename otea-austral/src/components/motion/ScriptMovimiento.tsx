import { codigoMotor, OPCIONES_SITIO } from "@/lib/movimiento/motor";

/**
 * Script de cabecera del motor de movimiento (`src/lib/movimiento/motor.ts`). Va en línea y sin diferir
 * porque debe escribir `data-movimiento` en `<html>` antes del primer pintado: si esperara a la hidratación,
 * la página se vería quieta y, un instante después, saltaría al diseño animado (ver la guía de Next.js
 * «preventing flash before hydration»). Lleva el nonce de la solicitud, así que la CSP estricta lo admite.
 */
export function ScriptMovimiento({ nonce }: { nonce?: string }) {
  return (
    <script
      nonce={nonce}
      // Segunda y última excepción a react/no-danger (la otra es el JSON-LD de la portada): el código es una
      // constante de la compilación, sin datos de la solicitud ni de personas. El nonce va como atributo.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: codigoMotor(OPCIONES_SITIO) }}
    />
  );
}
