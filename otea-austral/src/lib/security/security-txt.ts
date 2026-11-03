import { parseHttpsUrl } from "@/lib/domain/url";

/**
 * Vencimiento del security.txt (RFC 9116 exige `Expires`, idealmente a menos
 * de un año). Renovar antes de esta fecha: una prueba falla si vence.
 */
export const SECURITY_TXT_EXPIRES = "2027-04-01T00:00:00.000Z";

type Opciones = {
  contacto: string;
  /** URL base del sitio; `Canonical` y `Policy` solo se publican si es https. */
  sitio: string;
  expira?: string;
};

/** Contenido de /.well-known/security.txt (NIST CSF ID.RA-08). */
export function buildSecurityTxt({ contacto, sitio, expira = SECURITY_TXT_EXPIRES }: Opciones): string {
  const lineas = [
    "# Otea Austral: cómo reportar una vulnerabilidad de forma privada.",
    `Contact: ${contacto}`,
    `Expires: ${expira}`,
    "Preferred-Languages: es, en",
  ];
  const base = parseHttpsUrl(sitio);
  if (base) {
    lineas.push(`Canonical: ${new URL("/.well-known/security.txt", base).href}`);
    lineas.push(`Policy: ${new URL("/seguridad#reportar", base).href}`);
  }
  return `${lineas.join("\n")}\n`;
}

/** Cómo mostrar el canal de contacto en la página pública. */
export function describirContacto(contacto: string): { href: string; texto: string; externo: boolean } {
  if (contacto.startsWith("mailto:")) {
    return { href: contacto, texto: contacto.slice("mailto:".length), externo: false };
  }
  const url = parseHttpsUrl(contacto);
  if (url?.hostname === "github.com") {
    return { href: url.href, texto: "formulario privado de GitHub", externo: true };
  }
  return { href: url?.href ?? "/.well-known/security.txt", texto: url?.hostname ?? "security.txt", externo: Boolean(url) };
}
