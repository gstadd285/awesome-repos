/**
 * Aviso del panel mientras no exista el acceso privado (fase F4, `docs/alertas-reales.md` D8): hoy `/alertas` muestra en
 * público todo lo publicado, así que una alerta real no debe publicarse todavía. La publicación sigue igual; esto avisa.
 */
export function AvisoSinAccesoPrivado({ className = "" }: { className?: string }) {
  return (
    <div role="note" aria-label="Sin acceso privado" className={`rounded-badge bg-fondo p-3 text-sm text-texto linea-fina ${className}`}>
      <p className="font-semibold">Sin acceso privado, no publiques alertas reales.</p>
      <p className="mt-1 leading-relaxed text-texto-suave">
        Hasta la fase F4 (acceso por invitación), todo lo publicado se ve en /alertas sin iniciar sesión. Las alertas que
        salen de la cola nacen como borrador y no son de ejemplo: déjalas en borrador o en revisión.
      </p>
    </div>
  );
}
