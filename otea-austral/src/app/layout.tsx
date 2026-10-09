import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { connection } from "next/server";
import { env } from "@/lib/env";
import "./globals.css";

const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Otea Austral · Inteligencia de eventos para mercados",
    template: "%s · Otea Austral",
  },
  description:
    "Avisos de eventos globales y de los sectores y activos que podrían verse afectados, con nivel de confianza y fuentes. Información y análisis; no constituye asesoría financiera.",
  applicationName: "Otea Austral",
};

export const viewport: Viewport = {
  themeColor: "#070E1A",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP lleva un nonce por solicitud: todas las páginas se renderizan al pedirse.
  await connection();
  return (
    // data-scroll-behavior: al navegar entre páginas el salto es inmediato; el scroll suave
    // (globals.css) queda para los enlaces dentro de la misma página.
    <html
      lang="es-CL"
      data-scroll-behavior="smooth"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          className="sr-only rounded-pill bg-brass px-4 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
