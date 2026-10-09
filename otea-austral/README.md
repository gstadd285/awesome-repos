# Otea Austral

**Inteligencia de eventos para mercados.** Avisos de eventos globales con quién gana, quién pierde
y bajo qué condición, con nivel de confianza y fuentes.

> Información y análisis. No constituye asesoría financiera.

Estado: MVP en construcción, **tercios 1 y 2 de 3** terminados. Ver [`docs/plan.md`](docs/plan.md).

## Requisitos

- Node.js ≥ 22.12 (ver `.nvmrc`)
- npm

## Puesta en marcha

```bash
cd otea-austral
cp .env.example .env.local   # ajusta NEXT_PUBLIC_SITE_URL si hace falta
npm ci
npm run dev                  # http://localhost:3000
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build de producción y servidor |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc` |
| `npm test` | Pruebas con Vitest |
| `npm run test:e2e` | Pruebas de navegador con Playwright (después de `npm run build`) |

## Qué hay hoy

- Portada en estilo editorial claro con una historia 3D ligada al scroll (cinta, plano técnico,
  tablero con alertas y panel), temas, "Tus temas", Pre-apertura, ejemplos y lista de espera.
- Páginas `/metodologia`, `/fuentes` (17 fuentes primarias), `/seguridad` y textos legales
  provisionales; SEO con imagen para redes, sitemap, robots y manifiesto.
- `AlertCard`: filas gana/condicionado/pierde, confianza calculada desde las fuentes, fuentes
  desplegables, estados corregida y retractada.
- Modelo de datos y reglas de verificación con pruebas (`src/lib/domain/`).
- Página `/seguridad` con el perfil según el NIST CSF 2.0 y `/.well-known/security.txt`.
- CSP estricta con nonce, reportes de violación y cabeceras de seguridad.
- Animaciones solo en CSS, desactivadas si el sistema pide reducir el movimiento.

Todo el contenido visible es **de ejemplo** y está marcado así.

## Documentación

- [`CLAUDE.md`](CLAUDE.md): reglas del proyecto, marca, sistema de diseño, modelo de datos y reglas
  de negocio.
- [`SECURITY.md`](SECURITY.md): controles y pendientes de seguridad.
- [`docs/plan.md`](docs/plan.md): plan por tercios y decisiones abiertas.
- [`docs/referencia-estilo.md`](docs/referencia-estilo.md): referencia visual (solo principios; no
  se usa su marca).
