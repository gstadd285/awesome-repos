"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { emitirInvitacionAccion, type EstadoInvitacion } from "@/app/admin/invitaciones/acciones";
import { buttonClasses } from "@/components/ui/button";
import { AYUDA, CAMPO, ETIQUETA } from "./estilos";

const INICIAL: EstadoInvitacion = { estado: "inicial" };

function BotonEmitir() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses("primary", "mt-4 disabled:opacity-70")}>
      {pending ? "Guardando…" : "Emitir invitación"}
    </button>
  );
}

/**
 * Emitir una invitación. El código llega en la respuesta de la acción y se muestra **una sola vez**: no se guarda en el
 * navegador ni en la base (solo su HMAC), y al recargar la página desaparece. Los campos ocultos (CSRF) llegan del servidor.
 */
export function FormularioInvitacion({ dias, maximo, children }: { dias: number; maximo: number; children: ReactNode }) {
  const [estado, despachar] = useActionState(emitirInvitacionAccion, INICIAL);
  return (
    <form action={despachar} aria-label="Emitir invitación">
      {children}
      <label htmlFor="invitacion-alias" className={`${ETIQUETA} block`}>
        Alias
      </label>
      <input id="invitacion-alias" name="alias" required maxLength={40} autoComplete="off" spellCheck={false} className={CAMPO} />
      <p className={AYUDA}>Interno, para reconocerla (por ejemplo «anticipado-07»). Sin nombres ni correos.</p>
      <label htmlFor="invitacion-dias" className={`${ETIQUETA} mt-5 block`}>
        Vigencia (días)
      </label>
      <input id="invitacion-dias" name="dias" type="number" inputMode="numeric" min={1} max={maximo} defaultValue={dias} required className={CAMPO} />
      <p className={AYUDA}>De 1 a {maximo}. Vale para una sola cuenta.</p>
      {estado.estado === "error" ? (
        <div role="alert" className="mt-4 rounded-badge bg-fondo p-3 text-sm text-texto linea-fina">
          <p className="font-semibold">No se pudo completar la acción:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {estado.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {estado.estado === "emitida" ? (
        <div role="status" aria-label="Invitación emitida" className="mt-4 rounded-badge bg-fondo p-3 text-sm text-texto linea-fina">
          <p className="font-semibold">Invitación «{estado.alias}» emitida. Vence el {estado.vence}.</p>
          <p className="mt-2 font-mono text-lg" data-codigo-invitacion>
            {estado.codigo}
          </p>
          <p className="mt-2 leading-relaxed text-texto-suave">
            Cópiala ahora y envíala por un canal privado: no se vuelve a mostrar (solo guardamos su huella). Se crea la
            cuenta en /cuenta/crear.
          </p>
        </div>
      ) : null}
      <BotonEmitir />
    </form>
  );
}
