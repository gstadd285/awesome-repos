const ZONA_CHILE = "America/Santiago";

const dia = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ZONA_CHILE,
});

const diaUtc = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const diaHora = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_CHILE,
});

/** `AAAA-MM-DD` → "8 oct 2026". Fecha de calendario: no depende de la zona. */
export function formatearFecha(fecha: string): string {
  return diaUtc.format(new Date(`${fecha}T00:00:00Z`));
}

/** Instante ISO → día en hora de Chile. */
export function formatearDia(instante: string): string {
  return dia.format(new Date(instante));
}

/** Instante ISO → día y hora en hora de Chile. */
export function formatearFechaHora(instante: string): string {
  return diaHora.format(new Date(instante));
}
