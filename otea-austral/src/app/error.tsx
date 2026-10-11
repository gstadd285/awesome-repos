"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

/**
 * Fallo inesperado dentro de una página. Nunca muestra el mensaje del error:
 * en producción Next.js ya lo reemplaza por un texto genérico, y aquí tampoco
 * se imprime. La referencia (`digest`) permite al equipo encontrar el registro
 * del servidor sin exponer detalles.
 */
export default function ErrorPagina({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" className="fondo-luz mx-auto w-full max-w-[1440px] flex-1 px-6 py-[120px]">
      <p className="contador text-apoyo">Error — Algo salió mal</p>
      <h1 className="titular mt-6 max-w-[16ch] text-display text-texto">No pudimos cargar esta página.</h1>
      <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
        Fue un problema de nuestro lado. Puedes intentarlo de nuevo; si sigue fallando, vuelve más tarde.
      </p>
      {error.digest ? <p className="micro mt-4 text-apoyo">Referencia: {error.digest}</p> : null}
      <div className="mt-10 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className={buttonClasses("primary")}>
          Intentar de nuevo
        </button>
        <Link href="/" className={buttonClasses("outline")}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
