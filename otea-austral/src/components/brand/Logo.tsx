import { Emblem } from "./Emblem";

/**
 * Logo completo: emblema + "OTEA" + "AUSTRAL". Nunca lleva eslogan.
 * `claro` (por defecto) para fondos claros; `oscuro` para fondos tinta.
 */
export function Logo({ variante = "claro", className = "" }: { variante?: "claro" | "oscuro"; className?: string }) {
  const oscuro = variante === "oscuro";
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Emblem variant={oscuro ? "dark" : "light"} className="h-8 w-auto shrink-0" />
      <span className="flex flex-col font-serif leading-none">
        <span className={`text-[19px] tracking-[0.34em] ${oscuro ? "text-ivory" : "text-ink"}`}>OTEA</span>
        <span className={`mt-1 text-[10px] tracking-[0.5em] ${oscuro ? "text-brass" : "text-brass-deep"}`}>
          AUSTRAL
        </span>
      </span>
    </span>
  );
}
