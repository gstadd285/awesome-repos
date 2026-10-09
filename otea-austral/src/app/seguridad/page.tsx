import type { Metadata } from "next";
import { Atmosphere } from "@/components/home/Atmosphere";
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
      <div className="relative isolate">
        <Atmosphere />
        <SiteHeader />
        <main id="contenido" className="pb-[120px]">
          <SecurityProfile contacto={env.SECURITY_CONTACT} />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
