import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { TEMA_ETIQUETA } from "@/lib/domain/schemas";
import { safeHref } from "@/lib/domain/url";
import { fuentesPorAmbito } from "@/lib/sources/registry";

export const metadata: Metadata = {
  title: "Fuentes",
  description: "Registro público de las fuentes que usa Otea Austral para verificar sus alertas.",
};

const TIPO = { primaria: "Primaria", secundaria: "Secundaria", prensa: "Prensa" } as const;

export default function FuentesPage() {
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
    >
      <div className="space-y-16">
        {fuentesPorAmbito().map((grupo) => (
          <section key={grupo.titulo} aria-labelledby={`grupo-${grupo.titulo}`} className="anim-revelar">
            <h2 id={`grupo-${grupo.titulo}`} className="titular text-xl text-texto">
              {grupo.titulo}
            </h2>
            <div className="superficie relative mt-6 overflow-x-auto rounded-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Fuentes activas: {grupo.titulo}</caption>
                <thead>
                  <tr className="border-b border-linea">
                    {["Organismo", "Tipo", "Temas", "Acceso", "Enlace"].map((c) => (
                      <th key={c} scope="col" className="micro px-5 py-4 font-medium text-apoyo">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupo.fuentes.map((f) => {
                    const href = f.url_base ? safeHref(f.url_base) : undefined;
                    return (
                      <tr key={f.id} className="border-b border-linea last:border-b-0">
                        <th scope="row" className="px-5 py-4 font-medium text-texto">
                          {f.organismo}
                        </th>
                        <td className="px-5 py-4 text-texto-suave">{TIPO[f.tipo]}</td>
                        <td className="px-5 py-4 text-texto-suave">
                          {f.temas.length ? f.temas.map((t) => TEMA_ETIQUETA[t]).join(", ") : "Transversal"}
                        </td>
                        <td className="px-5 py-4 text-texto-suave">Manual</td>
                        <td className="px-5 py-4">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-texto underline decoration-linea-fuerte underline-offset-4 hover:decoration-texto"
                            >
                              {new URL(href).hostname.replace(/^www\./, "")}
                              <span className="sr-only"> (se abre en una pestaña nueva)</span>
                            </a>
                          ) : (
                            <span className="text-apoyo">Pendiente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="max-w-[680px] text-sm leading-relaxed text-apoyo">
          Prensa: se agregará cuando se aprueben los medios y se confirmen sus condiciones de uso. Los
          nombres de los organismos se usan solo para citar fuentes y no implican relación ni respaldo.
        </p>
      </div>
    </ContentPage>
  );
}
