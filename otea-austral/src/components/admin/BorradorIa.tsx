import type { BorradorEnCola, IntentoEnCola } from "@/lib/ingesta/cola-postgres";
import { formatearFechaHora } from "@/lib/format";
import { BANDERA_ETIQUETA, MOTIVO_INTENTO_ETIQUETA, RESULTADO_INTENTO_ETIQUETA } from "./etiquetas";

/** US$ con hasta cuatro decimales (un borrador cuesta décimas de centavo). */
export function dolares(micros: number): string {
  return `US$ ${(micros / 1_000_000).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

const porcentaje = (p: number) => `${(Math.round(p * 1000) / 10).toLocaleString("es-CL")} %`;

/**
 * Lo que la dueña necesita para juzgar un borrador con IA antes de abrirlo (`docs/alertas-reales.md` §5): las cifras de la
 * anticopia, las banderas y las dudas que dejó el modelo. Todo es texto del borrador o códigos: nada de las fuentes.
 */
export function ResumenBorrador({ borrador, className = "" }: { borrador: BorradorEnCola; className?: string }) {
  return (
    <div className={`text-sm text-texto-suave ${className}`}>
      <p>
        <strong className="font-semibold text-texto">Borrador con IA</strong> · {borrador.modelo} ·{" "}
        {borrador.documentos === 1 ? "1 documento leído" : `${borrador.documentos} documentos leídos`} · anticopia:{" "}
        {porcentaje(borrador.copiaProporcion)} de 5-gramas en común, tramo común más largo de {borrador.copiaTramo}{" "}
        {borrador.copiaTramo === 1 ? "palabra" : "palabras"} · {dolares(borrador.costoMicros)} ·{" "}
        <time dateTime={borrador.creado}>{formatearFechaHora(borrador.creado)}</time>
      </p>
      {borrador.contenido ? <p className="mt-2 text-texto">Propone: «{borrador.contenido.evento}»</p> : null}
      {borrador.banderas.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Banderas del borrador">
          {borrador.banderas.map((b) => (
            <li key={b}>{BANDERA_ETIQUETA[b]}</li>
          ))}
        </ul>
      ) : null}
      {borrador.contenido && borrador.contenido.dudas.length > 0 ? (
        <>
          <p className="mt-2 font-semibold text-texto">Dudas del modelo (compruébalas en las fuentes):</p>
          <ul className="mt-1 list-disc space-y-1 pl-5" aria-label="Dudas del modelo">
            {borrador.contenido.dudas.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Un intento de la IA que no dejó borrador, en palabras (resultado y motivo, nunca un texto). */
export function describirIntento(i: IntentoEnCola): string {
  const motivo = i.motivo ? ` · ${MOTIVO_INTENTO_ETIQUETA[i.motivo] ?? i.motivo}` : "";
  const banderas = i.banderas.filter((b) => b === "posible_inyeccion" || b === "lectura_manual").map((b) => BANDERA_ETIQUETA[b]);
  return `${RESULTADO_INTENTO_ETIQUETA[i.resultado]}${motivo}${banderas.length ? ` · ${banderas.join(" · ")}` : ""}`;
}
