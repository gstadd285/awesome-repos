"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoAccion } from "@/app/admin/alertas/acciones";
import { buttonClasses } from "@/components/ui/button";

type Accion = (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;

const INICIAL: EstadoAccion = { estado: "inicial" };

function BotonEnviar({ children, variante }: { children: ReactNode; variante: "primary" | "outline" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses(variante, "mt-4 disabled:opacity-70")}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

/**
 * Formulario de una acción del panel. Los campos ocultos (id, versión, CSRF)
 * llegan como hijos desde el servidor; si la acción falla, muestra los
 * motivos sin perder lo escrito.
 */
export function FormularioPanel({
  accion,
  boton,
  variante = "primary",
  titulo,
  className = "",
  children,
}: {
  accion: Accion;
  boton: string;
  variante?: "primary" | "outline" | "ghost";
  /** Nombre accesible del formulario. */
  titulo: string;
  className?: string;
  children?: ReactNode;
}) {
  const [estado, despachar] = useActionState(accion, INICIAL);
  return (
    <form action={despachar} aria-label={titulo} className={className}>
      {children}
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
      <BotonEnviar variante={variante}>{boton}</BotonEnviar>
    </form>
  );
}
