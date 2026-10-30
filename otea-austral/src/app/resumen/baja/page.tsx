import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/layout/ContentPage";
import { buttonClasses } from "@/components/ui/button";
import { bajaResumenDisponible } from "@/lib/env";
import { RUTA_BAJA } from "@/lib/resumen/correo";
import { tokenDeBaja } from "@/lib/resumen/baja";

export const metadata: Metadata = { title: "Dejar el resumen diario", robots: { index: false, follow: false } };

const ESTADOS = {
  listo: { titulo: "Listo.", texto: "Ya no recibirás el resumen diario. Si cambias de idea, vuelve a pedirlo desde tu perfil." },
  invalido: {
    titulo: "Enlace no válido.",
    texto: "El enlace venció o ya se usó. Si sigues recibiendo el resumen, desmarca la casilla en tu perfil.",
  },
  limite: { titulo: "Demasiados intentos.", texto: "Espera unos minutos y vuelve a abrir el enlace del correo." },
  error: { titulo: "No pudimos completarlo.", texto: "Vuelve a abrir el enlace del correo en unos minutos, o desmarca la casilla en tu perfil." },
} as const;

/**
 * Dejar el resumen diario (`docs/alertas-reales.md` §7). Abrir el enlace del correo **no cambia nada**: la página pide
 * confirmar con un botón, que hace el POST de la baja de un clic (`/api/resumen/baja`). Sin sesión: el token del correo es
 * la credencial. Sin base de datos, la página no existe (como la ruta).
 */
export default async function BajaResumenPage({ searchParams }: PageProps<"/resumen/baja">) {
  if (!bajaResumenDisponible()) notFound();
  const { t, estado } = await searchParams;
  const token = tokenDeBaja(Array.isArray(t) ? t[0] : t);
  const resultado = typeof estado === "string" && estado in ESTADOS ? ESTADOS[estado as keyof typeof ESTADOS] : null;

  if (resultado) {
    return (
      <ContentPage ruta="/resumen/baja" rotulo="Resumen diario" titulo={resultado.titulo} intro={<p>{resultado.texto}</p>}>
        <Link href="/cuenta" className={buttonClasses("outline")}>
          Ir a mi perfil
        </Link>
      </ContentPage>
    );
  }
  if (!token) {
    return (
      <ContentPage
        ruta="/resumen/baja"
        rotulo="Resumen diario"
        titulo="Dejar el resumen diario."
        intro={<p>Abre el enlace que trae cada correo del resumen, o desmarca la casilla en tu perfil.</p>}
      >
        <Link href="/cuenta" className={buttonClasses("outline")}>
          Ir a mi perfil
        </Link>
      </ContentPage>
    );
  }
  return (
    <ContentPage
      ruta="/resumen/baja"
      rotulo="Resumen diario"
      titulo="¿Dejar el resumen diario?"
      intro={<p>Dejarás de recibir por correo el resumen de las alertas publicadas en tus temas. Tu cuenta y tus temas no cambian.</p>}
    >
      {/* Un formulario HTML corriente: funciona sin JavaScript y el token viaja en la dirección, como en la baja de un clic. */}
      <form method="post" action={`${RUTA_BAJA}?t=${token}`} aria-label="Dejar el resumen diario">
        <input type="hidden" name="List-Unsubscribe" value="One-Click" />
        <button type="submit" className={buttonClasses("primary")}>
          Dejar de recibirlo
        </button>
      </form>
    </ContentPage>
  );
}
