import { env } from "@/lib/env";
import { buildSecurityTxt } from "@/lib/security/security-txt";

/** /.well-known/security.txt según RFC 9116. */
export function GET() {
  return new Response(
    buildSecurityTxt({ contacto: env.SECURITY_CONTACT, sitio: env.NEXT_PUBLIC_SITE_URL }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
