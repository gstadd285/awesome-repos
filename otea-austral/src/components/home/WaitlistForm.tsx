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
          ? "Listo. Modo de prueba: no enviamos correos; el enlace de confirmación queda en el registro del servidor."
          : "¡Gracias! Si el correo es válido, te llegará un mensaje con un enlace para confirmar tu inscripción (vence en 72 horas).",
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
    case "reintentar":
      return {
        texto: "No pudimos enviar el correo de confirmación. Intenta de nuevo en unos minutos.",
        tono: "aviso",
      };
    default:
      return null;
  }
}

/** Formulario con validación en el servidor; funciona también sin JavaScript. */
export function WaitlistForm() {
  const [estado, accion, pendiente] = useActionState(unirseAListaDeEspera, INICIAL);
  const errores = estado.estado === "invalida" ? estado.errores : {};
  const aviso = mensaje(estado);

  return (
    <form action={accion} noValidate className="superficie rounded-card p-6 sm:p-8">
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
        placeholder="nombre@correo.cl"
        aria-invalid={errores.correo ? true : undefined}
        aria-describedby={errores.correo ? "correo-error" : undefined}
        className="mt-3 block w-full rounded-badge bg-papel px-4 py-3 text-base text-texto shadow-[inset_0_0_0_1px_var(--color-linea-fuerte)] placeholder:text-apoyo focus:shadow-[inset_0_0_0_1px_var(--color-ink)] focus:outline-none"
      />
      {errores.correo ? (
        <p id="correo-error" className="mt-2 text-sm font-medium text-texto">
          <span aria-hidden="true">⚠ </span>
          {errores.correo}
        </p>
      ) : null}

      {/* Campo trampa para bots: oculto a la vista y al teclado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="sitio_web">No completar este campo</label>
        <input id="sitio_web" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-5 flex items-start gap-3">
        <input
          id="acepta"
          name="acepta"
          type="checkbox"
          required
          aria-invalid={errores.acepta ? true : undefined}
          aria-describedby={errores.acepta ? "acepta-error" : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
        />
        <label htmlFor="acepta" className="text-sm leading-relaxed text-texto-suave">
          Acepto que Otea guarde mi correo para avisarme del lanzamiento, según la{" "}
          <Link href="/privacidad" className="text-texto underline underline-offset-4">
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

      <button type="submit" disabled={pendiente} className={buttonClasses("primary", "mt-6 w-full disabled:opacity-70")}>
        {pendiente ? "Enviando…" : "Unirme a la lista"}
      </button>

      <p role="status" aria-live="polite" className="mt-4 min-h-[1.5rem] text-sm text-texto">
        {aviso ? aviso.texto : null}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-apoyo">
        Solo guardamos tu correo y la fecha de tu consentimiento. Te pediremos confirmarlo y puedes darte de
        baja cuando quieras.
      </p>
    </form>
  );
}
