import type { ReactNode } from "react";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { PageTransition } from "./PageTransition";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type ContentPageProps = {
  numero: string;
  rotulo: string;
  titulo: string;
  intro?: ReactNode;
  /** Aviso destacado bajo la introducción (por ejemplo, revisión legal pendiente). */
  aviso?: string;
  children: ReactNode;
};

/** Página de contenido con cabecera técnica, al estilo de la portada. */
export function ContentPage({ numero, rotulo, titulo, intro, aviso, children }: ContentPageProps) {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="fondo-luz pb-[120px]">
        <PageTransition>
          <div className="mx-auto max-w-[1440px] px-6 pt-16 sm:pt-24">
            <SectionEyebrow numero={numero} className="anim-aparecer">
              {rotulo}
            </SectionEyebrow>
            <h1 className="titular anim-aparecer anim-retraso-1 mt-10 max-w-[18ch] text-display text-texto">
              {titulo}
            </h1>
            {intro ? (
              <div className="anim-aparecer anim-retraso-2 mt-8 max-w-[680px] text-lg leading-relaxed text-texto-suave">
                {intro}
              </div>
            ) : null}
            {aviso ? (
              <p
                role="note"
                className="micro anim-aparecer anim-retraso-3 mt-6 inline-flex items-center gap-2 rounded-badge bg-papel-alto px-3 py-2 text-texto linea-fina"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-acento" />
                {aviso}
              </p>
            ) : null}
            <div className="mt-16">{children}</div>
          </div>
        </PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}

/** Bloque numerado de texto largo (páginas legales y metodología). */
export function Apartado({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  const id = `apartado-${numero}`;
  return (
    <section
      aria-labelledby={id}
      className="anim-revelar grid gap-6 border-t border-linea py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <div className="flex items-baseline gap-4">
        <span className="contador text-apoyo">{numero}</span>
        <h2 id={id} className="titular text-xl text-texto">
          {titulo}
        </h2>
      </div>
      <div className="max-w-[720px] space-y-4 leading-relaxed text-texto-suave [&_a]:text-texto [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold [&_strong]:text-texto [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
