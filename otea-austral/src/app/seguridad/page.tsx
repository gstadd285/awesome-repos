import type { Metadata } from "next";
import { SecurityProfile } from "@/components/security/SecurityProfile";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Seguridad",
  description:
    "Cómo protegemos Otea Austral, según el Marco de Ciberseguridad (CSF) 2.0 del NIST, y cómo reportar una vulnerabilidad.",
};

export default function SeguridadPage() {
  return <SecurityProfile contacto={env.SECURITY_CONTACT} />;
}
