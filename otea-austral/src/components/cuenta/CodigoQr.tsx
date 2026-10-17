/**
 * Código QR como un SVG de un solo trazo (lo arma `@/lib/cuentas/qr`, sin librerías ni servicios externos). Fondo blanco
 * y módulos negros: es lo que mejor leen las cámaras. No es decorativo: es una de las dos formas de entregar el secreto
 * a la app de autenticación (la otra es escribirlo), así que lleva nombre accesible. Los colores van como atributos del SVG
 * (no como clases: la paleta de Tailwind del sitio está reiniciada y `fill-white` no existe; sin ellos todo sale negro).
 */
export function CodigoQr({ ruta, lado, etiqueta }: { ruta: string; lado: number; etiqueta: string }) {
  return (
    <svg
      role="img"
      aria-label={etiqueta}
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      className="h-auto w-full max-w-[220px] rounded-badge linea-fina"
    >
      <rect width={lado} height={lado} fill="#FFFFFF" />
      <path d={ruta} fill="#000000" />
    </svg>
  );
}
