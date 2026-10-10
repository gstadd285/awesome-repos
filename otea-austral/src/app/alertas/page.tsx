import type { Metadata } from "next";
import Link from "next/link";
import { AlertCard } from "@/components/alert-card/AlertCard";
import { ContentPage } from "@/components/layout/ContentPage";
import { repositorioAlertas } from "@/lib/alertas/instancia";
import type { AlertView } from "@/lib/domain/view";
import { logSecurityEvent } from "@/lib/security/log";

export const metadata: Metadata = {
  title: "Alertas",
  description:
    "Alertas publicadas por Otea Austral, con su confianza calculada desde las fuentes, correcciones y retractaciones. No constituye asesoría financiera.",
};

async function cargar(): Promise<{ alertas: AlertView[]; error: boolean }> {
  const repo = repositorioAlertas();
  if (!repo) return { alertas: [], error: false };
  try {
    return { alertas: await repo.publicas(), error: false };
  } catch {
    logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: "alertas_publicas" });
    return { alertas: [], error: true };
  }
}

export default async function AlertasPage() {
  const { alertas, error } = await cargar();
  return (
    <ContentPage
      numero="06"
      rotulo="Alertas"
      titulo="Alertas publicadas."
      intro={
        <p>
          Cada alerta muestra su confianza calculada desde las fuentes, sus correcciones con fecha y, si corresponde,
          su retractación: nada se borra en silencio. Información y análisis; no constituye asesoría financiera.
        </p>
      }
    >
      {error ? (
        <p role="alert" className="text-texto">
          No pudimos cargar las alertas. Intenta de nuevo en unos minutos.
        </p>
      ) : alertas.length === 0 ? (
        <p className="max-w-[680px] leading-relaxed text-texto-suave">
          Aún no hay alertas publicadas. Mientras tanto, puedes ver{" "}
          <Link href="/#ejemplos-titulo" className="text-texto underline underline-offset-4">
            cómo se ve una alerta
          </Link>{" "}
          o leer{" "}
          <Link href="/metodologia" className="text-texto underline underline-offset-4">
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
