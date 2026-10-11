"use client";

import "./globals.css";

/**
 * Fallo en el diseño raíz: reemplaza al layout, por eso define su propio
 * `<html>` y `<body>` y usa solo lo mínimo (sin cabecera ni pie, que podrían
 * ser la causa del fallo). Como en `error.tsx`, no muestra el mensaje del error.
 */
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-CL">
      <body className="flex min-h-dvh flex-col">
        <main className="fondo-luz mx-auto w-full max-w-[1440px] flex-1 px-6 py-[120px]">
          <title>Error · Otea Austral</title>
          <p className="contador text-apoyo">Error — Algo salió mal</p>
          <h1 className="titular mt-6 max-w-[16ch] text-display text-texto">No pudimos cargar el sitio.</h1>
          <p className="mt-6 max-w-[520px] leading-relaxed text-texto-suave">
            Fue un problema de nuestro lado. Puedes intentarlo de nuevo; si sigue fallando, vuelve más tarde.
          </p>
          {error.digest ? <p className="micro mt-4 text-apoyo">Referencia: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            className="micro corchetes mt-10 font-semibold text-texto hover:text-brass-deep"
          >
            Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
