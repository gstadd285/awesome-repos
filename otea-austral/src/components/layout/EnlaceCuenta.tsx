import Link from "next/link";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { cuentasAbiertas } from "@/lib/env";

type Props = {
  /** Dónde se dibuja: un enlace de la cabecera de escritorio, un elemento del menú móvil o los elementos del pie. */
  variante: "cabecera" | "menu" | "pie";
  /** Ruta de la página actual, para marcarla con `aria-current`. */
  actual?: string;
  className: string;
};

/**
 * Entrada a la cuenta: «Entrar» y «Crear cuenta», o «Mi cuenta» si ya hay una sesión. Mientras las cuentas están cerradas no
 * muestra nada (no se deja un enlace a algo que todavía no existe). Es solo comodidad: cada página de la cuenta exige su
 * propia sesión, así que ocultar o mostrar este enlace no es una barrera de seguridad.
 */
export async function EnlaceCuenta({ variante, actual, className }: Props) {
  if (!cuentasAbiertas()) return null;
  const sesion = await sesionCuenta();
  const marca = (ruta: string) => (actual === ruta ? ("page" as const) : undefined);

  if (sesion) {
    const enCuenta = actual === "/cuenta" || actual?.startsWith("/cuenta/") ? ("page" as const) : undefined;
    const enlace = (
      <Link href="/cuenta" aria-current={enCuenta} className={className}>
        Mi cuenta
      </Link>
    );
    return variante === "pie" ? <li>{enlace}</li> : enlace;
  }

  if (variante === "pie") {
    return (
      <>
        <li>
          <Link href="/cuenta/entrar" aria-current={marca("/cuenta/entrar")} className={className}>
            Entrar
          </Link>
        </li>
        <li>
          <Link href="/cuenta/crear" aria-current={marca("/cuenta/crear")} className={className}>
            Crear cuenta
          </Link>
        </li>
      </>
    );
  }
  return (
    <Link href="/cuenta/entrar" aria-current={marca("/cuenta/entrar")} className={className}>
      Entrar
    </Link>
  );
}
