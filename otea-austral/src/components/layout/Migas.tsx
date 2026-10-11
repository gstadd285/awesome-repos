import Link from "next/link";

/** Ruta de navegación «Inicio / Página»: orienta en las páginas interiores y da un camino de regreso. */
export function Migas({ actual, className = "" }: { actual: string; className?: string }) {
  return (
    <nav aria-label="Ruta de navegación" className={className}>
      <ol className="flex items-center gap-2 text-sm text-apoyo">
        <li>
          <Link href="/" className="rounded-badge underline-offset-4 hover:text-texto hover:underline">
            Inicio
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-texto">
          {actual}
        </li>
      </ol>
    </nav>
  );
}
