import type { Metadata } from "next";
import Link from "next/link";
import { AlertCard } from "@/components/alert-card/AlertCard";
import { ContentPage } from "@/components/layout/ContentPage";
import { Radar } from "@/components/piezas/Radar";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import { alertasVisibles } from "@/lib/alertas/visibles";
import { sesionCuenta } from "@/lib/cuentas/acceso";
import { env } from "@/lib/env";

// Metadatos fijos: nunca salen de una alerta (sin sesión no puede asomar nada real, tampoco en el título o la vista previa).
export const metadata: Metadata = {
  title: "Alertas",
  description:
    "Alertas de Otea Austral, con su confianza calculada desde las fuentes, correcciones y retractaciones. Las reales, durante el acceso anticipado, solo con una cuenta por invitación. No constituye asesoría financiera.",
};

const AVISO = "mb-8 max-w-[680px] rounded-badge bg-papel-alto p-4 text-sm leading-relaxed text-texto linea-fina";

/**
 * Alertas (acceso privado, `docs/alertas-reales.md` §6). La página lee la cookie de la cuenta, así que es dinámica y
 * Next.js la sirve con `Cache-Control: private, no-store`: ninguna caché compartida guarda la versión con sesión.
 */
export default async function AlertasPage() {
  const sesion = await sesionCuenta();
  const visibles = await alertasVisibles(sesion, repositorioAlertas());
  const { alertas } = visibles;
  const privado = visibles.acceso === "privado";
  const error = privado && visibles.error;
  const rotulo = error
    ? "Sin datos"
    : !privado
      ? `${alertas.length} de ejemplo`
      : alertas.length
        ? `${alertas.length} ${alertas.length === 1 ? "publicada" : "publicadas"}`
        : "Sin alertas publicadas";

  return (
    <ContentPage
      ruta="/alertas"
      rotulo="Alertas"
      titulo="Alertas publicadas."
      pieza={<Radar rotulo={rotulo} />}
      intro={
        <p>
          Cada alerta muestra su confianza calculada desde las fuentes, sus correcciones con fecha y, si corresponde,
          su retractación: nada se borra en silencio. Información y análisis; no constituye asesoría financiera.
        </p>
      }
    >
      {privado ? (
        <div role="note" aria-label="Acceso anticipado privado" className={AVISO}>
          <p className="font-semibold">Acceso anticipado privado · textos legales en revisión.</p>
          <p className="mt-1 text-texto-suave">
            Ves las alertas reales porque entraste con tu cuenta; sin sesión, esta página muestra solo ejemplos.
          </p>
        </div>
      ) : (
        <AvisoPublico />
      )}

      {error ? (
        <p role="alert" className="text-texto">
          No pudimos cargar las alertas. Intenta de nuevo en unos minutos.
        </p>
      ) : alertas.length === 0 ? (
        <p className="max-w-[680px] leading-relaxed text-texto-suave">
          Aún no hay alertas publicadas. Mientras tanto, puedes ver{" "}
          <Link href="/#ejemplos-titulo" className="enlace text-texto">
            cómo se ve una alerta
          </Link>{" "}
          o leer{" "}
          <Link href="/metodologia" className="enlace text-texto">
            cómo las verificamos
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-8 lg:grid-cols-2 lg:items-start">
          {alertas.map((a) => (
            <li key={a.id}>
              <AlertCard alerta={a} nivelTitulo={2} />
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  );
}

/** Sin sesión: solo ejemplos, y cómo se llega a lo real según el modo de las cuentas. */
function AvisoPublico() {
  const modo = env.CUENTAS_MODO;
  const abiertas = modo === "abiertas" || modo === "memoria";
  return (
    <div role="note" aria-label="Acceso a las alertas reales" className={AVISO}>
      <p className="font-semibold">
        {abiertas ? "Las alertas reales se ven con tu cuenta." : "Las alertas reales son por invitación."}
      </p>
      <p className="mt-1 text-texto-suave">
        {abiertas
          ? "Entra o crea tu cuenta para verlas. Aquí abajo, alertas de ejemplo para ver cómo funcionan."
          : "Durante el acceso anticipado, las alertas reales se ven solo con una cuenta creada por invitación. Aquí abajo, alertas de ejemplo para ver cómo funcionan."}
      </p>
      <p className="mt-2">
        {modo === "cerradas" ? (
          <Link href="/#lista-de-espera" className="enlace text-texto">
            Unirme a la lista de espera
          </Link>
        ) : (
          <>
            <Link href="/cuenta/entrar" className="enlace text-texto">
              Entrar
            </Link>
            {" · "}
            <Link href="/cuenta/crear" className="enlace text-texto">
              {modo === "invitacion" ? "Crear mi cuenta con la invitación" : "Crear una cuenta"}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
