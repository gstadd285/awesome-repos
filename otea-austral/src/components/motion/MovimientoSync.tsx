"use client";

import { useLayoutEffect } from "react";

/**
 * Vuelve a escribir los atributos de movimiento en `<html>` antes del pintado. En producción ya están
 * (los puso el script de cabecera) y no cambia nada; en desarrollo, el modo estricto de React remonta la
 * raíz y borra los atributos que no conoce (guía de Next.js «preventing flash before hydration»).
 */
export function MovimientoSync() {
  useLayoutEffect(() => {
    (window as Window & { __oteaMovimiento?: { aplicar: () => void } }).__oteaMovimiento?.aplicar();
  }, []);
  return null;
}
