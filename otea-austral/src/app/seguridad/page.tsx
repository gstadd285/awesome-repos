import type { Metadata } from "next";
import { PageTransition } from "@/components/layout/PageTransition";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SecurityProfile } from "@/components/security/SecurityProfile";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Seguridad",
  description:
    "Cómo protegemos Otea Austral, según el Marco de Ciberseguridad (CSF) 2.0 del NIST, y cómo reportar una vulnerabilidad.",
};

export default function SeguridadPage() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="fondo-luz pb-[120px]">
        <PageTransition>
          <SecurityProfile contacto={env.SECURITY_CONTACT} />
        </PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}
