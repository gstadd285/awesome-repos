import localFont from "next/font/local";

/**
 * Las tres familias del sitio, **dentro del repositorio** (`next/font/local`): la compilación no sale a internet. Son los
 * mismos archivos que servía Google Fonts a `next/font/google` (mismos bytes, licencia OFL 1.1; aviso en
 * `AVISOS-DE-TERCEROS.md`), con los mismos pesos, subconjuntos (latin y latin-ext), variables CSS y `display: swap`.
 *
 * Cada subconjunto es una llamada propia porque `declarations` vale para todas las caras de una llamada: así cada archivo
 * lleva su `unicode-range` y el navegador baja el de latin-ext solo si la página usa uno de esos caracteres. Las de latin-ext
 * van antes (como en la hoja de Google): donde los rangos se pisan, gana la cara de latin, que se declara después.
 *
 * Los respaldos métricos («… Fallback», con los mismos valores que calculaba `next/font/google`) y las variables `--font-*` están
 * en `globals.css` (bloque «Tipografías»).
 */

// next/font exige literales en sus opciones: los rangos van escritos en cada llamada (latin y latin-ext de Google Fonts).

// Source Serif 4 (variable, wght 200–900) declarada en 400 y 500, como la pedía el sitio. Conserva la precarga: la usa la
// entrada del héroe (primer pintado).
const serifExt = localFont({
  src: [
    { path: "./source-serif-4-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./source-serif-4-latin-ext.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Source Serif 4'" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
const serif = localFont({
  src: [
    { path: "./source-serif-4-latin.woff2", weight: "400", style: "normal" },
    { path: "./source-serif-4-latin.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Source Serif 4'" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

// Inter variable: texto, interfaz y titulares en mayúsculas.
const sansExt = localFont({
  src: [{ path: "./inter-latin-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Inter'" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
const sans = localFont({
  src: [{ path: "./inter-latin.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Inter'" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

// Contadores y cotas: fuera de la ruta crítica (21,5 KB menos antes del primer pintado).
const monoExt = localFont({
  src: [{ path: "./jetbrains-mono-latin-ext-400.woff2", weight: "400", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'JetBrains Mono'" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
const mono = localFont({
  src: [{ path: "./jetbrains-mono-latin-400.woff2", weight: "400", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'JetBrains Mono'" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

/**
 * Las seis llamadas, para que ninguna quede fuera del bundle. Las variables `--font-*` no salen de aquí: con Turbopack la familia
 * de `variable` es el nombre de la constante («serif»), no la de `declarations`; van en `globals.css`, como las escribía
 * `next/font/google`.
 */
export const TIPOGRAFIAS = [serifExt, serif, sansExt, sans, monoExt, mono] as const;
