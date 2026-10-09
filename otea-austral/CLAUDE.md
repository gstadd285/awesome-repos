# CLAUDE.md · Otea Austral

Guía para las sesiones de trabajo en este proyecto. Léela entera antes de tocar código.

## Propósito

**Otea Austral** es una plataforma de inteligencia de eventos para mercados financieros. Avisa de
eventos globales relevantes (por ejemplo, una tensión en Ormuz) y explica qué activos y sectores
podrían verse afectados: **quién gana, quién pierde y bajo qué condición**, con nivel de confianza y
fuentes. El usuario elige los temas que sigue.

- Descriptor: "Inteligencia de eventos para mercados."
- Eslogan (solo en la web, **nunca en el logo**): "Del horizonte al mercado."
- Público inicial: inversionistas minoristas y traders de Chile y Latinoamérica.
- Dominio previsto: oteaustral.com (no comprado). La URL base sale de `NEXT_PUBLIC_SITE_URL`.

Estado y próximos pasos: [`docs/plan.md`](docs/plan.md).

## Reglas que no se negocian

1. **Presupuesto total de unos 40 dólares.** Solo servicios con plan gratuito. **Preguntar antes de
   añadir cualquier servicio de pago.**
2. **No es asesoría financiera.** Prohibido prometer rentabilidad o usar verbos como "recomendamos
   comprar". Hablar de efectos posibles y condiciones ("podría", "si…").
3. **No inventar datos reales.** Todo contenido de muestra lleva `es_ejemplo: true` y la interfaz lo
   marca como "Datos de ejemplo". Los ejemplos usan organismos "(ejemplo)" y enlaces a
   `example.org`.
4. **Sin cifras falsas** de rendimiento, usuarios o latencia. Las metas se etiquetan "objetivo".
5. **Ningún secreto en el repositorio.** Variables de entorno y `.env.example`.
6. **Fuentes:** guardar título, enlace, fecha y organismo; **nunca copiar el texto** de la fuente. El
   resumen lo escribe Otea con sus palabras.
7. Si algo implica gasto, riesgo legal, riesgo de seguridad o contradice esta guía: **detenerse y
   preguntar**.

## Marca

- **Logo:** emblema anillo-lente + "OTEA" (serif, espaciado amplio) + "AUSTRAL" debajo, más pequeño,
  en latón. Componentes: `src/components/brand/Emblem.tsx` y `Logo.tsx`. **No modificar la
  geometría del emblema.** Fondo oscuro: anillo y línea marfil, interior tinta.
- SVG en `public/brand/` (emblema claro y oscuro, base para íconos PWA). Favicon: `src/app/icon.svg`
  (punto de latón más grande, horizonte más grueso).
- **Paleta base:** tinta polar `#0F1B2D`, marfil `#F3EEE3`, latón envejecido `#B08D57`, latón
  oscuro `#7A5E33`, bruma `#8C97A6`.
- **Colores de estado (solo dentro de `AlertCard`):** gana `#7FBF9E`, condicionado `#B08D57`,
  pierde `#E08A72`. Fuera de las alertas no hay otro color cromático.
- **Tipografía** (autoalojada con `next/font`, `display: swap`): titulares y marca en
  **Source Serif 4** (400–500, sin negritas fuertes); texto e interfaz en **Inter**; etiquetas de
  sección en **JetBrains Mono** (mayúsculas, tracking 0,10em).

## Sistema de diseño

Adaptación de [`docs/referencia-estilo.md`](docs/referencia-estilo.md): se toman sus principios
(vidrio esmerilado sobre lienzo oscuro, líneas finas, etiquetas de sección, retícula, espaciado
amplio), **no su marca** (ni nombres, ni violeta, ni tipografías propietarias, ni formularios de
acceso).

Tokens en `src/app/globals.css` (`@theme`, con la paleta de Tailwind reiniciada):

| Token | Valor | Uso |
|---|---|---|
| `canvas` | `#070E1A` | Lienzo de página |
| `ink` | `#0F1B2D` | Superficies elevadas, texto del botón principal |
| `ivory` | `#F3EEE3` | Titulares y texto destacado |
| `ivory-soft` | `#C9CCD1` | Texto de cuerpo |
| `mist` | `#8C97A6` | Texto de apoyo |
| `brass` | `#B08D57` | **Único acento:** acción principal |
| `brass-deep` | `#7A5E33` | Solo decorativo (contraste 3,2:1, nunca texto) |
| `glass-edge` / `-strong` | marfil 12 % / 24 % | Línea fina universal |
| `glass-fill` / `-strong` | marfil 4 % / 8 % | Relleno de vidrio |
| `gana`, `condicionado`, `pierde` | ver Marca | Solo en `AlertCard` |

Utilidades propias: `glass` (vidrio con brillo interno y halo, con respaldo opaco si no hay
`backdrop-filter`), `hairline`, `eyebrow`, `text-headline-gradient` (solo titular del hero y
títulos de sección grandes), `bg-grid`, `bg-spotlight`, `fade-line-left/right`.

Reglas:

- Contenedor de 1200 px, 120 px entre secciones, tarjetas con 24 px de relleno.
- Radios: botones `rounded-pill`, tarjetas y modales `rounded-card` (16 px), insignias y campos
  `rounded-badge` (6 px), íconos circulares.
- Bordes siempre como línea fina translúcida (`hairline`, `border-glass-edge`), nunca sólidos de
  color. Elevación con brillo interno y halo, no sombras de caída convencionales.
- Botón principal: `buttonClasses("primary")` (latón con **texto tinta**). Secundario:
  `buttonClasses("ghost")`.
- Etiqueta de sección: `<SectionEyebrow>` al abrir cada sección.
- Contraste mínimo AA: lo verifica `src/lib/design/contrast.test.ts` leyendo `globals.css`.
- Página inicial objetivo < 1 MB (hoy ~280 kB transferidos).
- **Sin atributos `style` en el HTML**: la CSP los bloquea. Todo con clases.
- Modo oscuro primero. El modo claro llegará más adelante con los mismos tokens.

### Movimiento (estilo apple.com)

Todo en CSS dentro de `globals.css`, sin librerías ni JavaScript de animación:

| Clase / componente | Efecto |
|---|---|
| `anim-aparecer` + `anim-retraso-1…4` | Entrada al cargar: sube, se enfoca (desenfoque → nítido) y aparece |
| `anim-escalonado` + `[--retraso-base:Xms]` | Los hijos entran uno tras otro |
| `anim-revelar` | Aparece al hacer scroll (se completa 280 px después de entrar) |
| `anim-abanico-centro/izquierda/derecha` | Las tarjetas del hero se reparten desde detrás de la central |
| `anim-paralaje`, `anim-atenuar-foco` | Profundidad: la retícula baja más lento y el foco se atenúa |
| `glass-interactive` | El borde de vidrio se ilumina al pasar el cursor |
| `<PageTransition>` | Transición entre páginas (React `ViewTransition`); la cabecera queda fija |

Reglas (las vigila `src/lib/design/motion.test.ts`):

- Toda animación va dentro de `@media (prefers-reduced-motion: no-preference)`; con movimiento
  reducido el contenido se ve completo y quieto.
- Lo ligado al scroll va además dentro de `@supports (animation-timeline: …)`.
- Las entradas usan `backwards`: al terminar no queda filtro ni transformación residual.
- Las animaciones mueven `transform`, `opacity` y `filter`; no aplicarlas a elementos que ya usan
  clases de filtro (`blur-*`). Para el hover de tarjetas posicionadas con `translate`/`rotate`
  (abanico), usar `glass-interactive`, nunca utilidades de `translate`.

## Modelo de datos (`src/lib/domain/schemas.ts`, Zod)

| Entidad | Campos |
|---|---|
| `Source` | `id`, `nombre`, `organismo`, `url_base` (https o vacía si no está verificada), `tipo` (`primaria`·`secundaria`·`prensa`), `temas[]`, `acceso` (`rss`·`api`·`manual`), `condiciones_reutilizacion`, `prioridad` (`A`·`B`·`C`), `activa` |
| `AlertSource` | `alert_id`, `source_id`, `titulo_documento`, `url` (solo https), `fecha_publicacion`, `fecha_consulta` (no anterior a la publicación), `identificador?` |
| `Alert` | `id`, `tema`, `evento`, `resumen`, `filas[]` (`sector`, `direccion` `gana`·`condicionado`·`pierde`, `condicion`, `confianza` declarada), `fecha`, `revisor`, `impacto` (`bajo`·`medio`·`alto`), `estado` (`borrador`·`en_revision`·`publicada`·`corregida`·`retractada`), `es_ejemplo` |
| `AlertAudit` | `id`, `alert_id`, `accion` (`creada`·`editada`·`aprobada`·`publicada`·`corregida`·`retractada`), `actor` (alias interno, **sin datos personales**), `fecha`, `nota` |
| `Correction` | `id`, `alert_id`, `fecha`, `texto_publico`, `tipo` (`correccion`·`retractacion`) |

- `Alert` **no tiene** `confianza` ni `nivel_verificacion` como campos editables: se calculan
  (`AlertView` en `view.ts`). Los esquemas son estrictos: un objeto que los traiga se rechaza.
- Cuando haya base de datos (tercio 3) podrán guardarse como columnas derivadas, recalculadas en
  cada escritura y nunca editables.
- Las migraciones llegan con la base de datos (tercio 3).

## Reglas de negocio (`src/lib/domain/rules.ts`, funciones puras con pruebas)

1. `confianza = alta` exige al menos una fuente `primaria`.
2. Si todas las fuentes son `prensa`, el máximo es `media` (y hacen falta dos organismos distintos;
   con uno solo es `baja`). Una `secundaria` sin primaria da `media`.
3. `impacto = alto` exige dos fuentes de **organismos distintos** (comparados sin tildes,
   mayúsculas ni espacios extra) y una fila `aprobada` en la auditoría **posterior a la última
   creación o edición** antes de pasar a `publicada`.
4. Una alerta `publicada` o `corregida` no se edita en silencio: cualquier cambio de contenido la
   pasa a `corregida`, crea una `Correction` pública y deja una fila `corregida` en la auditoría.
5. Una `retractada` sigue visible, tachada y con aviso arriba. **No se borra** ni se edita.
6. La confianza mostrada se **calcula** a partir de las fuentes. La confianza de cada fila es la
   declarada por el analista, **acotada** a la de la alerta.

Nivel de verificación: `sin_verificar` (sin fuentes), `una_fuente`, `dos_fuentes` (dos organismos
distintos), `fuente_oficial` (alguna primaria).

Transiciones: `crearAlerta` → `enviarARevision` → `aprobar` → `publicar` → `editar` (corrige) /
`retractar`. Reciben un `Contexto` (actor, fecha, generador de ids) y no leen reloj ni red.

`AppendOnlyAuditLog` (`audit-log.ts`) solo expone `append` y `list`, y entrega filas congeladas.

## Seguridad

Detalle y pendientes en [`SECURITY.md`](SECURITY.md). El programa sigue el **NIST CSF 2.0**: perfil
en `src/lib/security/nist-csf.ts` (publicado en `/seguridad`), gobierno y riesgos en
`docs/seguridad/programa.md`, incidentes en `docs/seguridad/respuesta-incidentes.md`. Lo esencial:

- CSP estricta con nonce por solicitud en `src/proxy.ts` (por eso `cacheComponents` está
  desactivado y el layout llama a `connection()`).
- Cabeceras estáticas en `src/lib/security/headers.ts` (aplicadas desde `next.config.ts`).
- Enlaces externos: solo `https`, validados con Zod (`httpsUrl`) y otra vez al renderizar
  (`safeHref`); `target="_blank"` siempre con `rel="noopener noreferrer"`.
- **No hacer peticiones salientes automáticas.** Si algún día se hace `fetch` de URLs: solo a
  dominios del registro de fuentes, con tiempo límite y tamaño máximo.
- Registros sin datos personales: usar siempre `logSecurityEvent` (`src/lib/security/log.ts`),
  nunca `console.log` con datos de entrada. Auditoría de solo agregar.
- Puntos que reciben datos: tipo de contenido, tamaño y volumen limitados
  (`createFixedWindowLimiter`).
- Al agregar o cambiar un control, actualizar `nist-csf.ts` con su evidencia; la prueba falla si un
  archivo citado no existe. Nunca presentarlo como certificación.
- `security.txt` vence el 2027-04-01 (`SECURITY_TXT_EXPIRES`): renovarlo antes.

## Comandos

```bash
npm install          # versiones fijas (.npmrc: save-exact)
npm run dev          # servidor de desarrollo en http://localhost:3000
npm run lint
npm run typecheck    # next typegen + tsc
npm test             # Vitest (una pasada); npm run test:watch para modo observación
npm run build && npm start
```

Node ≥ 22.12 (`.nvmrc`). La CI está en `../.github/workflows/otea-austral.yml`.

## Convenciones

- Dominio, interfaz y textos en **español** (es-CL). Fechas mostradas en hora de Chile
  (`src/lib/format.ts`).
- Componentes de servidor por defecto; `"use client"` solo si hace falta interacción.
- Toda entrada externa se valida con Zod en el borde.
- Pruebas junto al código (`*.test.ts[x]`). Las de componentes declaran
  `// @vitest-environment jsdom`.
- Commits pequeños y descriptivos. Dependencias con versión exacta.
- Esta es una versión de Next.js (16.4) más nueva que la de muchos ejemplos: ante dudas, leer
  `node_modules/next/dist/docs/`.

## Estructura

```
src/
  app/                 rutas (layout, página, 404, icono)
  components/
    alert-card/        AlertCard y sus insignias
    security/          perfil NIST, estado de controles, íconos de funciones
    brand/             Emblem y Logo
    home/              Hero, abanico de tarjetas, atmósfera
    layout/            cabecera, pie y transición entre páginas
    ui/                botones, etiqueta de sección
  data/ejemplo.ts      DATOS DE EJEMPLO validados con los esquemas
  lib/
    domain/            esquemas, reglas, vista, auditoría, URLs
    design/            cálculo de contraste
    security/          CSP, cabeceras, reportes CSP, registro, límites, security.txt, perfil NIST
  app/api/csp-report/  receptor de reportes de la CSP
  app/.well-known/     security.txt
  app/seguridad/       página pública de seguridad (NIST CSF 2.0)
  proxy.ts             nonce + CSP por solicitud
docs/                  plan, referencia de estilo, seguridad/ (programa e incidentes)
```

## Notas de Next.js

@AGENTS.md
