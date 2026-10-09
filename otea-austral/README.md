# Otea Austral

**Inteligencia de eventos para mercados.** Avisos de eventos globales con quién gana, quién pierde
y bajo qué condición, con nivel de confianza y fuentes.

> Información y análisis. No constituye asesoría financiera.

Estado: MVP en construcción, **tercio 1 de 3** terminado. Ver [`docs/plan.md`](docs/plan.md).

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

## Qué hay hoy

- Portada con el hero y tres tarjetas de alerta de ejemplo en abanico.
- `AlertCard`: filas gana/condicionado/pierde, confianza calculada desde las fuentes, fuentes
  desplegables, estados corregida y retractada.
- Modelo de datos y reglas de verificación con pruebas (`src/lib/domain/`).
- Página `/seguridad` con el perfil según el NIST CSF 2.0 y `/.well-known/security.txt`.
- CSP estricta con nonce, reportes de violación y cabeceras de seguridad.

Todo el contenido visible es **de ejemplo** y está marcado así.

## Documentación

- [`CLAUDE.md`](CLAUDE.md): reglas del proyecto, marca, sistema de diseño, modelo de datos y reglas
  de negocio.
- [`SECURITY.md`](SECURITY.md): controles y pendientes de seguridad.
- [`docs/plan.md`](docs/plan.md): plan por tercios y decisiones abiertas.
- [`docs/referencia-estilo.md`](docs/referencia-estilo.md): referencia visual (solo principios; no
  se usa su marca).
