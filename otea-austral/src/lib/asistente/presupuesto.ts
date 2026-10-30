/**
 * Tope de gasto diario del asistente. La plata se mide en «micros» (millonésimas de dólar) y cada llamada reserva el
 * peor caso antes de llamar al modelo y se ajusta al terminar: ver `@/lib/ia/gasto`.
 */
import { hoyEnChile } from "@/lib/format";
import type { Presupuesto, Topes } from "@/lib/ia/gasto";

// Lo común del gasto (precios, micros, reserva del peor caso) vive en `@/lib/ia/gasto`, compartido con los borradores.
export {
  costoEnMicros,
  costoMaximoEnMicros,
  dolaresAMicros,
  estimarTokens,
  microsADolares,
  type Precios,
  type Presupuesto,
  type Topes,
} from "@/lib/ia/gasto";

/**
 * Presupuesto en memoria: vale por instancia y se pierde al reiniciarla. Solo para desarrollo y pruebas; en
 * producción el modo `ia` exige la base (`presupuesto-postgres.ts`), que comparten todas las instancias.
 */
export function crearPresupuestoMemoria(topes: Topes, ahora: () => Date = () => new Date()): Presupuesto {
  let dia = "";
  let micros = 0;
  let llamadas = 0;
  const alDia = () => {
    const hoy = hoyEnChile(ahora());
    if (hoy !== dia) {
      dia = hoy;
      micros = 0;
      llamadas = 0;
    }
  };
  return {
    async reservar(pedido) {
      alDia();
      if (!Number.isFinite(pedido) || pedido < 0 || llamadas >= topes.llamadas || micros + pedido > topes.micros) {
        return false;
      }
      llamadas += 1;
      micros += pedido;
      return true;
    },
    async ajustar(reservado, real) {
      alDia();
      micros = Math.max(0, micros + (real - reservado));
    },
  };
}
