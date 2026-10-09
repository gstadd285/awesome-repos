import { Emblem } from "@/components/brand/Emblem";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-glass-edge">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-3 text-ivory-soft">
          <Emblem className="h-5 w-auto" />
          Información y análisis. No constituye asesoría financiera.
        </p>
        <p className="text-mist">© {new Date().getFullYear()} Otea Austral</p>
      </div>
    </footer>
  );
}
