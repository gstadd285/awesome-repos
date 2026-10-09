import Link from "next/link";
import { Emblem } from "@/components/brand/Emblem";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-glass-edge">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-3 text-ivory-soft">
          <Emblem className="h-5 w-auto" />
          Información y análisis. No constituye asesoría financiera.
        </p>
        <div className="flex items-center gap-6">
          <nav aria-label="Pie de página">
            <Link
              href="/seguridad"
              className="text-ivory-soft underline decoration-glass-edge-strong underline-offset-4 hover:text-ivory hover:decoration-ivory"
            >
              Seguridad
            </Link>
          </nav>
          <p className="text-mist">© {new Date().getFullYear()} Otea Austral</p>
        </div>
      </div>
    </footer>
  );
}
