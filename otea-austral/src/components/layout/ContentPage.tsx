import { Children, isValidElement, type ReactNode } from "react";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { Cifra } from "@/components/piezas/Cifra";
import { Migas } from "./Migas";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Una entrada del índice: el número y el título del apartado, y el `id` al que salta. */
export type EntradaIndice = { numero: string; titulo: string; id: string };

/** Una cifra de rodillo: solo conteos reales del código (nunca una cifra inventada). */
export type CifraInterior = { valor: number; rotulo: string };

type ContentPageProps = {
  /** Ruta de la página (por ejemplo «/metodologia»): marca la página actual en la cabecera. */
  ruta: string;
  /** Nombre corto de la página, para la ruta de navegación. */
  rotulo: string;
  titulo: string;
  intro?: ReactNode;
  /** Aviso destacado bajo la introducción (por ejemplo, revisión legal pendiente). */
  aviso?: string;
  /**
   * Índice vivo «En esta página»: en orden, uno por hijo directo del cuerpo. Con `true` se arma solo con los
   * `<Apartado>` hijos (número y título).
   */
  indice?: EntradaIndice[] | true;
  /** La pieza propia de la página (SVG o el simulador), en una tarjeta de porcelana junto al titular. */
  pieza?: ReactNode;
  /** Cifras de rodillo bajo la entrada. */
  cifras?: CifraInterior[];
  children: ReactNode;
};

/**
 * Página interior «de autor»: migas, titular de 44 a 88 px que entra letra a letra, entrada en Source Serif 4 a 60ch,
 * cifras de rodillo y la pieza de la página a la derecha (en el teléfono, entre la entrada y el cuerpo). El cuerpo va a
 * 68ch con un índice fijo de 240 px a la izquierda que marca el apartado en curso solo con CSS (marcadores de
 * desplazamiento, `:target-current`); en el teléfono el índice es un `<details>` pegajoso «En esta página». El cuerpo
 * espera al titular.
 */
export function ContentPage({ ruta, rotulo, titulo, intro, aviso, indice: pedido, pieza, cifras, children }: ContentPageProps) {
  const indice = pedido === true ? indiceDeApartados(children) : pedido;
  return (
    <>
      <SiteHeader actual={ruta} />
      <main id="contenido" className="int fondo-luz pb-24 lg:pb-[120px]">
        <div className="mx-auto max-w-[1440px] px-6">
          <div className={`grid gap-10 pt-12 sm:pt-20 lg:items-center${pieza ? " lg:grid-cols-[1.2fr_1fr] lg:gap-14" : ""}`}>
            <div className="self-start">
              <Migas actual={rotulo} className="anim-aparecer" />
              <TextoEnMovimiento
                como="h1"
                efecto="letras"
                disparo="carga"
                texto={titulo}
                className="titular int-h1 mt-7 max-w-[16ch] text-texto"
              />
              {intro ? <div className="int-entrada mt-7 max-w-[680px] font-serif text-lede text-texto-suave">{intro}</div> : null}
              {aviso ? (
                <p
                  role="note"
                  className="micro int-sigue mt-6 inline-flex items-center gap-2 rounded-badge bg-papel-alto px-3 py-2 text-texto linea-fina"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-acento" />
                  {aviso}
                </p>
              ) : null}
              {cifras?.length ? (
                <ul className="int-sigue mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
                  {cifras.map((c) => (
                    <li key={c.rotulo} className="grid gap-2">
                      <Cifra valor={c.valor} /> <span className="micro max-w-[16ch] text-apoyo">{c.rotulo}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {pieza ? <div className="int-pieza superficie rounded-card p-5 sm:p-8">{pieza}</div> : null}
          </div>
          <div className={`int-cuerpo mt-16${indice?.length ? " con-indice" : ""}`}>
            {indice?.length ? <Indice entradas={indice} /> : null}
            <div className="apartados">{children}</div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** Índice «En esta página»: fijo a la izquierda en escritorio y un desplegable pegajoso en el teléfono. */
function Indice({ entradas }: { entradas: EntradaIndice[] }) {
  const lista = (
    <ol className="indice mt-3">
      {entradas.map((e) => (
        <li key={e.id}>
          <a href={`#${e.id}`} className="relative flex gap-3 rounded-badge px-4 py-3 text-sm leading-snug text-texto-suave hover:text-texto lg:py-2">
            <span className="contador pt-0.5 text-brass-deep">{e.numero}</span>
            {e.titulo}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav aria-label="En esta página" className="indice-fijo sticky hidden self-start lg:top-28 lg:inline-block">
        <p className="micro text-apoyo">En esta página</p>
        {lista}
      </nav>
      <details className="indice-movil group lg:hidden">
        <summary className="micro flex min-h-11 items-center justify-between border-b border-linea bg-papel-alto px-6 text-texto [&::-webkit-details-marker]:hidden">
          En esta página
          <svg viewBox="0 0 16 16" aria-hidden="true" className="chevron h-3 w-3">
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <nav aria-label="En esta página (desplegable)">{lista}</nav>
      </details>
    </>
  );
}

/** Bloque numerado de texto largo (páginas legales y metodología): ahí la numeración sí es una secuencia. */
export function Apartado({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  const id = `apartado-${numero}`;
  return (
    <section aria-labelledby={id} className="apartado max-w-[720px]">
      <span className="contador text-brass-deep">{numero}</span>
      <h2 id={id} className="titular mt-2.5 text-titulo text-texto">
        {titulo}
      </h2>
      <div className="prosa max-w-[720px]">{children}</div>
    </section>
  );
}

/** El índice que sale de los `<Apartado>` hijos, en orden (sus `id` son los de sus títulos). */
function indiceDeApartados(children: ReactNode): EntradaIndice[] {
  return Children.toArray(children).flatMap((hijo) => {
    if (!isValidElement<{ numero: string; titulo: string }>(hijo) || hijo.type !== Apartado) return [];
    const { numero, titulo } = hijo.props;
    return [{ numero, titulo, id: `apartado-${numero}` }];
  });
}
