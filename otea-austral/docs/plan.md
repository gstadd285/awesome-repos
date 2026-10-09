# Plan de trabajo · Otea Austral

El trabajo total reúne los dos encargos: **(1)** el MVP inicial (portada, `AlertCard`, lista de
espera, páginas legales, SEO, seguridad) y **(2)** el sistema de fuentes y respaldo de alertas. Se
divide en tres tercios de tamaño parecido. El primero construye los cimientos: el modelo de dominio y
las reglas se hicieron antes para no rehacer la `AlertCard` después.

## Tercio 1 · Cimientos ✅

- [x] Proyecto Next.js 16 (App Router) + TypeScript + Tailwind v4 + Zod + Vitest, dependencias con
      versión exacta.
- [x] `CLAUDE.md`, `README.md`, `SECURITY.md`, `.env.example`, `docs/referencia-estilo.md`.
- [x] Tokens de diseño en `@theme` con verificación automática de contraste AA.
- [x] Marca: emblema claro y oscuro, logo, favicon y base SVG para íconos PWA.
- [x] Fuentes autoalojadas (Source Serif 4, Inter, JetBrains Mono).
- [x] Modelo de datos completo en Zod: `Source`, `AlertSource`, `Alert`, `AlertAudit`, `Correction`.
- [x] Reglas de negocio 1–6 como funciones puras con pruebas (confianza calculada, verificación,
      publicación de impacto alto, correcciones, retractaciones).
- [x] Registro de auditoría de solo agregar (en memoria).
- [x] `AlertCard` con filas gana/condicionado/pierde, insignia de confianza con texto y forma,
      fuentes desplegables, estados `corregida` y `retractada`.
- [x] Hero de la portada con abanico de tres tarjetas de ejemplo, cabecera y pie con aviso legal.
- [x] CSP estricta con nonce y cabeceras de seguridad; página 404 propia.
- [x] CI en GitHub Actions y Dependabot.

Pendiente visible del tercio 1: el botón "Recibir alertas" apunta a `#lista-de-espera`, que llega en
el tercio 2.

## Tercio 2 · Sitio público completo

- [ ] Fila de seis temas con íconos de línea (Energía, Chips, Cobre, Comercio EE.UU.–China, Divisas,
      Geopolítica).
- [ ] Sección "Tus temas" (maqueta de panel con insignias, datos de ejemplo).
- [ ] Sección "Pre-apertura" (resumen diario de ejemplo).
- [ ] Lista de espera: Server Action con validación Zod, honeypot, límite de solicitudes, verificación
      de origen, almacenamiento mínimo, texto de privacidad y doble opt-in (según decisión de correo).
- [ ] Páginas Aviso legal, Privacidad y Términos ("pendiente de revisión legal") y enlaces en el pie.
- [ ] Páginas `/fuentes` (registro público) y `/metodologia` (niveles de confianza y reglas).
- [ ] Semilla `data/sources.seed.json` y `docs/fuentes-pendientes.md` (sin inventar URLs de feeds).
- [ ] SEO: imagen Open Graph, `sitemap`, `robots`, datos estructurados `Organization`, manifiesto e
      íconos PWA en PNG.
- [ ] Pruebas e2e con Playwright (teclado, CSP sin violaciones, accesibilidad básica).

## Tercio 3 · Persistencia y panel interno

- [ ] Postgres gratuito (Neon o Supabase) con migraciones y usuario de mínimos privilegios.
- [ ] Repositorios: alertas, fuentes, enlaces, correcciones y auditoría (solo `INSERT`/`SELECT`,
      disparador que bloquea `UPDATE`/`DELETE`).
- [ ] Panel `/admin/alertas`: crear alerta, adjuntar fuentes, ver confianza calculada, enviar a
      revisión, aprobar, publicar, corregir y retractar.
- [ ] Protección del panel: secreto en variable de entorno, comparación en tiempo constante, límite
      de intentos, cookie firmada y CSRF.
- [ ] Cambios de fuentes en alertas publicadas por el flujo de corrección.
- [ ] Revisión OWASP Top 10:2025 y cierre de pendientes de `SECURITY.md`.
- [ ] Actualizar `CLAUDE.md` con lo aprendido.

## Decisiones que necesito de ti

Tomé valores por defecto razonables para no bloquear el avance; confírmalos o cámbialos:

1. **Ubicación del código.** Está en la carpeta `otea-austral/` dentro de este repositorio
   (`awesome-repos`), para no mezclarlo con la lista existente. ¿Lo movemos a un repositorio propio?
2. **Despliegue.** Vercel Hobby **no permite uso comercial**; Cloudflare (Workers/Pages) sí en su
   plan gratuito, con el adaptador OpenNext. Propongo Cloudflare. ¿De acuerdo?
3. **Correo para el doble opt-in** (tercio 2). Opciones con plan gratuito: Resend o Brevo. Hasta
   decidir, la lista de espera guardaría solicitudes sin confirmar y no enviaría correos.
4. **Base de datos** (tercio 3): Neon o Supabase, ambos gratuitos. Propongo Neon (solo Postgres).
5. **Confianza por fila.** Cada fila guarda la confianza que declara el analista, pero se muestra
   acotada a la que respaldan las fuentes (nunca la supera). ¿Te sirve así?
6. **Regla de confianza intermedia.** Implementé: sin fuentes → baja; alguna primaria → alta;
   alguna secundaria → media; solo prensa → media con dos medios distintos, baja con uno.
7. **Aprobación de impacto alto.** Exijo que la aprobación sea posterior a la última edición. ¿Debe
   además aprobar una persona distinta de quien creó la alerta (cuatro ojos)?
8. **Temas de las fuentes.** El registro usa los mismos seis temas de la portada. Algunas fuentes
   (por ejemplo, BLS) quizá necesiten un tema "Macro" adicional.
