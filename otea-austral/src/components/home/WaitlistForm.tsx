"use client";

import Link from "next/link";
import { useActionState } from "react";
import { unirseAListaDeEspera, type EstadoLista } from "@/app/acciones/lista-de-espera";
import { buttonClasses } from "@/components/ui/button";

const INICIAL: EstadoLista = { estado: "inicial" };

function mensaje(estado: EstadoLista): { texto: string; tono: "exito" | "aviso" } | null {
  switch (estado.estado) {
    case "ok":
      return {
        texto: estado.prueba
          ? "Listo, paso 1 de 2. Modo de prueba: no enviamos correos; el enlace de confirmación queda en el registro del servidor."
          : "¡Gracias! Paso 2 de 2: revisa tu correo. Si es válido, te llegará un mensaje con un enlace para confirmar tu inscripción (vence en 72 horas). Sin ese paso no quedas inscrito.",
        tono: "exito",
      };
    case "cerrada":
      return { texto: "La lista de espera abre pronto. Por ahora no guardamos correos.", tono: "aviso" };
    case "limite":
      return { texto: "Demasiados intentos. Prueba de nuevo en unos minutos.", tono: "aviso" };
    case "saturada":
      return {
        texto: "Hoy recibimos muchas inscripciones y ya no podemos enviar más correos. Vuelve a intentarlo mañana.",
        tono: "aviso",
      };
    case "espera":
      return {
        texto: "Espera unos segundos y vuelve a enviar el formulario. Si sigue sin funcionar, recarga la página.",
        tono: "aviso",
      };
    case "reintentar":
      return {
        texto: "No pudimos enviar el correo de confirmación. Intenta de nuevo en unos minutos.",
        tono: "aviso",
      };
    default:
      return null;
  }
}

const CASILLA = "h-6 w-6 shrink-0 accent-ink";

/** Círculo con un signo de exclamación, en latón oscuro (sin rojo). */
function IconoAviso() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 4.6v4.2M8 11.1v.3" />
    </svg>
  );
}
const ENLACE = "text-texto underline underline-offset-4";

/**
 * La inscripción se verifica en dos pasos: dejar el correo y confirmarlo desde el enlace que llega a ese correo.
 * Así nadie puede inscribir un correo ajeno. El paso actual lleva `aria-current="step"`.
 */
function Pasos({ enviado }: { enviado: boolean }) {
  const base = "flex items-start gap-3 rounded-badge px-3 py-2.5 text-sm leading-snug";
  const actual = "bg-fondo text-texto linea-fina";
  return (
    <ol aria-label="La inscripción se verifica en dos pasos" className="mb-6 grid gap-2 sm:grid-cols-2">
      <li aria-current={enviado ? undefined : "step"} className={`${base} ${enviado ? "text-texto-suave" : actual}`}>
        <span aria-hidden="true" className="contador pt-0.5">
          {enviado ? "✓" : "01"}
        </span>
        <span>
          <span className="sr-only">Paso 1 de 2{enviado ? ", hecho" : ""}: </span>
          Deja tu correo y acepta los textos
        </span>
      </li>
      <li aria-current={enviado ? "step" : undefined} className={`${base} ${enviado ? actual : "text-apoyo"}`}>
        <span aria-hidden="true" className="contador pt-0.5">
          02
        </span>
        <span>
          <span className="sr-only">Paso 2 de 2: </span>
          Confirma desde el enlace que te enviamos
        </span>
      </li>
    </ol>
  );
}

/**
 * Formulario con validación en el servidor; funciona también sin JavaScript. `marca` es la hora a la que el
 * servidor generó el formulario, firmada: el servidor descarta los envíos sin marca o demasiado rápidos.
 */
export function WaitlistForm({ marca }: { marca: string }) {
  const [estado, accion, pendiente] = useActionState(unirseAListaDeEspera, INICIAL);
  const errores = estado.estado === "invalida" ? estado.errores : {};
  const aviso = mensaje(estado);
  const enviado = estado.estado === "ok";
  // Si el envío no prosperó, el servidor devuelve lo escrito: React vacía el formulario al terminar la acción.
  const valores = "valores" in estado ? estado.valores : undefined;

  return (
    <form
      action={accion}
      noValidate
      data-estado={pendiente ? "enviando" : estado.estado}
      className="lista-formulario superficie relative rounded-card p-6 sm:p-8"
    >
      <Pasos enviado={enviado} />

      <label htmlFor="correo" className="micro text-texto">
        Tu correo
      </label>
      <input
        id="correo"
        name="correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={valores?.correo}
        placeholder="nombre@correo.cl"
        aria-invalid={errores.correo ? true : undefined}
        aria-describedby={errores.correo ? "correo-error" : "correo-pista"}
        className="mt-3 block w-full rounded-badge bg-papel px-4 py-3 text-base text-texto campo placeholder:text-apoyo"
      />
      {errores.correo ? (
        <p id="correo-error" className="mt-1.5 text-sm leading-5 font-medium text-texto">
          <span aria-hidden="true">⚠ </span>
          {errores.correo}
        </p>
      ) : (
        // Validación en línea sin JavaScript: el CSS la muestra con `:user-invalid` (tras escribir y salir del campo). Su
        // renglón está siempre reservado, para que al aparecer no mueva el botón bajo el clic. Es también la descripción
        // del campo (redactada para leerse bien antes y después de escribir): los lectores de pantalla la oyen sin enviar.
        <p id="correo-pista" className="campo-pista">
          <IconoAviso />
          Escribe un correo como nombre@correo.cl
        </p>
      )}

      <input type="hidden" name="tiempo" value={marca} />

      {/* Campo trampa para bots: oculto a la vista y al teclado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="sitio_web">No completar este campo</label>
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="mt-3 rounded-badge p-4 linea-fina">
        <legend className="micro px-1 text-texto">Antes de enviar</legend>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-texto">Lo esencial de las condiciones de uso</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-texto-suave">
            <li>Otea ofrece información y análisis. No constituye asesoría financiera.</li>
            <li>El contenido marcado «Datos de ejemplo» es ficticio: sirve para mostrar el servicio.</li>
            <li>Podemos equivocarnos: si pasa, lo corregimos a la vista, sin borrar la alerta original.</li>
            <li>El asistente de preguntas puede fallar: contrasta lo importante en las fuentes.</li>
          </ul>
          <p className="mt-3 text-sm">
            <Link href="/terminos" className={ENLACE}>
              Leer las condiciones de uso completas
            </Link>
          </p>
        </details>

        <div className="mt-4 flex items-start gap-3">
          <input
            id="condiciones"
            name="condiciones"
            type="checkbox"
            required
            defaultChecked={valores?.condiciones}
            aria-invalid={errores.condiciones ? true : undefined}
            aria-describedby={errores.condiciones ? "condiciones-error" : undefined}
            className={CASILLA}
          />
          <label htmlFor="condiciones" className="text-sm leading-relaxed text-texto-suave">
            Acepto las{" "}
            <Link href="/terminos" className={ENLACE}>
              condiciones de uso
            </Link>
            .
          </label>
        </div>
        {errores.condiciones ? (
          <p id="condiciones-error" className="mt-2 text-sm font-medium text-texto">
            <span aria-hidden="true">⚠ </span>
            {errores.condiciones}
          </p>
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          <input
            id="acepta"
            name="acepta"
            type="checkbox"
            required
            defaultChecked={valores?.acepta}
            aria-invalid={errores.acepta ? true : undefined}
            aria-describedby={errores.acepta ? "acepta-error" : undefined}
            className={CASILLA}
          />
          <label htmlFor="acepta" className="text-sm leading-relaxed text-texto-suave">
            Acepto que Otea guarde mi correo para avisarme del lanzamiento, según la{" "}
            <Link href="/privacidad" className={ENLACE}>
              política de privacidad
            </Link>
            .
          </label>
        </div>
        {errores.acepta ? (
          <p id="acepta-error" className="mt-2 text-sm font-medium text-texto">
            <span aria-hidden="true">⚠ </span>
            {errores.acepta}
          </p>
        ) : null}
      </fieldset>

      {/* Con éxito, el envoltorio recorta el botón a un círculo de 44 px (`clip-path`) y se dibuja el check. El nombre
          accesible no cambia: el aviso de abajo dice qué pasó. */}
      <div className="lista-enviar mt-6">
        <button
          type="submit"
          disabled={pendiente}
          data-magnetico
          className={buttonClasses("primary", "w-full disabled:opacity-70")}
        >
          <span className="boton-etiqueta">{pendiente ? "Enviando…" : "Unirme a la lista"}</span>
          <svg viewBox="0 0 24 24" className="boton-check" aria-hidden="true" focusable="false">
            <path d="M6.5 12.4 10.3 16.2 17.6 8.4" pathLength={1} />
          </svg>
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-4 min-h-[1.5rem] text-sm text-texto">
        {aviso ? aviso.texto : null}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-apoyo">
        Solo guardamos tu correo, la fecha y la versión de los textos que aceptaste. Verificamos la inscripción en dos
        pasos (tu correo y el enlace de confirmación) para que nadie inscriba un correo ajeno. Puedes darte de baja
        cuando quieras.
      </p>
    </form>
  );
}
