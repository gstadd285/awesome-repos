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

Estado y próximos pasos: [`docs/plan.md`](docs/plan.md). Despliegue: [`docs/despliegue.md`](docs/despliegue.md).

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
referencia: lienzo perla con luz de día, titulares grotescos en mayúsculas, piezas 3D y una historia
ligada al scroll. Se conservan el logo y la paleta de Otea (la referencia usa morado y rosa). El estilo
anterior (vidrio oscuro, `docs/referencia-estilo.md`) queda como antecedente.

**Rediseño de claridad y texto en movimiento** (`docs/rediseno-claridad-y-movimiento.md`, a pedido de la
persona responsable): el héroe dice qué es y ofrece una acción; la navegación se reduce a lo esencial; se
quitan la numeración de secciones, los corchetes y los rótulos de 11 px; el texto aparece «como en un video»
(ver «Texto en movimiento»). Las decisiones de gusto y los archivos que tocan están en ese documento.

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
| `ink`, `ivory`, `brass`, `brass-deep`, `mist` | marca | Logo, piezas decorativas, tema activo; `brass-deep` sirve como texto de ≥ 12 px sobre `fondo`, `papel` y `papel-alto` (no sobre `fondo-sombra`) |
| `laton-claro` / `laton-oscuro` | `#C7A570` / `#A6834D` | Extremos del degradado del botón de latón (tinta ≥ 4,9:1 en todo el recorrido) |
| `niebla` | `#C9CFD8` | Texto secundario sobre tinta (11:1) |
| `gana`, `condicionado`, `pierde` | estado | Solo alertas y sus piezas |

Utilidades propias: `superficie` (porcelana con borde fino y sombra suave),
`superficie-interactiva` (solo en lo clicable), `vidrio` (porcelana al 98,5 %, **sin `backdrop-filter`**; la cabecera usa el mismo material en `header::before`),
`boton-laton` (latón como material), `campo` (campos con el foco del sitio), `salto-contenido` (píldora en la cabecera que ocupa el lugar del logo), `cifras`,
`linea-fina`, `titular`, `micro` (rótulos en mayúsculas de 12 px), `contador`, `corchetes` (`[ … ]`, solo el panel y la
pantalla de error), `fondo-luz`,
`luz-ventana` (sombras de persiana), `reticula-puntos`, y el tamaño `text-lede` (18 a 22 px) para el texto
que explica el producto.

Reglas:

- Contenedor de 1440 px con 24 px de margen; 96 px (móvil) a 120 px entre secciones; cada sección abre con
  `<SectionEyebrow>Nombre</SectionEyebrow>` (punto de latón y nombre). **Sin número**: la numeración solo se
  usa donde hay una secuencia real (los tres pasos de la historia y los apartados legales).
- Radios: botones `rounded-pill`, tarjetas `rounded-card` (16 px), insignias y campos
  `rounded-badge` (6 px), íconos circulares.
- Botones: `buttonClasses("primary" | "outline" | "ghost", extra, "md" | "sm")`: píldoras de 14 px con
  inicial mayúscula (no versalitas) y 44 px de alto (`md`), cómodas al tacto; `primary` es `boton-laton` (degradado
  `laton-claro → brass → laton-oscuro` con texto tinta, filos de luz y sombra). Las CTA principales llevan
  `data-magnetico` y su texto en `<span className="boton-etiqueta">`; el secundario de contorno puede llevar `<Flecha />`.
- Cabecera (`SiteHeader`, de servidor): logo, cuatro enlaces (`NAV_CABECERA`) y «Recibir alertas»; la página actual
  lleva `aria-current` (`<SiteHeader actual="/ruta" />`) y un filete `.nav-subrayado` de 2 px en `brass-deep`. 72 px en
  escritorio y 60 px bajo 1024 px (`scroll-padding-top` 88 / 76 px). El material es `header::before`: barra sólida por
  defecto; con la puerta abierta, ≥ 1024 px y `animation-timeline`, transparente arriba y **isla** de 1200 px en los
  primeros 120 px de `scroll(root)` (logo y acciones se acercan; `.cabecera-progreso` es el avance de lectura). La
  pastilla de hover (`.nav-indicador`) lee `--nx --nw --nv` de `DirectorEscena`. Bajo 1024 px, botón «Menú» de 44 px que
  abre `<nav id="menu-movil" popover>` (pantalla completa bajo 640 px, panel de 440 px encima; sin `@supports`); bajo
  400 px «Alertas» vive solo en el menú. El pie lleva la navegación completa (`#pie-navegacion`). Las páginas
  interiores usan `ContentPage` (ruta de navegación `Migas`).
- Contraste mínimo AA: lo verifica `src/lib/design/contrast.test.ts` leyendo `globals.css`. El
  latón y la bruma no sirven para texto chico sobre el fondo claro.
- Página inicial objetivo < 1 MB.
- **Sin atributos `style` en el HTML**: la CSP los bloquea. Todo con clases (las posiciones fijas
  van como clases completas de Tailwind en el código, para que se detecten).
- Componentes de cliente sin Zod: los temas viven en `src/lib/domain/temas.ts` (sin dependencias).

### Portada: la historia en 3D (`src/components/home/Story.tsx`)

El héroe (titular H1, texto de entrada y dos botones) y tres pasos (`01 — 03`): la **cinta** de láminas
(`Ribbon`) que se pliega sobre el **plano técnico** con una gota de metal (`Blueprint`), el **tablero** con alertas
que caen (`Board`, datos de ejemplo) y el **panel** en perspectiva. Todo es CSS 3D:

- **Historia fija**: en escritorio (≥ 1024 px), con `animation-timeline` y con el movimiento activado, el
  escenario queda fijo (`position: sticky`) durante `470vh` y cada pieza usa la línea de tiempo `--historia`
  (claves `h-*` en `globals.css`).
- **Piezas que se arman al entrar** (< 1024 px, p. ej. un panel lateral o un teléfono): las mismas piezas se
  apilan en orden de lectura y cada una se arma al entrar en pantalla (claves `m-*`; las piezas llevan la
  clase `escena`): ligadas al scroll donde hay `animation-timeline` y, donde no (Firefox, Safari anterior al
  26), disparadas una vez por el motor al entrar en pantalla.
- **Quieta** (movimiento reducido sin activar, o sin JavaScript): las piezas apiladas se ven completas y
  quietas. El DOM es plano y sirve para los tres modos.
- *Lección:* antes de esta corrección la animación existía solo con las tres condiciones a la vez (≥ 1024 px,
  `animation-timeline` y sin «reducir movimiento»); en un panel lateral, Firefox o un sistema con animaciones
  desactivadas se veían «modelos estáticos». Toda pieza nueva debe animarse en los tres modos y probarse así
  (`e2e/movimiento.spec.ts`).
- Las piezas 3D son decorativas (`aria-hidden`); los textos de cada paso son secciones con `h2`.
  Lo que recibe foco se muestra aunque su paso no esté en pantalla.
- Las láminas de la cinta giran sobre el eje vertical entre 28° y 152° para no atravesarse.
- Los bloques de la historia son absolutos y se apilan: **lo que se desvanece debe dejar de interceptar clics**.
  `pointer-events` se anima en `h-hero`, `h-paso` y `h-paso-final`, y las piezas decorativas llevan
  `pointer-events: none` (`e2e/portada.spec.ts` lo comprueba con `elementFromPoint`).

### Movimiento

Las animaciones son CSS en `globals.css`, sin librerías de animación. Un motor mínimo
(`src/lib/movimiento/motor.ts`) decide **si** se anima y cubre lo que el CSS solo no alcanza (ver «Motor de
movimiento»):

| Clase / componente | Efecto |
|---|---|
| `anim-aparecer` + `anim-retraso-1…4` | Entrada al cargar: sube, se enfoca y aparece |
| `anim-escalonado` + `[--retraso-base:Xms]` | Los hijos entran uno tras otro |
| `anim-revelar` | Aparece al hacer scroll (se completa 280 px después de entrar) |
| `otea-ola`, `otea-flotar` | La cinta ondea y los rótulos flotan (bucles con `data-bucle`: se pausan fuera de vista) |
| `superficie-interactiva` | Lo clicable: el borde se marca, la sombra crece y sube 2 px (hover solo con `@media (hover: hover)`) |
| `<DirectorEscena>` | Isla única de cliente (layout): pausa los `[data-bucle]` fuera de vista; escribe `--mx --my --tx --ty --rx --ry` bajo el puntero y `--nx --nw --nv` en la navegación; cierra el menú del teléfono al tocar un enlace (también con movimiento reducido); hace los saltos de ancla de más de 1,5 pantallas dentro de un fundido (`startViewTransition`, `data-salto`, `pushState` antes de mover para que «Atrás» vuelva) |
| `<PageTransition>` | Transición entre páginas (React `ViewTransition`), **solo en `src/app/template.tsx`**: dentro de un `page.tsx` React nunca la iniciaba. La cabecera no se mueve; el subrayado, el logo y las acciones viajan con nombre propio |
| `<TextoEnMovimiento>` | Texto que aparece como en un video (ver abajo) |

### Texto en movimiento (`src/components/motion/TextoEnMovimiento.tsx`)

Componente de servidor que parte un texto y el CSS (`kx-*` en `globals.css`) lo anima. Dos copias del texto:
una `sr-only` para lectores de pantalla y otra `aria-hidden` partida, así que el nombre accesible no cambia.

| `efecto` / `disparo` | Dónde | Qué hace |
|---|---|---|
| `letras` + `carga` | H1 de cada página | Cada letra sube desde una máscara (< 1,5 s) |
| `palabras` + `scroll` | H2 de sección | Cada palabra sube desde una máscara al bajar (reversible) |
| `lectura` + `scroll` / `carga` | Textos de entrada | Cada tramo de 3 palabras pasa de tenue a pleno |
| En la historia fija | Pasos 01 a 03 | El texto se escribe al ritmo de `--historia` (reglas `.historia .h-paso-N …`) |

- Letras **solo en los H1**: partir en letras pierde el kerning (medido +0,74 % de ancho en el titular).
- La CSP prohíbe `style`: el índice de cada unidad va en una clase `kx-i-N` (0 a 79, `MAX_INDICE`); pasado el
  tope se satura. Nunca uses `style` ni `animation-delay` en línea.
- Cada bloque de scroll define **una** línea de tiempo (`view-timeline: --kx`) que comparten sus unidades:
  una por unidad costaba mucho más. Rangos en `vh`; terminan antes de la zona de lectura (≈ 60 % de la pantalla):
  `e2e/portada.spec.ts` lo comprueba. No lo uses en alertas, tablas, formularios ni textos legales.
- Si sumas un texto: `texto` es un `string` (para frases con enlaces o negritas, usa `anim-aparecer`).

### Motor de movimiento (`src/lib/movimiento/motor.ts`)

Un script de cabecera (`<ScriptMovimiento nonce>`, en línea, con el nonce de la CSP) corre antes del primer
pintado y escribe en `<html>`:

| Atributo | Valores | Para qué |
|---|---|---|
| `data-movimiento` | `completo` · `reducido` | **La puerta**: todo el movimiento del CSS cuelga de `html[data-movimiento="completo"]` |
| `data-sistema` | `reduce` · `normal` | Qué pide el sistema (`prefers-reduced-motion`) |
| `data-timeline` | `no` (si falta) | El navegador no soporta `animation-timeline` |
| `data-mov-ui` | `1` | Hay algo que elegir: se muestra el conmutador del pie |
| `data-motor` | `listo` | El respaldo está en marcha; solo entonces el CSS oculta algo |

- **Por defecto manda el sistema**; la persona puede activar el movimiento (aviso de la portada y conmutador del
  pie, `data-mov-conmutar`) y la elección se recuerda en `localStorage` (`otea-movimiento`). Sin JavaScript no
  hay puerta: la página queda quieta y completa.
- **Respaldo sin `animation-timeline`**: el motor observa los bloques `kx-scroll` y las piezas `escena` y les añade
  `kx-visto` / `escena-vista` al entrar en pantalla; el CSS (`html[…][data-timeline="no"][data-motor]`) corre
  entonces la misma animación una vez, con el tiempo. Lo que ya está a la vista al empezar lleva `mov-quieto`
  (sin parpadeo). **Todo lo que oculta algo cuelga de `[data-motor]`**: si el motor no arranca, el contenido se ve
  completo (`motion.test.ts` lo vigila).
- El motor debe ser **autocontenido** (se serializa con `toString()`): sin importaciones ni nada fuera de su
  cuerpo; `motor.test.ts` lo ejecuta aislado. La copia interactiva reutiliza el mismo código (con
  `ignorarSistema: true`: parte animada aunque el sistema pida reducir).
- `dangerouslySetInnerHTML` aparece solo dos veces (JSON-LD y este script, ambos constantes de compilación);
  `src/lib/security/arquitectura.test.ts` lo vigila.

**Sistema de movimiento del rediseño «Horizonte»** (tokens en `:root` de `globals.css`): duraciones `--dur-1…5`
(120/200/320/560/900 ms), curvas `--ease-salida` (lo que aterriza), `--ease-enfasis` (cámara, estados) y
`--ease-entrada` (lo que se va), y escalonados `--escalon*`. El **resorte va literal** (`linear(…)`), siempre detrás de
un `cubic-bezier` de respaldo y nunca con `var()` en la misma declaración (utilidad `resorte`). Variantes con puerta en
forma de bloque: `mov:` (solo con `data-movimiento="completo"`) y `fino:` (ratón o trackpad). El foco es un anillo tinta
de 2 px con un halo de latón (`--anillo`) que pintan las sombras (también en los enlaces de cabecera, menús y pie; no en
los enlaces en prosa); con la puerta abierta, aterriza de 9 a 3 px. Sobre tinta, la clase `en-tinta` pasa el anillo y
el `accent-color` a latón (en el resto del sitio, `accent-color` es tinta: el latón no llega a 3:1 en casillas y
radios). Bucles infinitos: solo con `data-bucle` en su contenedor; se pausan sus descendientes, no el contenedor.

Reglas (las vigila `src/lib/design/motion.test.ts`):

- Toda animación va detrás de la puerta `html[data-movimiento="completo"]`; con movimiento reducido (y sin
  activarlo) el contenido se ve completo y quieto, y las transiciones se anulan. Al imprimir, las entradas se
  desactivan.
- Lo ligado al scroll va además dentro de `@supports (animation-timeline: …)`.
- Las entradas usan `backwards`: al terminar no queda filtro ni transformación residual. Nada de
  `filter: blur` en las entradas (caro y ensucia el texto).
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
- La base **no tiene** columnas de confianza ni de nivel de verificación: se calculan al leer, desde
  las fuentes activas. Las migraciones están en `db/migraciones/` (`npm run db:migrar`); **una
  migración aplicada no se edita** (se registra su hash): los cambios van en un archivo nuevo.

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
- Lista de espera (`src/lib/waitlist/`): Server Action con validación Zod, campo trampa, **marca de tiempo
  firmada** (`tiempo.ts`: sin marca, falsa, en menos de 3 s o vencida → «espera»), límite por IP (cifrada con
  SHA-256, solo en memoria; también en la confirmación) y doble opt-in con token cuyo hash se guarda (se presenta como **verificación en dos pasos**; el formulario pide **dos
  casillas separadas**, `condiciones` y `acepta`, y el registro guarda `VERSION_CONSENTIMIENTO` de `schema.ts`: cámbiala cuando
  cambie lo que esas casillas dicen o lo que las condiciones de uso y la privacidad aclaran sobre lo aceptado). **El correo
  se guarda cifrado** (AES-256-GCM + índice ciego HMAC, `cifrado.ts`; el usuario de la base escribe pero no puede
  leer `correo_cifrado`; solo el dueño descifra con `npm run lista:exportar`). Todo sale de `WAITLIST_SECRETO`
  (HKDF por propósito, `claves.ts`). Con `WAITLIST_MODE=cerrada` (por defecto) no guarda correos; `memoria` solo
  para desarrollo y e2e (el esquema de entorno la rechaza en producción salvo `OTEA_E2E=1`; sin cifrado).
- **Asistente de preguntas** (`src/lib/asistente/`, `POST /api/asistente`; diseño, costos y decisiones en
  `docs/asistente-ia.md`). Reglas:
  - **Modo `base` por omisión: gratis y sin IA.** La IA (Claude, SDK oficial) es de pago (regla 1): **nunca la actives ni
    cambies modelo, precios, topes o claves sin que la persona responsable lo pida.** `env.ts` exige todo para `ia` y no
    tiene valores por omisión.
  - Recorrido: puertas HTTP → políticas → búsqueda → base o IA → revisión de la salida. Una pregunta con datos personales,
    manipulación, consejo o pronóstico, o que no encuentra respuesta en la base, **no llega nunca al modelo**. Un atajo de la
    interfaz o una pregunta idéntica a una de la base se responde con la base.
  - El modelo **no tiene herramientas ni secretos** y su salida solo se muestra como texto, revisada frase por frase
    (`salida.ts`). Agregarle una herramienta o una fuente de datos exige una revisión de seguridad. Los enlaces salen solo
    de `ENLACES_PERMITIDOS` y el navegador solo acepta rutas del propio sitio.
  - El gasto se reserva (peor caso) antes de llamar y se ajusta al uso real; el tope diario vive en Postgres
    (`asistente_uso`, migración `0005`). Si la base falla, no se llama al modelo.
  - Cada entrada nueva de la base (`conocimiento.ts`): sin lenguaje de recomendación, cifras verificadas, enlaces permitidos, y
    un caso en `recuperar.test.ts`; revisa que no robe preguntas de otras entradas (a igual puntaje gana la que va antes).
  - Los componentes de cliente del asistente solo importan `@/lib/asistente/limites` y `cliente`.
- **Cuentas de personas usuarias** (`src/lib/cuentas/`, `src/app/cuenta/`, `src/app/acciones/cuenta.ts`; diseño, modelo de
  amenazas y operación en `docs/cuentas.md`). Reglas:
  - **Cerradas por omisión** (`CUENTAS_MODO=cerradas`: las páginas existen, no guardan nada y el sitio no ofrece entrar).
    **Abrirlas es decisión de la persona responsable** (secreto nuevo, cuota de correo, revisión legal): nunca las abras ni
    cambies los textos legales como si estuvieran revisados por tu cuenta.
  - La cuenta **no existe hasta confirmar el correo** (la contraseña se elige con el enlace). Abrir un enlace de correo no cambia
    nada: solo el POST. Crear, entrar y olvidar **responden igual exista o no el correo** (con tiempo mínimo y contraseña
    «señuelo»): no lo rompas con un mensaje o un estado distinto.
  - Toda Server Action de `acciones/cuenta.ts` que cambia algo pasa por `conSesion` → `exigirAccionCuenta` (sesión + token
    anti-CSRF), y toda página o ruta privada llama a `exigirSesionCuenta`; las excepciones son una **lista cerrada** que vigila
    `arquitectura.test.ts`. Lo que vuelve al navegador desde una acción (`valores`) nunca incluye contraseñas, códigos ni tokens.
  - Contraseñas con scrypt (`clave.ts`, con semáforo), política NIST 800-63B (`politica-clave.ts`: sin reglas de composición;
    lista local de claves comunes generada con `scripts/generar-claves-comunes.mjs`; aviso de licencia en `AVISOS-DE-TERCEROS.md`).
    El correo y el secreto de dos pasos van **cifrados** con claves derivadas de `CUENTAS_SECRETO` (que **hoy no se puede rotar**:
    no hay script de recifrado). El correo de una cuenta no se puede cambiar (no hay permiso de escritura en la base).
  - La sesión es la cookie `__Host-otea_sesion` (`HttpOnly`, `Secure`, `SameSite=Lax`), solo un token cuyo hash vive en la base:
    «Salir» la revoca de verdad. Los intentos fallidos se cuentan por IP, por (correo, IP), por correo y **por cuenta en la base**
    (en «puntos»: tope alto a propósito, porque uno bajo regala el bloqueo a distancia de cualquier cuenta; el freno fino es por
    (correo, IP)). Los correos que cualquiera puede provocar (altas) no pueden pasar del 60 % del cupo diario de Resend: el resto es
    de restablecer contraseñas y avisos. No cambies esos números ni «arregles» el bloqueo dejando pasar la contraseña correcta
    (deja de limitar las adivinanzas) sin leer `docs/cuentas.md` §8–§9.
  - `VERSION_TEXTOS` (cuentas) debe ser igual a `VERSION_CONSENTIMIENTO` (lista de espera): son las mismas dos páginas legales; una
    prueba lo vigila. Un tipo de evento de actividad nuevo exige `TIPOS_DE_EVENTO`, `DESCRIPCION_EVENTO` y la restricción de la base
    (si la migración ya se aplicó en algún lugar, en una migración nueva).
  - Los componentes de cliente de `components/cuenta/` solo importan `@/lib/cuentas/formato-secreto` (el resto de `lib/cuentas` y
    `lib/correo` es del servidor).
- **Panel `/admin`** (`src/app/admin/`, `src/lib/admin/`): sin `ADMIN_*` y `DATABASE_URL` responde 404.
  Acceso con frase (PBKDF2) y código TOTP; la sesión es una cookie `__Host-` firmada **y registrada en
  la base** (`admin_sesiones`), así que «Salir» la revoca de verdad. Toda página privada llama a
  `exigirSesion()` y toda Server Action a `exigirAccionAdmin(formData)` (sesión + token CSRF). Una
  acción o página nueva del panel que no lo haga es un fallo de seguridad.
- **Base de datos:** la aplicación entra con un usuario de mínimos privilegios (`otea_app`), nunca con
  el dueño. Cada tabla nueva necesita sus `grant` por columna, **RLS activada con una política por operación
  permitida** (`0003`; `rls.test.ts` falla si falta) y, si es de solo agregar, un disparador `otea_rechazar` (ver
  `0001` y `0002`). Consultas siempre parametrizadas (`$1`); el texto SQL solo interpola constantes `SQL_…`
  (lo vigila `arquitectura.test.ts`). `returning` necesita `select`: con permisos por columna usa `returning 1`.
- **Lo que no puede depender de la memoria de una instancia vive en la base:** códigos TOTP gastados,
  sesiones revocadas y el tope diario de correos. Los límites por IP en memoria son solo una primera
  barrera (Cloud Run puede tener varias instancias).
- **Configuración inválida = revisión sin tráfico:** `env.ts` valida al importarse y `/api/salud`
  (sonda de Cloud Run) lo importa. Una variable nueva con reglas de seguridad va en `EnvSchema`.
  `next build` también corre con `NODE_ENV=production`; lo que solo existe al ejecutar se exime con
  `NEXT_PHASE === "phase-production-build"` (ver `construyendo` en `env.ts`).
- **Secretos:** `process.env` se lee solo en `src/lib/env.ts` (regla de lint) y `env.ts` y el cliente de la base
  son `server-only`. `npm run seguridad:secretos` (CI) busca claves en archivos e historial; si una línea es un
  valor falso a propósito, se marca con `escaner:ignorar` y el motivo. `npm run seguridad:canarios` construye con
  secretos falsos y falla si alguno queda en `.next/`: una variable secreta nueva se agrega a
  `scripts/lib/canarios.mjs` (una prueba lo exige). Los canarios usan solo la marca `CANARIO` en mayúsculas.
- **Reglas que se comprueban solas** (`src/lib/security/arquitectura.test.ts` y `eslint.config.mjs`): toda acción y
  página del panel exige sesión, ningún componente de cliente importa la base ni la configuración, no hay subida
  de archivos, `public/` es de lista cerrada, y el inventario de Server Actions y de endpoints es fijo: **agregar
  uno exige actualizar la prueba, y con ello revisar su autenticación, validación, tamaño y límites.**
- **HTTPS:** `src/proxy.ts` redirige (308) lo que `X-Forwarded-Proto` marque como http (`https.ts`). Ojo: el servidor
  de Next.js **añade** esa cabecera según la conexión cuando falta, así que una petición http directa al contenedor
  también se redirige; `HTTPS_FORZADO=0` lo apaga (emergencia o pruebas locales por http).
- Revisión OWASP y sus hallazgos: `docs/seguridad/auditoria-owasp-2025.md`. Plan de los 20 controles:
  `docs/seguridad/plan-20-controles.md`.
- Al agregar o cambiar un control, actualizar `nist-csf.ts` con su evidencia; la prueba falla si un
  archivo citado no existe (y cada descripción admite 280 caracteres). Nunca presentarlo como
  certificación.
- `security.txt` vence el 2027-04-01 (`SECURITY_TXT_EXPIRES`): renovarlo antes.

## Comandos

```bash
npm install          # versiones fijas (.npmrc: save-exact)
npm run dev          # servidor de desarrollo en http://localhost:3000
npm run lint
npm run typecheck    # next typegen + tsc
npm test             # Vitest (una pasada); npm run test:watch para modo observación
npm run build && npm start   # `output: "standalone"`: start corre `node .next/standalone/server.js`
npm run test:e2e     # Playwright sobre el build (servidor en el 3200, con las cuentas abiertas si hay DATABASE_URL y el correo
                     # yendo a un servidor que imita a Resend en el 3298: `scripts/resend-falso.mjs`; el modo IA del asistente,
                     # en el 3201 contra un servidor que imita a Anthropic en el 3299: `scripts/anthropic-falso.mjs`)
npm run db:migrar    # DATABASE_URL_ADMIN (rol dueño): aplica db/migraciones y la semilla de fuentes
npm run db:rol-app   # crea el usuario de la aplicación e imprime su URL una sola vez
npm run admin:credenciales   # frase, TOTP y secretos de sesión del panel
npm run lista:secreto        # WAITLIST_SECRETO (marca de tiempo del formulario y cifrado de correos)
npm run lista:exportar       # DATABASE_URL_ADMIN + WAITLIST_SECRETO: correos confirmados, descifrados (-- --csv)
npm run lista:recifrar       # rotar WAITLIST_SECRETO (ensayo; -- --aplicar para rotar de verdad)
npm run cuentas:secreto      # CUENTAS_SECRETO (cifrado del correo y de los dos pasos de las cuentas; hoy no se puede rotar)
npm run asistente:probar     # GASTA DINERO: prueba el asistente con la API real (ASISTENTE_PRUEBA_REAL=1 + clave en el entorno)
npm run seguridad:secretos   # escáner de secretos en archivos e historial (lo corre la CI)
npm run seguridad:canarios   # build con secretos falsos: ninguno debe quedar en .next/ (lo corre la CI)
npm run seguridad:dependencias   # audita TODAS las dependencias contra seguridad/avisos-npm-aceptados.json
docker build -t otea-austral .
```

Node ≥ 22.12 (`.nvmrc`). La CI está en `../.github/workflows/otea-austral.yml` (jobs `verificar`,
`e2e` y `contenedor`, los tres con Postgres o Docker reales).

Pruebas con base de datos: sin `PRUEBAS_DATABASE_URL` (Postgres con un rol que cree bases y roles) las
de integración se **omiten**; con `PRUEBAS_DB_OBLIGATORIAS=1` fallan si falta. Para e2e del panel exporta
además `DATABASE_URL` (usuario de la aplicación de una base migrada); sin ella se omiten. Cada corrida
de Playwright genera credenciales al azar. Los códigos TOTP gastados quedan en la base: dos corridas
contra la misma base dentro de los mismos 30 segundos pueden chocar (en la CI la base es nueva).

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
  app/                 rutas: portada, metodologia, fuentes, seguridad, legales, 404, cuenta/ (cuentas),
                       lista-de-espera/confirmar, acciones/ (Server Actions), api/csp-report,
                       api/salud, api/asistente, error y global-error, admin/, alertas/, .well-known/security.txt,
                       sitemap, robots, manifest, íconos, imagen OG
  components/
    alert-card/        AlertCard y sus insignias
    asistente/         AsistenteChat (la conversación; componente de cliente)
    cuenta/            formularios y paneles de la cuenta (entrar, crear, perfil, seguridad, datos)
    brand/             Emblem y Logo
    home/              Story (héroe, cinta, plano, tablero), Temas (selector), ejemplos de alertas,
                       pre-apertura, lista de espera
    layout/            cabecera, pie, ContentPage, Migas (ruta de navegación), transición entre páginas
    motion/            TextoEnMovimiento (texto que aparece como en un video), ScriptMovimiento y
                       MovimientoSync (puerta de movimiento), ControlesMovimiento (aviso y conmutador)
    security/          perfil NIST, estado de controles, íconos de funciones
    ui/                botones, rótulo de sección
  data/ejemplo.ts      DATOS DE EJEMPLO validados con los esquemas
  lib/
    domain/            esquemas, reglas, vista, auditoría, URLs, temas
    design/            contraste y guardas del CSS de movimiento
    movimiento/        motor de movimiento (script de cabecera: puerta, respaldo y conmutador)
    security/          CSP, cabeceras, reportes CSP, registro, límites, security.txt, perfil NIST
    sources/           registro de fuentes (semilla validada)
    waitlist/          lista de espera: esquema, almacenamiento (memoria y Postgres cifrado), correo, servicio,
                       marca de tiempo (tiempo.ts), cifrado y claves derivadas
    admin/             sesión firmada, TOTP, frase, almacén de sesiones en la base
    asistente/         preguntas frecuentes, búsqueda, políticas, servicio, proveedor de IA, revisión de la salida, gasto
    cuentas/           cuentas de personas usuarias: servicio, almacenes (memoria y Postgres), contraseñas, cifrado, tokens,
                       TOTP, código QR propio, correos, acceso (cookie y CSRF)
    correo/            envío con Resend y plantilla de los correos (compartidos por la lista de espera y las cuentas)
    alertas/           repositorio Postgres de alertas, fuentes, correcciones y auditoría; formularios
    db/                cliente de Postgres (pool, transacciones) y ayudante de pruebas
  app/admin/           panel interno (acceso, listado, alta, detalle y acciones)
  app/alertas/         alertas publicadas; app/api/salud: sonda de Cloud Run
  proxy.ts             nonce + CSP por solicitud
data/sources.seed.json registro inicial de fuentes
db/migraciones/        SQL numerado (0001 esquema, 0002 sesiones del panel, 0003 RLS, 0004 correos cifrados, 0005 gasto del asistente,
                       0006 cuentas)
scripts/               migrar, rol de la aplicación, credenciales del panel, preparar standalone, lista de espera
                       (secreto, exportar, recifrar), escáner de secretos, canarios, auditoría de dependencias
seguridad/             avisos de npm aceptados (con motivo y fecha de revisión)
despliegue/            plantilla del servicio de Cloud Run
Dockerfile             imagen multi-etapa sin privilegios
e2e/                   pruebas de navegador (Playwright)
docs/                  plan, despliegue, fuentes pendientes, seguridad/ (programa, incidentes,
                       auditoría OWASP), referencia de estilo anterior
```

## Lo aprendido (tercio 3)

- **Next.js 16.4 no es el de los ejemplos:** los errores se reintentan con `retry()` (no `reset`); el
  middleware es `proxy.ts`; `next start` **no** sirve con `output: "standalone"` (`npm start` corre
  `node .next/standalone/server.js` y `npm run build` copia `public/` y `.next/static` con
  `scripts/preparar-standalone.mjs`). Antes de usar una API de Next, leer `node_modules/next/dist/docs/`.
- **`robots.ts` y `sitemap.ts` se prerenderizan al construir** y fijan la URL del momento: llevan
  `export const dynamic = "force-dynamic"` para que una imagen sirva a cualquier dominio. Cualquier ruta
  nueva que lea `env` y sea estática tiene el mismo problema.
- **El contenedor no se puede probar solo con `docker build` si hay un proxy que re-firma TLS** (entornos
  de desarrollo en la nube): el build necesita la CA del proxy y `next/font/google` baja fuentes durante
  el build. En la CI de GitHub no hay problema.
- **Pruebas e2e y sesión compartida:** todas las pruebas con sesión comparten la cookie guardada por
  `admin.setup.ts`. Como «Salir» ahora la revoca en la base, una prueba que cierre sesión debe crear su
  propia sesión (ver «sesiones del panel» en `e2e/admin.spec.ts`), nunca usar `SESION_ADMIN`.
- **Pruebas con Postgres:** cada archivo crea su propia base (`crearBaseDePrueba`); dentro de un archivo
  las pruebas comparten datos y corren en orden, así que usa claves únicas (hashes, correos) y fechas
  lejanas cuando cuentes filas.
- **`tsconfig` incluye `**/*.ts`:** `e2e/` y los `*.test.ts` se comprueban en `npm run typecheck` y en el
  build; por eso no se excluyen del contexto de Docker.

## Lo aprendido (plan de los 20 controles)

- **RLS en Postgres, lo que importa:** un `UPDATE`/`DELETE` sobre filas que la política no deja ver afecta 0 filas
  (sin error); un `INSERT` que no cumple la política falla con `42501`; `UPDATE … RETURNING` exige que la fila
  nueva pase la política de `select`; `SELECT … FOR UPDATE` también esconde esas filas (una política `using`
  restrictiva en `alertas` convertiría «retractada» en «no existe»); `INSERT … ON CONFLICT DO UPDATE … WHERE`
  contra una fila fuera de la política se salta en silencio. Las pruebas de integración con la base real son la red.
- **Postgres limita los cuantificadores de las expresiones regulares a 255** (`{39,400}` falla al migrar): el largo
  se comprueba aparte con `char_length`.
- **El dueño de la base no pasa por RLS** (no se usa FORCE): lo necesitan las migraciones y la semilla.
- **`crearBaseDePrueba({ migraciones: n })`** migra solo hasta la n-ésima y `base.migrarTodo()` termina: sirve para
  probar una migración sobre datos que ya existían (ver `lista-scripts.test.ts`). `base.urlPropietario` abre una
  conexión propia para transacciones de varias sentencias.
- **`tsconfig` apunta a ES2017:** una prueba con una expresión regular con la bandera `s` falla en `tsc` y en
  `next build`; usa `[\s\S]`.
- **Los canarios solo con mayúsculas** (`CANARIO`): el nombre del script `seguridad:canarios` está en el
  `package.json` que Next copia a `standalone`.
- **La imagen base de Node trae npm, corepack y yarn** (con sus dependencias, que Trivy marca): la etapa final los
  quita. Validar Trivy aquí: `docker pull aquasec/trivy` (Docker Hub) y la base de datos del espejo
  `mirror.gcr.io/aquasec/trivy-db:2`; `ghcr.io` y `dl-cdn.alpinelinux.org` están bloqueados en este entorno.
- **`.npmrc` tiene `ignore-scripts=true`:** si una dependencia nueva necesitara su script de instalación, hay que
  ejecutarlo a mano o reconsiderarla.
- **`next build` ejecuta `tsc` sobre `e2e/` y los `*.test.ts`:** un error de tipos en una prueba rompe el build y el
  servidor de Playwright (que no arranca, sin más pista).

## Lo aprendido (asistente de preguntas, condiciones de uso y dos pasos)

- **El SDK de Anthropic lee del entorno todo lo que no recibe** (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_CUSTOM_HEADERS`…): `proveedor-anthropic.ts` pasa todo explícito (`authToken: null`, `webhookKey: null`, `baseURL`,
  `logLevel: "off"`). Los modelos actuales rechazan `thinking`, parámetros de muestreo y prefill: no los envíes.
- **Los precios por millón de tokens son «micros por token»**: el costo se lleva en micros (millonésimas de dólar) y se
  reserva el peor caso antes de llamar; ver `presupuesto.ts`.
- **`pgrep -f` y `pkill -f` matan tu propio shell** si el patrón está en la línea de comandos que los lanza; además Next
  cambia el título del proceso a `next-server`. Para parar un servidor de prueba, búscalo por puerto (`ss -ltnp`) y mata ese PID.
- **Playwright**: `getByText` no mira dentro de `<noscript>` (lee el elemento con `locator("noscript …")`); `response.text()`
  falla a veces con respuestas que se leen como flujo (copia el cuerpo dentro de la página: `capturarRespuestasDelAsistente`);
  el parámetro `use` de una fixture choca con la regla de hooks de React (llámalo `entregar`); y los límites por IP se
  agotan entre pruebas que comparten servidor (`e2e/fixtures.ts` da una IP propia a cada prueba con `X-Forwarded-For`).
- **Búsqueda léxica**: una palabra vacía dentro de una etiqueta de varias palabras la convierte en un sinónimo de una
  sola («mi cuenta» → «cuenta»); a igual puntaje gana la entrada que va antes en la base, así que una entrada nueva que
  pueda empatar con otra va después de ella; las marcas que usa el servidor falso (`ZZERROR`…) son una sola palabra sin
  significado para no cambiar qué entradas se encuentran.
- **Un `<span>` oculto con un espacio al principio** pierde ese espacio en el nombre accesible: pon el espacio fuera.
- **Controles hasta hidratar**: `useSyncExternalStore(() => () => {}, () => true, () => false)` da «¿ya hidraté?» sin
  efectos; el chat sale desactivado en el HTML del servidor (y sin JavaScript) y nada que se escriba se pierde.
- **En el servidor falso, una variable local `registro` tapaba la opción `registro`** (zona muerta temporal: la solicitud
  se colgaba): evita reutilizar nombres dentro de un manejador largo.
- **Condiciones de uso**: la ruta sigue siendo `/terminos` (no cambia enlaces), pero todo lo que ve la persona dice
  «Condiciones de uso»; los textos legales son provisionales y no se presentan como definitivos.

## Lo aprendido (cabecera isla y view transitions)

- **`<ViewTransition>` dentro de cada `page.tsx` no corre nunca** con esta CSP dinámica: la marca estática de React no
  sube por el `<main>` que llega del servidor y el segmento que se cambia no la lleva (0 llamadas a
  `startViewTransition`, medido instrumentando el commit). En `src/app/template.tsx` sí: Next lo vuelve a montar en cada
  navegación. `motion.test.ts` vigila que siga ahí.
- **Playwright `locator.click()` desplaza la página para mostrar el elemento** aunque esté en una cabecera fija: antes de
  una navegación eso deja la página arriba y la captura de la view transition sale distinta. Para probar transiciones,
  clic por coordenadas (`page.mouse.click`, ayudante `clicEnSitio` en `artesania.spec.ts`).
- **`getComputedStyle(…, "::before")` da el valor animado por `scroll(root)`**: así mide la e2e la opacidad de la isla.
  Para congelar fotogramas, solo las animaciones con `DocumentTimeline` admiten `currentTime` en ms.
- **El servidor de 3410 hay que reiniciarlo tras cada `npm run build`**: sigue sirviendo el HTML viejo con hojas que ya
  no existen y la página sale sin CSS.
- Una regla `html { … @media { … } }` anidada rompe la expresión de `contrast.test.ts` que busca `accent-color`: las
  variantes por ancho de `html` van en un bloque aparte.

## Lo aprendido (cuentas de personas usuarias)

- **La paleta de Tailwind está reiniciada**: `fill-white`, `bg-black`, `text-white`… **no existen** y no avisan. El código QR salió
  como un cuadrado negro (todo se pintó del color por omisión del SVG) hasta que los colores pasaron a atributos del SVG
  (`fill="#FFFFFF"`); `CodigoQr.test.tsx` y el e2e lo vigilan. Antes de usar una utilidad de color, mira los tokens de `globals.css`.
- **React 19 vacía los campos sin controlar al terminar una acción** (`useActionState`): por eso las acciones devuelven lo que
  no es secreto (`valores`: el correo, las casillas, lo guardado ya normalizado) y las contraseñas **nunca** vuelven. Un campo
  `required` que se vacía impide reenviar: la casilla de «eliminar la cuenta» sigue marcada si solo falló la contraseña.
- **Sin JavaScript también funciona** (un e2e lo prueba: crear cuenta, salir, entrar y restablecer): el segundo paso acepta el
  código de la app o uno de recuperación en un solo campo (el conmutador y el teclado numérico aparecen al hidratar) y el botón
  «Mostrar» de las contraseñas solo existe hidratado.
- **`Referrer-Policy: no-referrer` rompe los formularios sin JavaScript**: el navegador manda `Origin: null` al enviar un
  formulario (modo de navegación) y Next.js rechaza esa Server Action con un 500. Las páginas con token usan `strict-origin`
  (entrega solo el origen, nunca la dirección con el token). Con `fetch` (con JavaScript) no pasa, así que solo se nota probando sin él.
- **Playwright**: tras pulsar «Salir» hay que **esperar a que termine la acción** antes de ir a otra página (si no, la sesión
  sigue viva y `/cuenta/entrar` redirige al perfil: falla solo bajo carga); `getByRole("alert")` también encuentra el anunciador
  de rutas de Next.js (`__next-route-announcer__`): busca dentro de `main`; el idioma es `es-CL`; `getByLabel("Tu contraseña
  nueva")` también encuentra «Repite tu contraseña nueva» (usa `exact`); los enlaces de los correos llevan el origen de
  `NEXT_PUBLIC_SITE_URL`, no el del servidor de pruebas: se navega por la ruta. Los correos de las pruebas «llegan» al servidor
  falso (`GET /__correos?para=…`).
- **Next.js**: una ruta nueva exige `npx next typegen` antes de `tsc` (los tipos `PageProps<"/ruta">` salen de `.next/types`);
  `source: "/cuenta/:path*"` en `headers()` también cubre `/cuenta`; el servidor falso de Resend se levanta con
  `reuseExistingServer`: si cambias su puerto o sus variables, mata los servidores viejos (`ss -ltnp`).
- **Una migración sin aplicar todavía se puede editar** (la `0006` mientras no se haya aplicado en ningún entorno); después, solo
  una migración nueva.

## Notas de Next.js

@AGENTS.md
