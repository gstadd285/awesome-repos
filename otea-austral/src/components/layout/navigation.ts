/** Enlaces de navegación del pie y del menú móvil. */
export const NAV_PRINCIPAL = [
  { href: "/#como-funciona", texto: "Cómo funciona" },
  { href: "/#temas", texto: "Temas" },
  { href: "/alertas", texto: "Alertas" },
  { href: "/metodologia", texto: "Metodología" },
  { href: "/fuentes", texto: "Fuentes" },
] as const;

/** Cabecera de escritorio: solo lo esencial. «Temas» y «Seguridad» viven en el pie y en el menú. */
export const NAV_CABECERA = [
  { href: "/#como-funciona", texto: "Cómo funciona" },
  { href: "/alertas", texto: "Alertas" },
  { href: "/metodologia", texto: "Metodología" },
  { href: "/fuentes", texto: "Fuentes" },
] as const;

export const NAV_CONFIANZA = [
  { href: "/seguridad", texto: "Seguridad" },
  { href: "/privacidad", texto: "Privacidad" },
  { href: "/terminos", texto: "Términos" },
  { href: "/aviso-legal", texto: "Aviso legal" },
] as const;
