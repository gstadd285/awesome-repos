import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { CLASE_TARJETA } from "./campos";

/** Lo que se ve mientras las cuentas están cerradas (aún no se guarda nada): honesto y con una salida. */
export function CuentasCerradas() {
  return (
    <div className={`${CLASE_TARJETA} max-w-[560px]`} role="note">
      <p className="titular text-xl text-texto">Las cuentas abren junto con el lanzamiento.</p>
      <p className="mt-3 leading-relaxed text-texto-suave">
        Por ahora no guardamos correos ni contraseñas. Si quieres enterarte cuando abramos, déjanos tu correo en la lista de espera.
      </p>
      <Link href="/#lista-de-espera" className={buttonClasses("primary", "mt-6")}>
        Unirme a la lista de espera
      </Link>
    </div>
  );
}

/** Aviso de arriba de una página, para lo que pasó en la anterior (salir, restablecer…). */
export function Banner({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-6 max-w-[560px] rounded-badge bg-papel-alto p-4 text-sm leading-relaxed text-texto linea-fina">
      {children}
    </p>
  );
}

/** Mensajes fijos que llegan por `?aviso=`: solo estos textos, nunca lo que traiga la dirección. */
const AVISOS: Record<string, string> = {
  restablecida: "Tu contraseña cambió y cerramos todas tus sesiones. Entra con la nueva.",
  salida: "Cerraste tu sesión.",
  venció: "La verificación venció. Entra de nuevo.",
  bienvenida: "Tu cuenta está lista. Ya iniciaste sesión.",
  recuperacion: "Entraste con un código de recuperación y ya no sirve. Revisa cuántos te quedan y, si son pocos, genera códigos nuevos.",
};

/** El texto de un aviso, o `undefined` si el valor de la dirección no es uno de los conocidos (ni un nombre heredado como «constructor»). */
export function textoDeAviso(valor: string | string[] | undefined): string | undefined {
  const clave = Array.isArray(valor) ? valor[0] : valor;
  return typeof clave === "string" && Object.hasOwn(AVISOS, clave) ? AVISOS[clave] : undefined;
}

/** Un apartado de las páginas de la cuenta: título a la izquierda y el contenido a la derecha (como los apartados legales, sin número). */
export function SeccionCuenta({
  id,
  titulo,
  children,
  descripcion,
  primera = false,
}: {
  id: string;
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** La primera de la página ya queda bajo la línea de las pestañas: sin otra línea ni espacio de más. */
  primera?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={`grid gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] ${primera ? "pt-0" : "border-t border-linea"}`}>
      <div>
        <h2 id={id} className="titular text-xl text-texto">
          {titulo}
        </h2>
        {descripcion ? <div className="mt-3 max-w-[40ch] text-sm leading-relaxed text-texto-suave">{descripcion}</div> : null}
      </div>
      <div className="min-w-0 max-w-[720px]">{children}</div>
    </section>
  );
}

/** Para cuando la base no respondió y no hay nada que mostrar: sin detalles técnicos. */
export function SinDatos() {
  return (
    <p role="alert" className="max-w-[560px] rounded-badge bg-papel-alto p-4 text-sm leading-relaxed text-texto linea-fina">
      No pudimos cargar esta información. Inténtalo de nuevo en un momento.
    </p>
  );
}

/** Lo esencial de qué se guarda, a la vista antes de crear la cuenta (el detalle completo está en «Tus datos» y en la privacidad). */
export function ResumenDeDatos() {
  return (
    <aside aria-labelledby="resumen-datos" className="self-start rounded-card bg-papel-alto p-6 linea-fina">
      <h2 id="resumen-datos" className="titular text-lg text-texto">
        Qué guardamos de ti
      </h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-texto-suave">
        <li>
          Tu <strong className="font-semibold text-texto">correo</strong>, cifrado, y tu <strong className="font-semibold text-texto">contraseña</strong>, solo
          como un hash que nadie puede leer.
        </li>
        <li>Los temas que eliges y, si quieres, tu nombre.</li>
        <li>Tu dirección IP no se guarda en tu cuenta.</li>
        <li>Desde tu perfil puedes descargar tus datos o eliminar la cuenta cuando quieras.</li>
      </ul>
      <p className="mt-4 text-sm text-apoyo">
        El detalle está en la{" "}
        <Link href="/privacidad" className="enlace text-texto">
          política de privacidad
        </Link>
        .
      </p>
    </aside>
  );
}
