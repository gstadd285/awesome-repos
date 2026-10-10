"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion, type EstadoAcceso } from "@/app/admin/acciones";
import { buttonClasses } from "@/components/ui/button";
import { CAMPO, ETIQUETA } from "./estilos";

const INICIAL: EstadoAcceso = { estado: "inicial" };

const MENSAJES: Record<EstadoAcceso["estado"], string | null> = {
  inicial: null,
  rechazado: "La frase o el código no son correctos. Si el código ya se usó, espera el siguiente.",
  limite: "Demasiados intentos. Espera 15 minutos antes de volver a probar.",
};

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses("primary", "mt-6 w-full disabled:opacity-70")}>
      {pending ? "Verificando…" : "Entrar"}
    </button>
  );
}

export function FormularioAcceso() {
  const [estado, despachar] = useActionState(iniciarSesion, INICIAL);
  const mensaje = MENSAJES[estado.estado];
  return (
    <form action={despachar} className="superficie mt-8 rounded-card p-6">
      <label htmlFor="frase" className={ETIQUETA}>
        Frase de acceso
      </label>
      <input
        id="frase"
        name="frase"
        type="password"
        autoComplete="current-password"
        required
        maxLength={256}
        className={CAMPO}
      />
      <label htmlFor="codigo" className={`${ETIQUETA} mt-5 block`}>
        Código de tu app de autenticación
      </label>
      <input
        id="codigo"
        name="codigo"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        className={`${CAMPO} tracking-[0.3em]`}
      />
      <Entrar />
      <p role="status" aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm text-texto">
        {mensaje}
      </p>
    </form>
  );
}
