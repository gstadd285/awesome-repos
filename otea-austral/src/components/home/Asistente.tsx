import { AsistenteChat } from "@/components/asistente/AsistenteChat";
import { TextoEnMovimiento } from "@/components/motion/TextoEnMovimiento";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { PREGUNTAS_SUGERIDAS, entradaPorId } from "@/lib/asistente/conocimiento";
import type { ModoRespuesta } from "@/lib/asistente/limites";

const COMPROMISOS: Record<ModoRespuesta, readonly string[]> = {
  base: [
    "Hoy responde con las preguntas frecuentes del sitio, escritas y revisadas por el equipo. No usa IA.",
    "Solo habla de lo que está publicado en Otea: cómo funciona, la metodología, las fuentes y las condiciones.",
    "No da consejos de inversión ni pronósticos de precios.",
    "No guardamos tus preguntas, y no necesitas escribir datos personales.",
  ],
  ia: [
    "Una IA redacta la respuesta usando solo las preguntas frecuentes del sitio, y cada frase se revisa antes de mostrarse.",
    "Solo habla de lo que está publicado en Otea: cómo funciona, la metodología, las fuentes y las condiciones.",
    "No da consejos de inversión ni pronósticos de precios. Si no sabe algo, lo dice.",
    "No guardamos tus preguntas, y no necesitas escribir datos personales.",
  ],
};

/**
 * «Resuelve tus dudas»: el asistente de preguntas de la portada. Sin JavaScript el chat queda desactivado y las
 * respuestas más pedidas se leen en el bloque `noscript`.
 */
export function Asistente({ modo }: { modo: ModoRespuesta }) {
  const sugeridas = PREGUNTAS_SUGERIDAS.map((p) => p.texto);
  return (
    <section
      id="preguntas"
      aria-labelledby="preguntas-titulo"
      className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-24 lg:py-[120px]"
    >
      <SectionEyebrow>Preguntas</SectionEyebrow>
      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <TextoEnMovimiento
            como="h2"
            id="preguntas-titulo"
            efecto="palabras"
            disparo="scroll"
            texto="Resuelve tus dudas."
            className="titular text-titulo text-texto"
          />
          <TextoEnMovimiento
            como="p"
            efecto="lectura"
            disparo="scroll"
            texto="Pregunta cómo calculamos la confianza, de dónde salen las fuentes o qué pasa si una alerta es un error. Responde con lo que dice este sitio y, cuando no lo sabe, te lo dice."
            className="mt-6 max-w-[520px] text-lede text-texto-suave"
          />
          <ul className="mt-8 max-w-[520px] space-y-3" aria-label="Cómo funciona el asistente">
            {COMPROMISOS[modo].map((texto) => (
              <li key={texto} className="flex items-start gap-3 text-base leading-relaxed text-texto-suave">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-acento text-xs text-ink"
                >
                  ✓
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="anim-revelar">
          <AsistenteChat modo={modo} sugeridas={sugeridas} />
          <noscript>
            <div className="superficie mt-6 rounded-card p-6">
              <p className="font-medium text-texto">El asistente necesita JavaScript.</p>
              <p className="mt-2 text-sm text-texto-suave">Mientras tanto, estas son las respuestas más pedidas:</p>
              <dl className="mt-4 space-y-4">
                {PREGUNTAS_SUGERIDAS.map(({ entrada }) => {
                  const e = entradaPorId(entrada);
                  return e ? (
                    <div key={e.id}>
                      <dt className="font-medium text-texto">{e.pregunta}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-texto-suave">{e.respuesta}</dd>
                    </div>
                  ) : null;
                })}
              </dl>
            </div>
          </noscript>
        </div>
      </div>
    </section>
  );
}
