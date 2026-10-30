"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { buttonClasses } from "@/components/ui/button";
import {
  AVISOS_DE_IA,
  ErrorAsistente,
  MENSAJES_DE_FALLO,
  RESPUESTA_INICIAL,
  SALUDO_INICIAL,
  aplicar,
  fallar,
  preguntar,
  type Bloque,
  type Respuesta,
} from "@/lib/asistente/cliente";
import { MAX_ANTERIORES, MAX_PREGUNTA, type ModoRespuesta } from "@/lib/asistente/limites";

type Turno = { id: number; pregunta: string; respuesta: Respuesta; detenida?: boolean };

/** Cuánto antes del final del registro se sigue pegado a él cuando llega texto nuevo. */
const MARGEN_AL_FINAL_PX = 80;

const ETIQUETA_MODO: Record<ModoRespuesta, string> = {
  base: "Preguntas frecuentes, sin IA",
  ia: "Con IA y filtros de lenguaje",
};

const NOTA_IA =
  "Las respuestas con IA las redacta un modelo a partir de las preguntas frecuentes del sitio y pueden tener errores: lo importante, contrástalo en la metodología y en las fuentes.";

const ENLACE = "enlace font-medium text-texto";
const ATAJO =
  "min-h-11 rounded-card bg-papel-alto px-4 py-2.5 text-left text-sm leading-snug text-texto linea-fina transition-colors hover:bg-papel active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

const sinSuscripcion = () => () => {};
/**
 * Falso en el servidor y mientras el navegador hidrata la página; verdadero después. Hasta entonces los controles
 * están desactivados: sin JavaScript no hay asistente (la portada explica qué hacer), y nada de lo que se escriba
 * antes de que la página esté lista se pierde.
 */
function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}

/** Tope del escalonado de las frases (`kx-i-N` × 120 ms): una respuesta larga no espera más de medio segundo. */
const MAX_ESCALON_FRASE = 4;

/**
 * Parte un texto en frases sin perder ningún carácter: cada trozo termina en su puntuación y el espacio que la sigue, así
 * que unirlos devuelve el texto exacto (el lector de pantalla y `textContent` leen lo mismo que antes).
 */
export function frases(texto: string): string[] {
  const trozos: string[] = [];
  const fin = /[.!?…:]+[»”")]*\s+/g;
  let inicio = 0;
  for (let m = fin.exec(texto); m; m = fin.exec(texto)) {
    trozos.push(texto.slice(inicio, m.index + m[0].length));
    inicio = m.index + m[0].length;
  }
  if (inicio < texto.length) trozos.push(texto.slice(inicio));
  return trozos;
}

function ultimoIndiceBase(bloques: readonly Bloque[]): number {
  for (let i = bloques.length - 1; i >= 0; i--) if (bloques[i].modo === "base") return i;
  return -1;
}

function Escribiendo() {
  return (
    <p className="flex items-center gap-2.5 text-sm text-apoyo">
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="punto-escribiendo h-1.5 w-1.5 rounded-full bg-apoyo" />
        <span className="punto-escribiendo kx-i-1 h-1.5 w-1.5 rounded-full bg-apoyo" />
        <span className="punto-escribiendo kx-i-2 h-1.5 w-1.5 rounded-full bg-apoyo" />
      </span>
      Buscando la respuesta…
    </p>
  );
}

function Atajos({
  preguntas,
  titulo,
  alElegir,
  deshabilitado,
}: {
  preguntas: readonly string[];
  titulo: string;
  alElegir: (pregunta: string) => void;
  deshabilitado: boolean;
}) {
  if (preguntas.length === 0) return null;
  return (
    <div>
      <p className="micro text-apoyo">{titulo}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {preguntas.map((p) => (
          <li key={p}>
            <button type="button" disabled={deshabilitado} onClick={() => alElegir(p)} className={ATAJO}>
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RespuestaAsistente({
  turno,
  esUltimo,
  ocupado,
  alElegir,
  alReintentar,
}: {
  turno: Turno;
  esUltimo: boolean;
  ocupado: boolean;
  alElegir: (pregunta: string) => void;
  alReintentar: () => void;
}) {
  const r = turno.respuesta;
  const textoDelUltimo = r.bloques[r.bloques.length - 1]?.texto ?? "";
  const indiceAviso = r.aviso ? ultimoIndiceBase(r.bloques) : -1;
  const aviso = r.aviso ? (
    <p className="rounded-badge bg-fondo px-3 py-2 text-sm leading-relaxed text-texto-suave">{AVISOS_DE_IA[r.aviso]}</p>
  ) : null;

  return (
    <div className="mensaje max-w-[94%] space-y-4 rounded-card bg-papel px-4 py-3.5 text-texto linea-fina">
      <p className="sr-only">Asistente:</p>
      {r.bloques.map((b, i) => (
        <div key={i} className="space-y-2">
          {i === indiceAviso ? aviso : null}
          {b.modo === "ia" ? <p className="micro text-apoyo">Respuesta con IA</p> : null}
          {b.modo === "base" && b.coincidencia ? (
            <p className="micro text-apoyo">Pregunta frecuente: «{b.coincidencia}»</p>
          ) : null}
          {b.texto !== "" ? (
            // La respuesta aparece por frases (cada `span` con su retraso, 120 ms); el texto del párrafo es el mismo.
            <p className="text-base leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
              {frases(b.texto).map((f, j) => (
                <span key={j} className={`frase kx-i-${Math.min(j, MAX_ESCALON_FRASE)}`}>
                  {f}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ))}
      {indiceAviso === -1 ? aviso : null}

      {r.estado === "cargando" && textoDelUltimo === "" ? <Escribiendo /> : null}

      {r.estado === "listo" && r.fuentes.length > 0 ? (
        <div>
          <p className="micro text-apoyo">Ver más</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {r.fuentes.map((f) => (
              <li key={f.href}>
                <Link href={f.href} className={ENLACE}>
                  {f.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {turno.detenida ? <p className="text-sm text-apoyo">Detuviste la respuesta.</p> : null}

      {r.estado === "fallo" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-texto">
            <span aria-hidden="true">⚠ </span>
            {MENSAJES_DE_FALLO[r.fallo ?? "servidor"]}
          </p>
          {esUltimo ? (
            <button type="button" disabled={ocupado} onClick={alReintentar} className={buttonClasses("outline", "", "sm")}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {esUltimo && r.estado === "listo" && !turno.detenida ? (
        <Atajos titulo="También puedes preguntar" preguntas={r.sugerencias} alElegir={alElegir} deshabilitado={ocupado} />
      ) : null}
    </div>
  );
}

/**
 * La conversación con el asistente. Habla con `POST /api/asistente` (ver `src/lib/asistente/cliente.ts`) y muestra la
 * respuesta a medida que llega. Solo guarda la conversación en memoria de esta pestaña: nada va al almacenamiento
 * del navegador ni se reenvía más que las dos últimas preguntas, como contexto.
 */
export function AsistenteChat({ modo, sugeridas }: { modo: ModoRespuesta; sugeridas: readonly string[] }) {
  const hidratado = useHidratado();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const control = useRef<AbortController | null>(null);
  const ultimoId = useRef(0);
  const registro = useRef<HTMLDivElement>(null);
  const alFinal = useRef(true);

  const ultimo = turnos[turnos.length - 1];
  const cargando = ultimo?.respuesta.estado === "cargando";

  // Al salir de la página no queda ninguna respuesta a medias gastando en el servidor.
  useEffect(() => {
    return () => control.current?.abort();
  }, []);

  // Si la persona estaba leyendo el final, la conversación la acompaña; si subió a releer, no se mueve. Sin
  // conversación (al empezar o al borrarla) el registro se queda arriba, donde está el saludo.
  useEffect(() => {
    const el = registro.current;
    if (el && alFinal.current) el.scrollTop = turnos.length === 0 ? 0 : el.scrollHeight;
  }, [turnos]);

  function alDesplazar() {
    const el = registro.current;
    if (el) alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < MARGEN_AL_FINAL_PX;
  }

  async function enviar(entrada: string, opciones: { desdeCampo?: boolean; reemplazar?: number } = {}) {
    const pregunta = entrada.replace(/\s+/g, " ").trim();
    if (pregunta === "" || cargando || !hidratado) return;
    const id = opciones.reemplazar ?? ++ultimoId.current;
    const previas = turnos
      .filter((t) => t.id !== id)
      .slice(-MAX_ANTERIORES)
      .map((t) => t.pregunta);
    const controlador = new AbortController();
    control.current = controlador;
    alFinal.current = true;

    const nuevo: Turno = { id, pregunta, respuesta: RESPUESTA_INICIAL };
    setTurnos((actuales) =>
      opciones.reemplazar === undefined ? [...actuales, nuevo] : actuales.map((t) => (t.id === id ? nuevo : t)),
    );
    if (opciones.desdeCampo) setTexto("");

    const actualizar = (cambio: (r: Respuesta) => Respuesta, extra?: Partial<Turno>) =>
      setTurnos((actuales) =>
        actuales.map((t) => (t.id === id ? { ...t, ...extra, respuesta: cambio(t.respuesta) } : t)),
      );
    try {
      for await (const evento of preguntar({ pregunta, anteriores: previas }, controlador.signal)) {
        actualizar((r) => aplicar(r, evento));
      }
    } catch (error) {
      if (controlador.signal.aborted) {
        actualizar((r) => ({ ...r, estado: "listo" }), { detenida: true });
      } else {
        actualizar((r) => fallar(r, error instanceof ErrorAsistente ? error.tipo : "servidor"));
      }
    } finally {
      if (control.current === controlador) control.current = null;
    }
  }

  /** Quien elige un atajo o reintenta no está en el campo de texto: el foco pasa al registro, que lee la respuesta. */
  function desdeAtajo(pregunta: string) {
    void enviar(pregunta);
    registro.current?.focus({ preventScroll: true });
  }

  function reintentar(turno: Turno) {
    void enviar(turno.pregunta, { reemplazar: turno.id });
    registro.current?.focus({ preventScroll: true });
  }

  function borrar() {
    control.current?.abort();
    setTurnos([]);
    setTexto("");
    registro.current?.focus({ preventScroll: true });
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar(texto, { desdeCampo: true });
  }

  function alTeclear(evento: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Mayús + Enter agrega una línea. Mientras se compone un carácter (IME) no hace nada.
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      void enviar(texto, { desdeCampo: true });
    }
  }

  return (
    // En el teléfono la conversación crece con la página (sin un registro de ~400 px con scroll propio); desde 640 px,
    // alto fijo y el hilo se desplaza solo. `data-bucle`: fuera de la pantalla, la isla pausa los puntos de «Buscando…»
    // y las entradas, que aparecen después de cargar la página.
    <div
      data-bucle
      className="superficie flex flex-col overflow-hidden rounded-card sm:h-[min(86svh,720px)] sm:min-h-[480px]"
    >
      <header className="border-b border-linea px-5 py-4">
        {/* Alto fijo: el botón aparece con la primera pregunta y el encabezado no debe moverse. */}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="micro text-apoyo">Asistente de Otea</p>
          {turnos.length > 0 ? (
            <button
              type="button"
              onClick={borrar}
              aria-label="Borrar conversación"
              className={buttonClasses("ghost", "shrink-0", "sm")}
            >
              Borrar<span className="hidden sm:inline"> conversación</span>
            </button>
          ) : null}
        </div>
        <p className="flex items-center gap-2 text-sm text-texto">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-acento" />
          {ETIQUETA_MODO[modo]}
        </p>
      </header>

      <div
        ref={registro}
        role="log"
        tabIndex={0}
        aria-label="Conversación con el asistente"
        aria-busy={cargando}
        onScroll={alDesplazar}
        className="relative flex-1 space-y-6 overflow-y-auto px-5 py-6 mov:scroll-smooth"
      >
        <div className="max-w-[94%] space-y-4 rounded-card bg-papel px-4 py-3.5 text-texto linea-fina">
          <p className="sr-only">Asistente:</p>
          <p className="text-base leading-relaxed">{SALUDO_INICIAL}</p>
          {modo === "ia" ? <p className="text-sm leading-relaxed text-texto-suave">{NOTA_IA}</p> : null}
          {turnos.length === 0 ? (
            <Atajos titulo="Prueba con" preguntas={sugeridas} alElegir={desdeAtajo} deshabilitado={!hidratado} />
          ) : null}
        </div>

        {turnos.map((turno) => (
          <Fragment key={turno.id}>
            <div className="mensaje ml-auto max-w-[88%] rounded-card bg-ink px-4 py-3 text-base leading-relaxed text-ivory [overflow-wrap:anywhere]">
              <span className="sr-only">Tú: </span>
              {turno.pregunta}
            </div>
            <RespuestaAsistente
              turno={turno}
              esUltimo={turno === ultimo}
              ocupado={cargando || !hidratado}
              alElegir={desdeAtajo}
              alReintentar={() => reintentar(turno)}
            />
          </Fragment>
        ))}
      </div>

      <form onSubmit={alEnviar} aria-label="Hacer una pregunta" className="border-t border-linea p-4">
        <label htmlFor="pregunta-asistente" className="sr-only">
          Tu pregunta
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            id="pregunta-asistente"
            name="pregunta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            rows={1}
            maxLength={MAX_PREGUNTA}
            disabled={!hidratado}
            placeholder="Escribe tu pregunta…"
            aria-describedby="asistente-ayuda"
            enterKeyHint="send"
            autoComplete="off"
            className="block max-h-40 min-h-[3.25rem] w-full resize-none field-sizing-content rounded-badge bg-papel px-4 py-3 text-base text-texto campo placeholder:text-apoyo disabled:opacity-70"
          />
          {cargando ? (
            <button type="button" onClick={() => control.current?.abort()} className={buttonClasses("outline", "shrink-0")}>
              Detener
            </button>
          ) : (
            <button type="submit" disabled={!hidratado} className={buttonClasses("primary", "shrink-0 disabled:opacity-70")}>
              Preguntar
            </button>
          )}
        </div>
        <p id="asistente-ayuda" className="mt-3 text-xs leading-relaxed text-apoyo">
          Enter envía; Mayús + Enter agrega una línea. No escribas datos personales.{" "}
          {modo === "ia" ? "Con IA, tu pregunta se envía a Anthropic para redactar la respuesta; nosotros no la guardamos. " : null}
          Al usar el asistente aceptas las{" "}
          <Link href="/terminos" className="enlace text-texto">
            condiciones de uso
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" className="enlace text-texto">
            política de privacidad
          </Link>
          .
          {texto.length >= MAX_PREGUNTA - 100 ? (
            <span aria-hidden="true" className="ml-2 contador">
              {texto.length}/{MAX_PREGUNTA}
            </span>
          ) : null}
        </p>
        <p role="status" className="sr-only">
          {cargando ? "El asistente está escribiendo la respuesta." : ""}
        </p>
      </form>
    </div>
  );
}
