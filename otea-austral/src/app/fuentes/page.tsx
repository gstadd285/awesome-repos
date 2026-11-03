import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { Constelacion } from "@/components/piezas/Constelacion";
import { TEMA_ETIQUETA, type Source } from "@/lib/domain/schemas";
import { safeHref } from "@/lib/domain/url";
import { fuentesActivas, fuentesPorAmbito } from "@/lib/sources/registry";

export const metadata: Metadata = {
  title: "Fuentes",
  description: "Registro público de las fuentes que usa Otea Austral para verificar sus alertas.",
};

const TIPO = { primaria: "Primaria", secundaria: "Secundaria", prensa: "Prensa" } as const;
const ACCESO = { rss: "RSS", api: "API", manual: "Manual" } as const;
/** Columnas y su ancho: iguales en las tres tablas, así Tipo, Temas y Acceso caen en la misma x. */
const COLUMNAS = [
  ["Organismo", "31%"],
  ["Tipo", "12%"],
  ["Temas", "29%"],
  ["Acceso", "10%"],
  ["Enlace", "18%"],
] as const;

/** «Estados Unidos» → «estados-unidos»: un `id` válido para el ancla del índice. */
const ancla = (titulo: string) =>
  `grupo-${titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")}`;

const temas = (f: Source) => (f.temas.length ? f.temas.map((t) => TEMA_ETIQUETA[t]) : ["Transversal"]);

function Enlace({ f, className = "" }: { f: Source; className?: string }) {
  const href = f.url_base ? safeHref(f.url_base) : undefined;
  if (!href) return <span className="text-apoyo">Pendiente</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-texto underline decoration-linea-fuerte underline-offset-4 [overflow-wrap:anywhere] hover:decoration-texto ${className}`}
    >
      {new URL(href).hostname.replace(/^www\./, "")}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

export default function FuentesPage() {
  const grupos = fuentesPorAmbito();
  return (
    <ContentPage
      ruta="/fuentes"
      rotulo="Fuentes"
      titulo="De dónde sale la información."
      intro={
        <p>
          Una alerta solo llega a confianza alta si la respalda una fuente primaria; la prensa sirve para
          detectar, no para confirmar. Enlazamos los documentos originales y nunca copiamos su texto.
        </p>
      }
      aviso="Registro en construcción · condiciones de reutilización pendientes de verificar"
      cifras={[
        { valor: fuentesActivas().length, rotulo: "fuentes activas" },
        { valor: grupos.length, rotulo: "ámbitos" },
      ]}
      pieza={
        <Constelacion grupos={grupos.map((g) => ({ titulo: g.titulo, fuentes: g.fuentes.map((f) => ({ id: f.id, tipo: f.tipo })) }))} />
      }
      indice={grupos.map((g, i) => ({ numero: String(i + 1).padStart(2, "0"), titulo: g.titulo, id: ancla(g.titulo) }))}
    >
      {grupos.map((grupo) => {
        const id = ancla(grupo.titulo);
        return (
          <section key={grupo.titulo} aria-labelledby={id} className="pb-10">
            <h2 id={id} className="titular text-titulo text-texto">
              {grupo.titulo}
            </h2>
            {/* Desde 640 px: el mismo ancho de columnas en las tres tablas (diseño fijo). */}
            <div className="superficie relative mt-6 hidden overflow-hidden rounded-card sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Fuentes activas: {grupo.titulo}</caption>
                <colgroup>
                  {COLUMNAS.map(([c, ancho]) => (
                    <col key={c} width={ancho} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-linea">
                    {COLUMNAS.map(([c]) => (
                      <th key={c} scope="col" className="micro px-5 py-4 font-medium text-apoyo">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="align-top text-texto-suave">
                  {grupo.fuentes.map((f) => (
                    <tr key={f.id} className="border-b border-linea last:border-b-0">
                      <th scope="row" className="px-5 py-4 font-medium text-texto">
                        {f.organismo}
                      </th>
                      <td className="px-5 py-4">{TIPO[f.tipo]}</td>
                      <td className="px-5 py-4">{temas(f).join(", ")}</td>
                      <td className="px-5 py-4">{ACCESO[f.acceso]}</td>
                      <td className="px-5 py-4">
                        <Enlace f={f} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Teléfono: una tarjeta por organismo, con sus temas y un enlace de 44 px (sin scroll lateral). */}
            <ul className="mt-5 grid gap-3 sm:hidden">
              {grupo.fuentes.map((f) => (
                <li key={f.id} className="superficie rounded-card p-5">
                  <p className="font-medium text-texto">{f.organismo}</p>
                  <p className="contador mt-1 text-apoyo">
                    {TIPO[f.tipo]} · {ACCESO[f.acceso]}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Temas">
                    {temas(f).map((t) => (
                      <li key={t} className="rounded-pill bg-fondo px-2 py-0.5 text-xs text-texto">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <Enlace f={f} className="mt-2 inline-flex min-h-11 items-center" />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="prosa max-w-[720px]">
        Prensa: se agregará cuando se aprueben los medios y se confirmen sus condiciones de uso. Los
        nombres de los organismos se usan solo para citar fuentes y no implican relación ni respaldo.
      </p>
    </ContentPage>
  );
}
