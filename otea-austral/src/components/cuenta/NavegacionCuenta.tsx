import Link from "next/link";
import { salirAccion } from "@/app/acciones/cuenta";

const SECCIONES = [
  { clave: "perfil", href: "/cuenta", texto: "Perfil" },
  { clave: "seguridad", href: "/cuenta/seguridad", texto: "Seguridad" },
  { clave: "datos", href: "/cuenta/datos", texto: "Tus datos" },
] as const;

export type SeccionCuenta = (typeof SECCIONES)[number]["clave"];

/** Pestañas de la cuenta y el botón «Salir» (que cierra la sesión también en el servidor). */
export function NavegacionCuenta({ actual, csrf }: { actual: SeccionCuenta; csrf: string }) {
  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-linea pb-4">
      <nav aria-label="Tu cuenta">
        <ul className="flex flex-wrap gap-2">
          {SECCIONES.map((s) => (
            <li key={s.clave}>
              <Link
                href={s.href}
                aria-current={s.clave === actual ? "page" : undefined}
                className="inline-flex rounded-pill px-4 py-2 text-sm font-medium text-texto-suave transition-colors hover:text-texto aria-[current=page]:bg-papel-alto aria-[current=page]:text-texto aria-[current=page]:linea-fina"
              >
                {s.texto}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form action={salirAccion}>
        <input type="hidden" name="csrf" value={csrf} />
        <button
          type="submit"
          className="rounded-pill px-4 py-2 text-sm font-medium text-texto shadow-[inset_0_0_0_1px_var(--color-linea-fuerte)] hover:bg-papel-alto"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
