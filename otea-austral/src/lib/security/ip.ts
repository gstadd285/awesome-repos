/**
 * IP del cliente para los límites de solicitudes (nunca se guarda ni se
 * registra). Cada proxy de confianza agrega una entrada al final de
 * `X-Forwarded-For`; lo anterior lo puede escribir cualquiera, así que se
 * toma la entrada que dejó el último proxy de confianza.
 */
export function ipCliente(cabeceras: Headers, proxiesConfiables: number): string {
  const reenviada = cabeceras.get("x-forwarded-for");
  if (reenviada && proxiesConfiables > 0) {
    const partes = reenviada
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const ip = partes[partes.length - proxiesConfiables];
    if (ip) return ip;
  }
  return cabeceras.get("x-real-ip")?.trim() || "desconocida";
}
