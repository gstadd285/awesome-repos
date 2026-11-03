/**
 * Límite de solicitudes por ventana fija, en memoria (NIST CSF PR.IR-04).
 * Cada instancia del servidor cuenta por separado: es una primera barrera,
 * no un límite global. No guarda nada después de cada ventana.
 */
export type FixedWindowLimiter = {
  /** `true` si la solicitud entra en el cupo de la ventana actual. */
  tryConsume(clave?: string): boolean;
};

type Opciones = {
  limite: number;
  ventanaMs: number;
  /** Cota de claves distintas en memoria, para no crecer sin fin. */
  maxClaves?: number;
  ahora?: () => number;
};

export function createFixedWindowLimiter({
  limite,
  ventanaMs,
  maxClaves = 10_000,
  ahora = Date.now,
}: Opciones): FixedWindowLimiter {
  const ventanas = new Map<string, { inicio: number; usados: number }>();

  return {
    tryConsume(clave = "global") {
      const t = ahora();
      let ventana = ventanas.get(clave);
      if (!ventana || t - ventana.inicio >= ventanaMs) {
        if (!ventana && ventanas.size >= maxClaves) {
          for (const [k, v] of ventanas) {
            if (t - v.inicio >= ventanaMs) ventanas.delete(k);
          }
          // Si sigue lleno, se rechaza: más vale perder solicitudes que memoria.
          if (ventanas.size >= maxClaves) return false;
        }
        ventana = { inicio: t, usados: 0 };
        ventanas.set(clave, ventana);
      }
      if (ventana.usados >= limite) return false;
      ventana.usados += 1;
      return true;
    },
  };
}
