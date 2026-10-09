import { Emblem } from "./Emblem";

/** Logo completo: emblema + "OTEA" + "AUSTRAL". Nunca lleva eslogan. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Emblem className="h-8 w-auto shrink-0" />
      <span className="flex flex-col font-serif leading-none">
        <span className="text-[19px] tracking-[0.34em] text-ivory">OTEA</span>
        <span className="mt-1 text-[10px] tracking-[0.5em] text-brass">AUSTRAL</span>
      </span>
    </span>
  );
}
