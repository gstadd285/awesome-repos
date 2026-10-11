import type { ReactNode } from "react";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { Migas } from "./Migas";
import { PageTransition } from "./PageTransition";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type ContentPageProps = {
  /** Ruta de la página (por ejemplo «/metodologia»): marca la página actual en la cabecera. */
  ruta: string;
  /** Nombre corto de la página, para la ruta de navegación. */
  rotulo: string;
  titulo: string;
  intro?: ReactNode;
  /** Aviso destacado bajo la introducción (por ejemplo, revisión legal pendiente). */
  aviso?: string;
  children: ReactNode;
};

/** Página de contenido: ruta de navegación, titular que entra letra a letra e introducción. */
export function ContentPage({ ruta, rotulo, titulo, intro, aviso, children }: ContentPageProps) {
  return (
    <>
      <SiteHeader actual={ruta} />
      <main id="contenido" className="fondo-luz pb-24 lg:pb-[120px]">
        <PageTransition>
          <div className="mx-auto max-w-[1440px] px-6 pt-12 sm:pt-20">
            <Migas actual={rotulo} className="anim-aparecer" />
            <TextoEnMovimiento
              como="h1"
              efecto="letras"
              disparo="carga"
              texto={titulo}
              className="titular mt-8 max-w-[18ch] text-display text-texto"
            />
            {intro ? (
              <div className="anim-aparecer anim-retraso-3 mt-8 max-w-[680px] text-lede text-texto-suave">
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

/** Bloque numerado de texto largo (páginas legales y metodología): ahí la numeración sí es una secuencia. */
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
