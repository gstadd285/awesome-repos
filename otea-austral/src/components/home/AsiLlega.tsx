import type { ReactNode } from "react";
import { Emblem } from "@/components/brand/Emblem";
import { vistaEjemplo, vistasPortada } from "@/data/ejemplo";
import { formatearDiaMes, formatearHora } from "@/lib/format";

/** Una notificación como llegaría al teléfono: el emblema como ícono de la app, la hora, el título y una línea. */
function Notif({ lado, hora, titulo, children }: { lado: "atras" | "frente"; hora: string; titulo: string; children: ReactNode }) {
  return (
    <div className={`notif notif-${lado}`}>
      <p className="flex items-center gap-2 text-xs text-apoyo">
        <span className="grid size-[22px] place-items-center rounded-badge bg-ink">
          <Emblem variant="dark" className="w-[18px]" />
        </span>
        <span className="micro text-texto">Otea Austral</span>
        <span className="notif-hora ml-auto text-right">{hora}</span>
      </p>
      <p className="mt-1.5 font-semibold text-texto">{titulo}</p>
      <p className={lado === "atras" ? "truncate" : undefined}>{children} Datos de ejemplo.</p>
    </div>
  );
}

/**
 * «Así llega»: dos notificaciones de ejemplo apiladas, como llegarían al teléfono (decorativas, `aria-hidden`). Atrás,
 * la alerta de Ormuz con la hora real del dato (su última línea queda bajo la de delante); delante, el resumen
 * pre-apertura, cuya hora es una meta («objetivo»).
 */
export function AsiLlega() {
  const ormuz = vistaEjemplo("ejemplo-ormuz");
  const fecha = vistasPortada.map((v) => v.fecha).sort().at(-1)!;
  const fila = ormuz.filas[0];
  return (
    <div className="bandeja mt-8 max-w-[440px]" aria-hidden="true">
      <p className="micro flex items-center gap-2.5 text-texto">
        Así llega{" "}
        <span className="rounded-badge px-2 py-0.5 tracking-normal text-texto-suave normal-case linea-fina">
          Datos de ejemplo
        </span>
      </p>
      <div className="bandeja-pila escena mt-3.5 grid grid-cols-1">
        <Notif lado="atras" hora={`${formatearDiaMes(ormuz.fecha)}, ${formatearHora(ormuz.fecha)}`} titulo={`Nueva alerta · ${ormuz.evento}`}>
          {fila.sector}: {fila.condicion.charAt(0).toLowerCase() + fila.condicion.slice(1)}.
        </Notif>
        <Notif lado="frente" hora="Antes de la apertura (objetivo)" titulo={`Pre-apertura · Resumen del ${formatearDiaMes(fecha)}`}>
          {vistasPortada.length} alertas en tus temas y qué condición mirar en la jornada.
        </Notif>
      </div>
    </div>
  );
}
