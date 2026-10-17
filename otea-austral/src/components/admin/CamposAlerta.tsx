import { CONFIANZA_ETIQUETA, DIRECCION_ETIQUETA } from "@/components/alert-card/labels";
import { MAX_FILAS } from "@/lib/alertas/formulario";
import type { Alert } from "@/lib/domain/schemas";
import { TEMA_ETIQUETA, TEMAS } from "@/lib/domain/temas";
import { AYUDA, CAMPO, ETIQUETA } from "./estilos";
import { IMPACTO_ETIQUETA } from "./etiquetas";

type Contenido = Pick<Alert, "tema" | "evento" | "resumen" | "impacto" | "filas">;

/**
 * Campos del contenido de una alerta. Sin JavaScript: muestra las filas
 * existentes y dos vacías (hasta ocho); una fila sin sector ni condición se
 * ignora.
 */
export function CamposAlerta({ prefijo, alerta }: { prefijo: string; alerta?: Contenido }) {
  const filas = alerta?.filas ?? [];
  const espacios = Math.min(MAX_FILAS, Math.max(filas.length + 2, 3));
  const id = (campo: string) => `${prefijo}-${campo}`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={id("tema")} className={ETIQUETA}>
            Tema
          </label>
          <select id={id("tema")} name="tema" defaultValue={alerta?.tema ?? TEMAS[0]} className={CAMPO}>
            {TEMAS.map((t) => (
              <option key={t} value={t}>
                {TEMA_ETIQUETA[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("impacto")} className={ETIQUETA}>
            Impacto
          </label>
          <select id={id("impacto")} name="impacto" defaultValue={alerta?.impacto ?? "medio"} className={CAMPO}>
            {(["bajo", "medio", "alto"] as const).map((i) => (
              <option key={i} value={i}>
                {IMPACTO_ETIQUETA[i]}
              </option>
            ))}
          </select>
          <p className={AYUDA}>Impacto alto exige dos organismos distintos y una aprobación antes de publicar.</p>
        </div>
      </div>

      <div>
        <label htmlFor={id("evento")} className={ETIQUETA}>
          Evento
        </label>
        <input id={id("evento")} name="evento" maxLength={160} required defaultValue={alerta?.evento} className={CAMPO} />
      </div>

      <div>
        <label htmlFor={id("resumen")} className={ETIQUETA}>
          Resumen
        </label>
        <textarea
          id={id("resumen")}
          name="resumen"
          rows={4}
          maxLength={600}
          required
          defaultValue={alerta?.resumen}
          className={CAMPO}
        />
        <p className={AYUDA}>
          Con palabras de Otea: no copies el texto de las fuentes. Habla de efectos posibles y condiciones, nunca
          de recomendaciones de compra o venta.
        </p>
      </div>

      <fieldset className="grid gap-4">
        <legend className={ETIQUETA}>Quién gana y quién pierde</legend>
        {Array.from({ length: espacios }, (_, i) => {
          const fila = filas[i];
          return (
            <div key={i} className="grid gap-3 rounded-badge bg-papel-alto p-4 linea-fina sm:grid-cols-[2fr_1fr_3fr_1fr]">
              <div>
                <label htmlFor={id(`fila-${i}-sector`)} className="text-xs text-apoyo">
                  Fila {i + 1} · sector
                </label>
                <input
                  id={id(`fila-${i}-sector`)}
                  name={`fila_${i}_sector`}
                  maxLength={80}
                  defaultValue={fila?.sector}
                  className={CAMPO}
                />
              </div>
              <div>
                <label htmlFor={id(`fila-${i}-direccion`)} className="text-xs text-apoyo">
                  Dirección
                </label>
                <select
                  id={id(`fila-${i}-direccion`)}
                  name={`fila_${i}_direccion`}
                  defaultValue={fila?.direccion ?? "condicionado"}
                  className={CAMPO}
                >
                  {(["gana", "condicionado", "pierde"] as const).map((d) => (
                    <option key={d} value={d}>
                      {DIRECCION_ETIQUETA[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={id(`fila-${i}-condicion`)} className="text-xs text-apoyo">
                  Condición
                </label>
                <input
                  id={id(`fila-${i}-condicion`)}
                  name={`fila_${i}_condicion`}
                  maxLength={240}
                  defaultValue={fila?.condicion}
                  className={CAMPO}
                />
              </div>
              <div>
                <label htmlFor={id(`fila-${i}-confianza`)} className="text-xs text-apoyo">
                  Confianza declarada
                </label>
                <select
                  id={id(`fila-${i}-confianza`)}
                  name={`fila_${i}_confianza`}
                  defaultValue={fila?.confianza ?? "media"}
                  className={CAMPO}
                >
                  {(["baja", "media", "alta"] as const).map((c) => (
                    <option key={c} value={c}>
                      {CONFIANZA_ETIQUETA[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
        <p className={AYUDA}>La confianza que se muestra nunca supera la que respaldan las fuentes.</p>
      </fieldset>
    </div>
  );
}
