import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { DirectorEscena } from "@/components/motion/DirectorEscena";
import { MovimientoSync } from "@/components/motion/MovimientoSync";
import { ScriptMovimiento } from "@/components/motion/ScriptMovimiento";
import { env } from "@/lib/env";
import { SITIO } from "@/lib/site";
import "./_tipografias";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Otea Austral · Inteligencia de eventos para mercados",
    template: "%s · Otea Austral",
  },
  description: SITIO.descripcion,
  applicationName: SITIO.nombre,
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: SITIO.nombre,
    title: "Otea Austral · Inteligencia de eventos para mercados",
    description: SITIO.descripcion,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#E7E5E0",
  colorScheme: "light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP lleva un nonce por solicitud: todas las páginas se renderizan al pedirse.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // data-scroll-behavior: al navegar entre páginas el salto es inmediato; el scroll suave
    // (globals.css) queda para los enlaces dentro de la misma página.
    // suppressHydrationWarning: el script de cabecera añade `data-movimiento` y compañía antes de hidratar.
    <html lang="es-CL" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ScriptMovimiento nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <MovimientoSync />
        <DirectorEscena />
        <a href="#contenido" className="salto-contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
