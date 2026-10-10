"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmarInscripcion, type EstadoConfirmacion } from "@/app/acciones/lista-de-espera";
import { buttonClasses } from "@/components/ui/button";

const INICIAL: EstadoConfirmacion = { estado: "inicial" };

/** Botón de confirmación: confirma con un POST, funciona también sin JavaScript. */
export function ConfirmForm({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(confirmarInscripcion, INICIAL);

  if (estado.estado === "confirmada") {
    return (
      <div role="status" className="superficie max-w-[560px] rounded-card p-6">
        <p className="titular text-xl text-texto">Inscripción confirmada.</p>
        <p className="mt-3 text-texto-suave">Gracias. Te avisaremos cuando abramos.</p>
        <Link href="/" className={buttonClasses("outline", "mt-6")}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="superficie max-w-[560px] rounded-card p-6">
      <input type="hidden" name="token" value={token} />
      <p className="text-texto-suave">
        Presiona el botón para confirmar que quieres recibir el aviso del lanzamiento en este correo.
      </p>
      <button type="submit" disabled={pendiente} className={buttonClasses("primary", "mt-6 disabled:opacity-70")}>
        {pendiente ? "Confirmando…" : "Confirmar inscripción"}
      </button>
      <p role="status" aria-live="polite" className="mt-4 min-h-[1.5rem] text-sm text-texto">
        {estado.estado === "invalida"
          ? "El enlace venció, ya se usó o está incompleto. Puedes volver a inscribirte desde la portada."
          : null}
      </p>
    </form>
  );
}
