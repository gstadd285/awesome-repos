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
  en latón. Componentes: `src/components/brand/Emblem.tsx` y `Logo.tsx` (`variante="claro"` por
  defecto; `oscuro` para fondos tinta). **No modificar la geometría del emblema.**
- SVG en `public/brand/`; favicon `src/app/icon.svg`; íconos PWA en `public/icons/` y
  `src/app/apple-icon.png` (generados desde el favicon, fondo marfil).
- **Paleta de marca:** tinta polar `#0F1B2D`, marfil `#F3EEE3`, latón envejecido `#B08D57`, latón
  oscuro `#7A5E33`, bruma `#8C97A6`.
- **Colores de estado:** gana `#7FBF9E`, condicionado `#B08D57`, pierde `#E08A72`. Se usan **solo**
  en alertas y en las piezas que las representan (cinta, tablero), siempre como relleno con texto
  tinta.
- **Tipografía** (autoalojada con `next/font`, `display: swap`): titulares en **Inter** mayúscula
  (utilidad `titular`, peso 500); logo y títulos de alertas en **Source Serif 4**; contadores en
  **JetBrains Mono**.

## Sistema de diseño (editorial claro, referencia "TIDY")

Por pedido de la persona responsable, el sitio adopta el estilo de la web "TIDY" del short de
referencia: lienzo perla con luz de día, tipografía grotesca en mayúsculas, rótulos técnicos
(`001 — 004`), cabecera con `[ RECIBIR ALERTAS ]`, piezas 3D y una historia ligada al scroll. Se
conservan el logo y la paleta de Otea (la referencia usa morado y rosa). El estilo anterior (vidrio
oscuro, `docs/referencia-estilo.md`) queda como antecedente.

Tokens en `src/app/globals.css` (`@theme`, con la paleta de Tailwind reiniciada):

| Token | Valor | Uso |
|---|---|---|
| `fondo` / `fondo-sombra` | `#E7E5E0` / `#D9D7D2` | Lienzo perla y sus sombras |
| `papel` / `papel-alto` | `#F6F3ED` / `#FCFAF6` | Superficies y tarjetas |
| `texto` | `#0F1B2D` | Titulares y texto principal |
| `texto-suave` | `#3D4859` | Texto de cuerpo |
| `apoyo` | `#4C5665` | Texto de apoyo (AA incluso sobre sombras) |
| `linea` / `linea-fuerte` | tinta 14 % / 32 % | Líneas finas y bordes |
| `acento` | `#B08D57` | **Único acento:** relleno del botón principal, con texto tinta |
| `ink`, `ivory`, `brass`, `brass-deep`, `mist` | marca | Logo, piezas decorativas, tema activo |
| `gana`, `condicionado`, `pierde` | estado | Solo alertas y sus piezas |

Utilidades propias: `superficie` (porcelana con borde fino y sombra suave),
`superficie-interactiva`, `vidrio` (cabecera, con respaldo opaco sin `backdrop-filter`),
`linea-fina`, `titular`, `micro` (rótulos en mayúsculas), `contador`, `corchetes`
(`[ … ]`), `fondo-luz`, `luz-ventana` (sombras de persiana), `reticula-puntos`.

Reglas:

- Contenedor de 1440 px con 24 px de margen; 120 px entre secciones; cada sección abre con
  `<SectionEyebrow numero="01">Nombre</SectionEyebrow>`.
- Radios: botones `rounded-pill`, tarjetas `rounded-card` (16 px), insignias y campos
  `rounded-badge` (6 px), íconos circulares.
- Botones: `buttonClasses("primary")` (latón, texto tinta), `"outline"` (borde fino, como "HOW IT
  WORKS" de la referencia) y `"ghost"`.
- Contraste mínimo AA: lo verifica `src/lib/design/contrast.test.ts` leyendo `globals.css`. El
  latón y la bruma no sirven para texto chico sobre el fondo claro.
- Página inicial objetivo < 1 MB.
- **Sin atributos `style` en el HTML**: la CSP los bloquea. Todo con clases (las posiciones fijas
  van como clases completas de Tailwind en el código, para que se detecten).
- Componentes de cliente sin Zod: los temas viven en `src/lib/domain/temas.ts` (sin dependencias).

### Portada: la historia en 3D (`src/components/home/Story.tsx`)

Cuatro pasos (`001 — 004`): la **cinta** de láminas (`Ribbon`), el **plano técnico** con metal
líquido (`Blueprint`), el **tablero** con alertas que caen (`Board`, datos de ejemplo) y el
**panel** en perspectiva. Todo es CSS 3D:

- En escritorio (≥ 1024 px), con `animation-timeline` y sin movimiento reducido, el escenario
  queda fijo (`position: sticky`) durante `470vh` y cada pieza usa la línea de tiempo `--historia`
  (claves `h-*` en `globals.css`).
- En otros casos las mismas piezas se apilan en orden de lectura: el DOM es plano y sirve para
  ambos modos.
- Las piezas 3D son decorativas (`aria-hidden`); los textos de cada paso son secciones con `h2`.
  Lo que recibe foco se muestra aunque su paso no esté en pantalla.
- Las láminas de la cinta giran sobre el eje vertical entre 28° y 152° para no atravesarse.

### Movimiento

Todo en CSS dentro de `globals.css`, sin librerías ni JavaScript de animación:

| Clase / componente | Efecto |
|---|---|
| `anim-aparecer` + `anim-retraso-1…4` | Entrada al cargar: sube, se enfoca y aparece |
| `anim-escalonado` + `[--retraso-base:Xms]` | Los hijos entran uno tras otro |
| `anim-revelar` | Aparece al hacer scroll (se completa 280 px después de entrar) |
| `otea-ola`, `otea-flotar`, `otea-metal` | La cinta ondea, los rótulos flotan, el metal se deforma |
| `superficie-interactiva` | El borde se marca y la sombra crece al pasar el cursor |
| `<PageTransition>` | Transición entre páginas (React `ViewTransition`); la cabecera queda fija |

Reglas (las vigila `src/lib/design/motion.test.ts`):

- Toda animación va dentro de `@media (prefers-reduced-motion: no-preference)`; con movimiento
  reducido el contenido se ve completo y quieto. Al imprimir, las entradas se desactivan.
- Lo ligado al scroll va además dentro de `@supports (animation-timeline: …)`.
- Las entradas usan `backwards`: al terminar no queda filtro ni transformación residual.
- Las piezas 3D no deben tener `overflow` distinto de `visible`, `opacity` menor que 1 ni `filter`
  mientras se espera que conserven la profundidad (aplanan el 3D).
- Un elemento `sr-only` dentro de un contenedor con scroll necesita que ese contenedor sea
  `relative`; si no, ensancha la página.

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
- Lista de espera (`src/lib/waitlist/`): Server Action con validación Zod, campo trampa, límite por
  IP (cifrada con SHA-256, solo en memoria) y doble opt-in con token cuyo hash se guarda. Con
  `WAITLIST_MODE=cerrada` (por defecto) no guarda correos; `memoria` solo para desarrollo y e2e (el
  esquema de entorno la rechaza en producción salvo `OTEA_E2E=1`).
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
npm run test:e2e     # Playwright sobre el build (levanta `next start` en el puerto 3200)
```

Node ≥ 22.12 (`.nvmrc`). La CI está en `../.github/workflows/otea-austral.yml`.

## Convenciones

- Dominio, interfaz y textos en **español** (es-CL). Fechas mostradas en hora de Chile
  (`src/lib/format.ts`).
- Componentes de servidor por defecto; `"use client"` solo si hace falta interacción.
- Toda entrada externa se valida con Zod en el borde.
- Pruebas junto al código (`*.test.ts[x]`). Las de componentes declaran
  `// @vitest-environment jsdom`. Las de navegador van en `e2e/` (Playwright 1.56.1, que coincide
  con el Chromium del entorno; en local, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite usar otro).
- Commits pequeños y descriptivos. Dependencias con versión exacta.
- Esta es una versión de Next.js (16.4) más nueva que la de muchos ejemplos: ante dudas, leer
  `node_modules/next/dist/docs/`.

## Estructura

```
src/
  app/                 rutas: portada, metodologia, fuentes, seguridad, legales, 404,
                       lista-de-espera/confirmar, acciones/ (Server Actions), api/csp-report,
                       .well-known/security.txt, sitemap, robots, manifest, íconos, imagen OG
  components/
    alert-card/        AlertCard y sus insignias
    brand/             Emblem y Logo
    home/              Story (cinta, plano, tablero), temas, tus temas, pre-apertura,
                       ejemplos, lista de espera
    layout/            cabecera, pie, ContentPage, transición entre páginas
    security/          perfil NIST, estado de controles, íconos de funciones
    ui/                botones, rótulo de sección
  data/ejemplo.ts      DATOS DE EJEMPLO validados con los esquemas
  lib/
    domain/            esquemas, reglas, vista, auditoría, URLs, temas
    design/            contraste
    security/          CSP, cabeceras, reportes CSP, registro, límites, security.txt, perfil NIST
    sources/           registro de fuentes (semilla validada)
    waitlist/          lista de espera: esquema, almacenamiento, servicio
  proxy.ts             nonce + CSP por solicitud
data/sources.seed.json registro inicial de fuentes
e2e/                   pruebas de navegador (Playwright)
docs/                  plan, fuentes pendientes, seguridad/, referencia de estilo anterior
```

## Notas de Next.js

@AGENTS.md
