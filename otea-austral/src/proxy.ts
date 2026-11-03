import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { destinoHttps } from "@/lib/security/https";

/** Fuerza https y genera un nonce por solicitud para aplicar la CSP estricta. */
export function proxy(request: NextRequest) {
  const destino = destinoHttps({
    reenviado: request.headers.get("x-forwarded-proto"),
    ruta: request.nextUrl.pathname,
    busqueda: request.nextUrl.search,
    sitio: env.NEXT_PUBLIC_SITE_URL,
    produccion: env.NODE_ENV === "production" && env.HTTPS_FORZADO === "1",
  });
  if (destino) return NextResponse.redirect(destino, 308);

  const nonce = generateNonce();
  const csp = buildCsp(nonce, { dev: env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image|icons/|brand/|manifest.webmanifest|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
