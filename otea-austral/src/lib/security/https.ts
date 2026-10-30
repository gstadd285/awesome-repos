/**
 * HTTPS forzado dentro de la aplicación (defensa en profundidad). Cloud Run termina TLS y avisa con
 * `X-Forwarded-Proto` cómo llegó la solicitud; si llegó por http, se responde 308 al mismo camino en el
 * dominio configurado (`NEXT_PUBLIC_SITE_URL`, https en producción). HSTS cubre las visitas siguientes; esta
 * redirección cubre la primera.
 *
 * El destino sale del dominio configurado y no del encabezado `Host`, y la ruta se asigna como `pathname`:
 * una ruta como `//otro.example` no puede cambiar de dominio (redirección abierta).
 *
 * Sin la cabecera (la sonda de Cloud Run, las pruebas locales) no se redirige nunca.
 */
export function destinoHttps({
  reenviado,
  ruta,
  busqueda,
  sitio,
  produccion,
}: {
  /** Valor de `X-Forwarded-Proto`; con varios proxies manda el último (el de confianza). */
  reenviado: string | null;
  ruta: string;
  busqueda: string;
  sitio: string;
  produccion: boolean;
}): string | null {
  if (!produccion || !sitio.startsWith("https://")) return null;
  const protocolo = reenviado?.split(",").at(-1)?.trim().toLowerCase();
  if (protocolo !== "http") return null;
  const destino = new URL(sitio);
  destino.pathname = ruta;
  destino.search = busqueda;
  destino.hash = "";
  return destino.href;
}
