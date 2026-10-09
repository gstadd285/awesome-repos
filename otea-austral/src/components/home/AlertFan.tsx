import { AlertCard } from "@/components/alert-card/AlertCard";
import type { AlertView } from "@/lib/domain/view";

type AlertFanProps = {
  izquierda: AlertView;
  centro: AlertView;
  derecha: AlertView;
};

/**
 * Tres tarjetas de vidrio en abanico. La central (ganadores y perdedores) va
 * primero en el DOM para lectores de pantalla; en pantallas pequeñas solo se
 * muestra la central.
 */
export function AlertFan({ izquierda, centro, derecha }: AlertFanProps) {
  return (
    <div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute top-24 left-1/2 -z-10 h-[420px] w-[min(720px,90vw)] -translate-x-1/2 rounded-full bg-brass/10 blur-3xl"
      />
      <div className="lg:grid lg:grid-cols-[1fr_1.2fr_1fr] lg:items-start">
        <AlertCard
          alerta={centro}
          nivelTitulo={2}
          className="relative z-10 mx-auto max-w-[480px] lg:order-2 lg:max-w-none"
        />
        <AlertCard
          alerta={izquierda}
          nivelTitulo={2}
          className="hidden lg:order-1 lg:block lg:translate-x-12 lg:translate-y-16 lg:-rotate-5 lg:scale-90"
        />
        <AlertCard
          alerta={derecha}
          nivelTitulo={2}
          className="hidden lg:order-3 lg:block lg:-translate-x-12 lg:translate-y-16 lg:rotate-5 lg:scale-90"
        />
      </div>
    </div>
  );
}
