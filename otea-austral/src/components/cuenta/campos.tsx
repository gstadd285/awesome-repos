"use client";

import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoFormulario } from "@/app/acciones/cuenta";
import { buttonClasses } from "@/components/ui/button";

/**
 * Piezas comunes de los formularios de la cuenta. Todos funcionan también sin JavaScript (son formularios de Server
 * Actions); con JavaScript añaden el aviso de «enviando…» y el botón de mostrar la contraseña. Los errores de cada campo
 * llegan del servidor y se enlazan con `aria-describedby`, así que un lector de pantalla los anuncia al enfocar el campo.
 */
export const INICIAL: EstadoFormulario = { estado: "inicial" };

/** Estado de una acción más lo que necesitan los campos: el error y el valor devuelto de cada uno. */
export function useFormularioCuenta(accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>) {
  const [estado, despachar, pendiente] = useActionState(accion, INICIAL);
  return {
    estado,
    despachar,
    pendiente,
    error: (nombre: string): string | undefined => estado.errores?.[nombre as keyof NonNullable<EstadoFormulario["errores"]>],
    texto: (nombre: string): string | undefined => {
      const v = estado.valores?.[nombre];
      return typeof v === "string" ? v : undefined;
    },
    marcada: (nombre: string): boolean | undefined => {
      const v = estado.valores?.[nombre];
      return typeof v === "boolean" ? v : undefined;
    },
  };
}

/** ¿Ya hidratamos? Sirve para mostrar solo con JavaScript lo que sin él no haría nada. */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export const CLASE_CAMPO =
  "mt-3 block w-full rounded-badge bg-papel px-4 py-3 text-base text-texto shadow-[inset_0_0_0_1px_var(--color-linea-fuerte)] placeholder:text-apoyo focus:shadow-[inset_0_0_0_1px_var(--color-ink)] focus:outline-none aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-ink)]";
export const CLASE_ETIQUETA = "micro text-texto";
export const CLASE_ENLACE = "text-texto underline underline-offset-4";
export const CLASE_CASILLA = "h-6 w-6 shrink-0 accent-ink";

export function ErrorDeCampo({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-2 text-sm font-medium text-texto">
      <span aria-hidden="true">⚠ </span>
      {children}
    </p>
  );
}

type PropsCampo = {
  nombre: string;
  etiqueta: string;
  tipo?: "text" | "email" | "password";
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric";
  valor?: string;
  error?: string;
  ayuda?: ReactNode;
  requerido?: boolean;
  maxLength?: number;
  placeholder?: string;
  pattern?: string;
  className?: string;
  /** Texto opcional que acompaña a la etiqueta (por ejemplo «(opcional)»). */
  nota?: string;
};

export function Campo({
  nombre,
  etiqueta,
  tipo = "text",
  autoComplete,
  inputMode,
  valor,
  error,
  ayuda,
  requerido = true,
  maxLength,
  placeholder,
  pattern,
  className = "",
  nota,
}: PropsCampo) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
        {nota ? <span className="ml-2 font-normal normal-case tracking-normal text-apoyo">{nota}</span> : null}
      </label>
      <input
        id={id}
        name={nombre}
        type={tipo}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={requerido}
        maxLength={maxLength}
        placeholder={placeholder}
        pattern={pattern}
        defaultValue={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe}
        className={CLASE_CAMPO}
      />
      {ayuda ? (
        <p id={idAyuda} className="mt-2 text-sm leading-relaxed text-apoyo">
          {ayuda}
        </p>
      ) : null}
      <ErrorDeCampo id={idError}>{error}</ErrorDeCampo>
    </div>
  );
}

/**
 * Contraseña con botón para mostrarla. Sin JavaScript el botón no aparece (no haría nada). La contraseña nunca vuelve
 * del servidor: si el envío no prospera, el campo queda vacío.
 */
export function CampoClave({
  nombre,
  etiqueta,
  nueva = false,
  error,
  ayuda,
  className = "",
}: {
  nombre: string;
  etiqueta: string;
  /** `true` para elegir una contraseña nueva (el gestor de contraseñas la sugiere); `false` para escribir la actual. */
  nueva?: boolean;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const hidratado = useHidratado();
  const [visible, setVisible] = useState(false);
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          name={nombre}
          type={visible ? "text" : "password"}
          autoComplete={nueva ? "new-password" : "current-password"}
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={128}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          className={`${CLASE_CAMPO} ${hidratado ? "pr-24" : ""}`}
        />
        {hidratado ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-pill px-3 py-2 text-sm font-medium text-texto-suave hover:text-texto"
          >
            {visible ? "Ocultar" : "Mostrar"}
            <span className="sr-only"> la contraseña</span>
          </button>
        ) : null}
      </div>
      {ayuda ? (
        <p id={idAyuda} className="mt-2 text-sm leading-relaxed text-apoyo">
          {ayuda}
        </p>
      ) : null}
      <ErrorDeCampo id={idError}>{error}</ErrorDeCampo>
    </div>
  );
}

export function Casilla({
  nombre,
  marcada,
  error,
  children,
  requerida = true,
  className = "",
}: {
  nombre: string;
  marcada?: boolean;
  error?: string;
  children: ReactNode;
  requerida?: boolean;
  className?: string;
}) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={nombre}
          type="checkbox"
          required={requerida}
          defaultChecked={marcada}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className={CLASE_CASILLA}
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-texto-suave">
          {children}
        </label>
      </div>
      <ErrorDeCampo id={idError}>{error}</ErrorDeCampo>
    </div>
  );
}

export function BotonEnviar({
  children,
  enviando = "Enviando…",
  variante = "primary",
  className = "",
}: {
  children: ReactNode;
  enviando?: string;
  variante?: "primary" | "outline" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses(variante, `disabled:opacity-70 ${className}`)}>
      {pending ? enviando : children}
    </button>
  );
}

/**
 * Resultado de la acción, en una región que los lectores de pantalla anuncian: los errores como alerta (con el enlace
 * para pedir otro correo si hace falta) y los avisos de éxito como estado.
 */
export function AvisoDelFormulario({ estado, className = "" }: { estado: EstadoFormulario; className?: string }) {
  return (
    <div aria-live="polite" className={`min-h-[1.5rem] text-sm text-texto ${className}`}>
      {estado.estado === "error" && estado.mensaje ? (
        <p role="alert" className="font-medium">
          <span aria-hidden="true">⚠ </span>
          {estado.mensaje}
        </p>
      ) : null}
      {estado.estado === "enviado" && estado.mensaje ? (
        <p className="rounded-badge bg-fondo p-3 leading-relaxed linea-fina">{estado.mensaje}</p>
      ) : null}
    </div>
  );
}

/** Campo trampa para bots, oculto a la vista y al teclado (igual que en la lista de espera). */
export function CampoTrampa() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="sitio_web_cuenta">No completar este campo</label>
      <input id="sitio_web_cuenta" name="sitio_web" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

/** Enlace de texto subrayado, igual en todos los formularios. */
export function EnlaceTexto({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={CLASE_ENLACE}>
      {children}
    </Link>
  );
}

/** Tarjeta de un formulario. */
export const CLASE_TARJETA = "superficie rounded-card p-6 sm:p-8";

/** Ayuda para elegir una contraseña, la misma en todos los formularios que piden una nueva. */
export const AYUDA_CLAVE_NUEVA =
  "Al menos 12 caracteres. Una frase de cuatro palabras sin relación entre sí es larga y fácil de recordar. No uses tu correo, tu nombre ni una contraseña que ya uses en otro sitio.";

/**
 * Los dos pasos de un trámite que se verifica por correo: dejar el correo y seguir el enlace que llega a él. El paso
 * actual lleva `aria-current="step"`.
 */
export function Pasos({ actual, etiqueta, uno, dos }: { actual: 1 | 2; etiqueta: string; uno: string; dos: string }) {
  const base = "flex items-start gap-3 rounded-badge px-3 py-2.5 text-sm leading-snug";
  const activo = "bg-fondo text-texto linea-fina";
  return (
    <ol aria-label={etiqueta} className="mb-6 grid gap-2 sm:grid-cols-2">
      <li aria-current={actual === 1 ? "step" : undefined} className={`${base} ${actual === 1 ? activo : "text-texto-suave"}`}>
        <span aria-hidden="true" className="contador pt-0.5">
          {actual === 1 ? "01" : "✓"}
        </span>
        <span>
          <span className="sr-only">Paso 1 de 2{actual === 2 ? ", hecho" : ""}: </span>
          {uno}
        </span>
      </li>
      <li aria-current={actual === 2 ? "step" : undefined} className={`${base} ${actual === 2 ? activo : "text-apoyo"}`}>
        <span aria-hidden="true" className="contador pt-0.5">
          02
        </span>
        <span>
          <span className="sr-only">Paso 2 de 2: </span>
          {dos}
        </span>
      </li>
    </ol>
  );
}
