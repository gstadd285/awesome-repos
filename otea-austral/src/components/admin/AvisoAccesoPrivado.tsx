/**
 * Aviso del panel sobre quién ve una alerta real publicada (acceso privado, `docs/alertas-reales.md` §6). Desde F4,
 * /alertas muestra lo real **solo con sesión de cuenta**; sin sesión, ejemplos. Lo que cambia es quién puede tener
 * sesión, según `CUENTAS_MODO`: el aviso lo dice antes de publicar. No bloquea nada: la publicación sigue igual.
 */
type Modo = "cerradas" | "memoria" | "abiertas" | "invitacion";

const TEXTOS: Record<"invitacion" | "abiertas" | "cerradas", { titulo: string; detalle: string }> = {
  invitacion: {
    titulo: "Acceso privado por invitación: lo real publicado solo lo ven las cuentas con sesión.",
    detalle:
      "Sin sesión, /alertas muestra solo ejemplos. Las cuentas se crean con los códigos de Invitaciones. Los textos legales siguen en revisión.",
  },
  abiertas: {
    titulo: "Cuentas abiertas: cualquiera que cree una cuenta ve lo real publicado.",
    detalle: "Sin sesión, /alertas muestra solo ejemplos. Para el lanzamiento privado, las cuentas van en CUENTAS_MODO=invitacion.",
  },
  cerradas: {
    titulo: "Cuentas cerradas: una alerta real publicada no la verá nadie todavía.",
    detalle:
      "/alertas muestra lo real solo con sesión de cuenta, y hoy nadie puede tener una. Para el lanzamiento privado, CUENTAS_MODO=invitacion.",
  },
};

export function AvisoAccesoPrivado({ modo, className = "" }: { modo: Modo; className?: string }) {
  const texto = TEXTOS[modo === "memoria" ? "abiertas" : modo];
  return (
    <div role="note" aria-label="Quién ve las alertas reales" className={`rounded-badge bg-fondo p-3 text-sm text-texto linea-fina ${className}`}>
      <p className="font-semibold">{texto.titulo}</p>
      <p className="mt-1 leading-relaxed text-texto-suave">{texto.detalle}</p>
    </div>
  );
}
