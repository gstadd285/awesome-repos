import { TIPO_FUENTE_ETIQUETA } from "@/components/alert-card/labels";
import { safeHref } from "@/lib/domain/url";
import { formatearFechaHora } from "@/lib/format";
import type { FuenteDeEvento } from "@/lib/ingesta/cola-postgres";
import { ENLACE } from "./estilos";

/**
 * Fuentes de un evento candidato: organismo, título (un metadato) enlazado al documento oficial y fechas. El enlace se
 * vuelve a validar al renderizar (`safeHref`: solo https) y se abre en una pestaña nueva sin `opener` ni `referer`.
 */
export function FuentesEvento({ fuentes, className = "" }: { fuentes: readonly FuenteDeEvento[]; className?: string }) {
  return (
    <ul className={`grid gap-3 ${className}`}>
      {fuentes.map((f) => {
        const href = safeHref(f.url);
        return (
          <li key={f.id}>
            <p className="text-xs text-apoyo">
              {f.organismo} · {TIPO_FUENTE_ETIQUETA[f.tipo]}
            </p>
            <p className="mt-1 text-sm">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                  {f.titulo} <span className="sr-only">(se abre en una pestaña nueva)</span>
                </a>
              ) : (
                f.titulo
              )}
            </p>
            <p className="mt-1 text-xs text-apoyo">
              {f.publicado ? (
                <>
                  Publicado el <time dateTime={f.publicado}>{formatearFechaHora(f.publicado)}</time>
                </>
              ) : (
                "Sin fecha en el feed"
              )}
              {" · "}visto por la ingesta el <time dateTime={f.visto}>{formatearFechaHora(f.visto)}</time>
              {f.identificador ? ` · ${f.identificador}` : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
