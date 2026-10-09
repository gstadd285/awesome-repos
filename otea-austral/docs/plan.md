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

El botón "Recibir alertas" ya lleva a la lista de espera (tercio 2).

## Incremento · Ciberseguridad según NIST CSF 2.0 ✅

- [x] Perfil de seguridad con las seis funciones (Gobernar, Identificar, Proteger, Detectar,
      Responder, Recuperar), estado y evidencia de cada control: `src/lib/security/nist-csf.ts`.
- [x] Página pública `/seguridad` y enlace en el pie.
- [x] `/.well-known/security.txt` (RFC 9116).
- [x] Reportes de violación de la CSP con receptor propio, límites y registro sin datos personales.
- [x] CI: verificación de firmas npm y SBOM CycloneDX.
- [x] Programa (política, apetito de riesgo, roles, proveedores, datos, riesgos) y plan de respuesta
      a incidentes en `docs/seguridad/`.

## Incremento · Animaciones estilo Apple ✅

- [x] Entrada escalonada del hero (sube, se enfoca y aparece) y abanico de tarjetas que se reparte.
- [x] Revelado al hacer scroll, retícula con paralaje y foco de luz que se atenúa.
- [x] Brillo de vidrio al pasar el cursor, botones que responden al presionar, desplegables suaves.
- [x] Transición entre páginas con la cabecera fija.
- [x] Todo en CSS, desactivado con "reducir movimiento" y con respaldo estático sin soporte.

## Rediseño · Estilo editorial claro (referencia "TIDY") ✅

- [x] Tema claro perla con luz de ventana, titulares grotescos en mayúsculas, cabecera
      `[ RECIBIR ALERTAS ]` y rótulos técnicos `001 — 004`, con el logo y la paleta de Otea.
- [x] Portada como historia 3D ligada al scroll: cinta de láminas → plano técnico con metal líquido
      → tablero con alertas que caen → panel en perspectiva. Sin JavaScript; apilada en móviles,
      sin soporte o con movimiento reducido.
- [x] Todas las páginas y la `AlertCard` adaptadas al tema claro.

## Tercio 2 · Sitio público completo ✅

- [x] Seis temas con íconos de línea y su descripción.
- [x] "Tus temas": vista previa interactiva (no guarda preferencias todavía).
- [x] "Pre-apertura": resumen diario de ejemplo.
- [x] "Así se ve una alerta": las tres `AlertCard` de ejemplo.
- [x] Lista de espera: Server Action con validación Zod, campo trampa, límite de solicitudes,
      datos mínimos y doble opt-in. **Cerrada** hasta tener base de datos y correo (tercio 3).
- [x] Páginas Aviso legal, Privacidad y Términos ("pendiente de revisión legal") y pie con enlaces.
- [x] `/fuentes` (registro público) y `/metodologia` (niveles de confianza y reglas).
- [x] Semilla `data/sources.seed.json` (17 fuentes primarias) y `docs/fuentes-pendientes.md`.
- [x] SEO: imagen Open Graph, `sitemap`, `robots`, datos estructurados `Organization`, manifiesto e
      íconos PWA en PNG.
- [x] Pruebas e2e con Playwright (teclado, CSP sin violaciones, movimiento reducido, lista de
      espera, páginas) y job en la CI.

## Tercio 3 · Persistencia y panel interno

- [ ] Postgres gratuito (Neon o Supabase) con migraciones y usuario de mínimos privilegios;
      implementar `WaitlistStore` sobre la base y abrir la lista de espera.
- [ ] Proveedor de correo para el doble opt-in (enviar el enlace de confirmación).
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
9. **Canal de reporte de vulnerabilidades.** El repositorio es público y el reporte privado de
   GitHub está desactivado. Actívalo (Settings → Security → Private vulnerability reporting) o
   define `SECURITY_CONTACT` con un correo cuando exista el dominio.
10. **Verificación en dos pasos** en GitHub, alojamiento, dominio y correo: es la medida más
    efectiva del perfil y solo tú puedes activarla.
