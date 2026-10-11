# Otea Austral

**Inteligencia de eventos para mercados.** Avisos de eventos globales con quién gana, quién pierde
y bajo qué condición, con nivel de confianza y fuentes.

> Información y análisis. No constituye asesoría financiera.

Estado: MVP **terminado en código** (tercios 1, 2 y 3 de 3). Falta ponerlo en producción: ver
[`docs/despliegue.md`](docs/despliegue.md) y la lista «Falta para abrir al público» de [`docs/plan.md`](docs/plan.md).

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
| `npm run build` / `npm start` | Build de producción y servidor (`output: "standalone"`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc` |
| `npm test` | Pruebas con Vitest |
| `npm run test:e2e` | Pruebas de navegador con Playwright (después de `npm run build`; con `DATABASE_URL` también prueba el panel) |
| `npm run db:migrar` | Aplica las migraciones y la semilla de fuentes (`DATABASE_URL_ADMIN`, rol dueño) |
| `npm run db:rol-app` | Crea el usuario de mínimos privilegios de la aplicación |
| `npm run admin:credenciales` | Genera la frase, el secreto TOTP y los secretos de sesión del panel |
| `npm run lista:secreto` | Genera `WAITLIST_SECRETO` (marca de tiempo del formulario y cifrado de los correos) |
| `npm run lista:exportar` | Exporta los correos confirmados, descifrados (`DATABASE_URL_ADMIN` + `WAITLIST_SECRETO`) |
| `npm run lista:recifrar` | Rota `WAITLIST_SECRETO` (ensayo; `-- --aplicar` para rotar de verdad) |
| `npm run seguridad:secretos` | Busca secretos en los archivos y en todo el historial de git |
| `npm run seguridad:canarios` | Construye con secretos falsos y comprueba que ninguno queda en el resultado |
| `npm run seguridad:dependencias` | Audita todas las dependencias contra los avisos aceptados |
| `docker build -t otea-austral .` | Imagen para Cloud Run (sin privilegios, sin secretos) |

## Qué hay hoy

- Portada en estilo editorial claro: héroe con el titular entrando letra a letra, historia 3D ligada al
  scroll (cinta, plano técnico, tablero con alertas y panel) con el texto escribiéndose al ritmo de la
  animación, ejemplos de alertas, selector de temas, resumen matutino y lista de espera.
- Páginas `/metodologia`, `/fuentes` (17 fuentes primarias), `/seguridad` y textos legales
  provisionales; SEO con imagen para redes, sitemap, robots y manifiesto.
- `AlertCard`: filas gana/condicionado/pierde, confianza calculada desde las fuentes, fuentes
  desplegables, estados corregida y retractada.
- Modelo de datos y reglas de verificación con pruebas (`src/lib/domain/`).
- Página `/seguridad` con el perfil según el NIST CSF 2.0 y `/.well-known/security.txt`.
- CSP estricta con nonce, reportes de violación y cabeceras de seguridad.
- Animaciones y texto en movimiento en CSS, en cualquier pantalla: historia fija en escritorio y piezas que se arman
  al entrar en ventanas estrechas; un motor mínimo cubre los navegadores sin `animation-timeline` y deja activar el
  movimiento a quien tiene «reducir movimiento» en su sistema (que se respeta por defecto).
- Postgres con migraciones, permisos mínimos y auditoría de solo agregar; lista de espera con doble
  opt-in por correo (cerrada por defecto, `WAITLIST_MODE`).
- Panel interno `/admin` (frase + código TOTP, sesión revocable) para crear, revisar, aprobar, publicar,
  corregir y retractar alertas, y página pública `/alertas`. Sin configuración, el panel no existe (404).
- Imagen de contenedor y guía de despliegue en Google Cloud Run; revisión OWASP Top 10:2025.

Todo el contenido visible es **de ejemplo** y está marcado así.

## Documentación

- [`CLAUDE.md`](CLAUDE.md): reglas del proyecto, marca, sistema de diseño, modelo de datos y reglas
  de negocio.
- [`SECURITY.md`](SECURITY.md): controles y pendientes de seguridad.
- [`docs/despliegue.md`](docs/despliegue.md): Cloud Run, Neon, Resend, secretos y operación.
- [`docs/seguridad/auditoria-owasp-2025.md`](docs/seguridad/auditoria-owasp-2025.md): hallazgos y
  correcciones de la revisión OWASP.
- [`docs/plan.md`](docs/plan.md): plan por tercios y decisiones abiertas.
- [`docs/rediseno-claridad-y-movimiento.md`](docs/rediseno-claridad-y-movimiento.md): plan, revisión crítica y
  resultado del rediseño de claridad y texto en movimiento.
- [`docs/referencia-estilo.md`](docs/referencia-estilo.md): referencia visual (solo principios; no
  se usa su marca).
