import { buttonClasses } from "@/components/ui/button";

/**
 * Controles del motor de movimiento (`src/lib/movimiento/motor.ts`). El motor cablea los botones con el
 * atributo `data-mov-conmutar` y decide cuándo se ven (CSS: `.aviso-mov` y `.mov-conmutador`).
 */

/**
 * Aviso de la portada para quien tiene «reducir movimiento» en su sistema: explica por qué ve todo quieto
 * y deja activar las animaciones. Solo aparece en ese caso.
 */
export function AvisoMovimiento() {
  return (
    <div className="aviso-mov mt-5 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-texto-suave">
      <p>Tu dispositivo pide menos movimiento, así que la portada se ve sin animaciones.</p>
      <button type="button" data-mov-conmutar className={buttonClasses("outline", "", "sm")}>
        Ver con animaciones
      </button>
    </div>
  );
}

/**
 * Conmutador del pie: quien tiene «reducir movimiento» (o ya eligió) puede activarlo o desactivarlo.
 * Es un botón de dos estados (`aria-pressed`); el motor actualiza el atributo al cargar y al pulsarlo.
 */
export function ConmutadorMovimiento() {
  return (
    <button
      type="button"
      data-mov-conmutar
      aria-pressed="false"
      // El motor corrige `aria-pressed` antes de hidratar (el servidor no sabe qué modo hay).
      suppressHydrationWarning
      className="mov-conmutador group items-center gap-2 rounded-pill px-3 py-1.5 text-sm text-texto-suave linea-fina transition-colors hover:bg-papel-alto hover:text-texto"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-mist group-aria-pressed:bg-acento" />
      Animaciones
      <span aria-hidden="true" className="text-apoyo">
        <span className="hidden group-aria-pressed:inline">activadas</span>
        <span className="group-aria-pressed:hidden">reducidas</span>
      </span>
    </button>
  );
}
