# Rediseño «Horizonte»

Octubre de 2026. Siete tramos (T1 a T7) sobre el sitio editorial claro (`rediseno-claridad-y-movimiento.md` queda como
antecedente). Este documento resume qué se hizo, por qué, las reglas que lo sostienen, lo medido y lo que queda
pendiente. La guía de trabajo diaria sigue siendo `CLAUDE.md`. Las cifras son mediciones del build de producción en el
entorno de desarrollo (Chromium sin GPU, compositor por software). No son cifras de usuarios reales.

## 1. La idea

**«Del horizonte al mercado», filmado.** El emblema ya es un horizonte con un sol de latón visto por una lente. El sitio
convierte esa imagen en un mundo continuo, sin tocar el logo:

- **Llegada (0–3 s).** Una línea de horizonte se traza a sangre y el H1 monumental sale de detrás de ella. Amanece un sol
  de latón (un disco sin anillo: no es el emblema) y ocho pulsos de luz cruzan un suelo en perspectiva hasta poner de pie
  las 24 láminas del «mercado» (gana · condicionado · pierde).
- **Historia en un solo plano-secuencia.** La cámara se inclina sobre el suelo, que se vuelve plano técnico. Una lente
  de latón verifica tres fuentes. El plano se vuelve tableta, el evento se divide en tres corrientes y las alertas caen
  en Gana / Condicionado / Pierde. La tableta queda de frente y nítida, con el alba detrás.
- **Producto que se toca.** Una hoja con filo de latón sube sobre el escenario con la vitrina anotada: Ormuz, Chips y
  Cobre, y la prueba «quita la fuente primaria» con las reglas reales. Los temas reconfiguran «Tu mañana» en vivo. La
  pre-apertura pasa de la noche al alba y el resumen se escribe como una terminal.
- **Oficio en todo el sitio.** Cabecera isla, botón de latón como material, un foco que aterriza y un menú de app en el
  teléfono. Transiciones de página reales. Interiores con índice vivo, cifras de rodillo y una pieza propia por página, y
  un pie en tinta con firma.

Principios que deciden los empates: una idea, un mundo; el producto se entiende antes de los 10 s; contraste de capítulos
(claro → papel → claro → noche → alba → claro → tinta); dos voces tipográficas (Inter en mayúsculas para H1 y H2, Source
Serif 4 para entradas y títulos de alerta, JetBrains Mono para numerales); el latón es material y el único acento; el
movimiento explica y termina en reposo; tres modos siempre completos (fijo, apilado y quieto); rápido de verdad.

## 2. Tramos

| Tramo | Qué dejó |
|---|---|
| T1 · Cimientos | Tokens de movimiento, resorte literal, variantes `mov:`/`fino:`, `boton-laton`, foco que aterriza, `DirectorEscena` (bucles pausados fuera de vista, puntero) y guardas en `motion.test.ts` |
| T2 · Cabecera y navegación | Cabecera isla (`--isla` por `scroll(root)`), menú popover nativo, transiciones de página en `template.tsx` y saltos de ancla largos en un fundido |
| T3 · Héroe | «Horizonte vivo»: H1 partido por el horizonte, sol, suelo, pulsos 2D apuntados con `atan2()`, 24 láminas y alerta viva bajo 1024 px |
| T4 · Historia | Plano-secuencia de 470vh ligado a `--historia`, plano técnico con lente, tablero, riel `01 · 02 · 03`, vigías y modos apilados |
| T5 · Producto | Relevo con hoja, vitrina con `:has()` (funciona sin JS), «Tu mañana», noche → alba con terminal, lista de espera como créditos |
| T6 · Interiores | `ContentPage` con índice vivo (`:target-current`), cifras de rodillo, cinco piezas SVG, simulador de confianza, pie en tinta, 404 y `/cuenta/entrar` |
| T7 · Pulido | CSS compactado sin pérdida, asistente por frases, desplegables, enlaces con filete, 44 px, impresión, primer pintado sin maquetación forzada, e2e estable, medición final y documentación |

## 3. Guion de la historia (escritorio, ≥ 1024 px, con `animation-timeline` y la puerta abierta)

Progreso real = `(scrollY − top + 72) / (alto − vh + 72)` (con `view-timeline-inset: 72px 0`).

| Tramo | Qué pasa |
|---|---|
| 0–10 % | El héroe se pone: el grano se va al moverse la página; la retícula y los pulsos se apagan; la línea 2 del H1 sube antes que la 1 |
| 6–20 % | La cámara se inclina y el suelo se vuelve plano técnico; cielo, línea y suelo suben juntos (`h-alzar`, 10–17 %); la cinta se tiende y se junta en la ficha del evento |
| 21–47 % | Paso 01, verificar: las fichas se ponen de pie, los hilos se trazan, la lente recorre las tres fuentes y cada una se sella; el medidor sube por tramos |
| 46–73 % | Paso 02, impacto: el plano se vuelve tableta, bajan tres corrientes y caen nueve alertas de ejemplo con sus contadores |
| 72–100 % | Paso 03, tu panel: la tableta queda de frente (`transform: none` al 84 %) con el alba detrás; aviso del resumen pre-apertura |
| 94 % → 25 % de la salida | Velo del relevo; la hoja de la vitrina sube sobre el escenario |

Anclas del riel: `#paso-verificar` (30 %), `#paso-impacto` (60 %) y `#paso-panel` (86 %). Bajo 1024 px, sin línea de
tiempo o en pantallas táctiles, las mismas piezas se apilan y se arman al entrar (`m-*`, `escena-vista`, `data-texto`).

## 4. Sistema de movimiento

Tokens en `:root` de `globals.css` (no en `@theme`, que generaría utilidades `animate-*`):

| Token | Valor | Uso |
|---|---|---|
| `--dur-1…5` | 120 / 200 / 320 / 560 / 900 ms | pulsado · hover y foco · estados y paneles · resortes y bloques · titulares y trazados |
| `--ease-salida` | `cubic-bezier(.16,1,.3,1)` | lo que aterriza |
| `--ease-enfasis` | `cubic-bezier(.65,0,.35,1)` | cámara, medidores, estados, desplegables |
| `--ease-entrada` | `cubic-bezier(.5,0,.9,.6)` | lo que se va |
| Resorte | `linear(…)` literal tras un `cubic-bezier` de respaldo | *pops*, checks, sellos, bola del interruptor |
| `--escalon*` | 40 / 90 / 120 ms | escalonados (siempre con clases finitas `kx-i-N`) |
| `--disco-sol` | degradado radial de latón | el sol de héroe, alba, tablero y lista (una sola copia) |

Reglas (las vigilan `src/lib/design/motion.test.ts` y las e2e):

1. Toda animación cuelga de `html[data-movimiento="completo"]`. Con movimiento reducido o sin JS el DOM es el estado
   final: `document.getAnimations().length === 0` y nada oculto.
2. Lo que oculta algo cuelga además de `[data-motor]` (el motor lo marca tras la primera entrega de su observador).
3. Solo compositor: `transform`, `translate`, `scale`, `rotate`, `opacity`, `clip-path` y propiedades registradas de capas
   pequeñas. Nunca `filter` en entradas, `border-radius`, `width`/`height` ni `pointer-events` (salvo la clave discreta
   de `.h-hero`).
4. Curva en cada clave, relleno `backwards`, retrasos con clases finitas, nunca `style`.
5. Bucles: solo los pulsos del héroe, la gota de «Desliza» y los puntos del asistente, con `data-bucle` en su contenedor
   (se pausan sus descendientes fuera de vista).
6. Hover honesto dentro de `@media (hover: hover)`; efectos de puntero dentro de la puerta y `fino:`.
7. Impresión: una sola regla apaga toda animación y transición; `DirectorEscena` suelta `[data-motor]` en `beforeprint`.

## 5. Decisiones

**Descartadas o aplazadas (brief §2.2):** alerta viva en el héroe de escritorio (compite con un H1 de 120 px); «Del
ruido a la señal» (alarga la portada); bitácora pública; reloj de Santiago (parece una promesa de entrega en vivo);
cursiva de Source Serif 4 (+48 KB); shader WebGL y grano con `mix-blend-mode`; compartir el H1 entre páginas en las view
transitions.

**Tomadas por el camino (las razones largas están en «Lo aprendido» de `CLAUDE.md`):**

- `<ViewTransition>` vive en `src/app/template.tsx`. Dentro de cada `page.tsx` React nunca llamaba a
  `startViewTransition`: la marca estática no subía por el `<main>` del servidor. Con la puerta cerrada no se monta.
- **Transición intermitente bajo carga (T7).** Chromium aborta una view transition si capturar la página vieja más
  actualizar el DOM pasa de 4 s («Transition was aborted because of timeout in DOM update»). La portada se capturaba
  entera (~10 000 px, con la historia 3D). Con varias pruebas en paralelo eso tardaba hasta 4,7 s (reproducido: 2 de 12
  navegaciones abortaron). La causa se arregló: durante la transición (`:active-view-transition`), las secciones fuera
  de pantalla llevan `content-visibility: auto` con su alto recordado (`contain-intrinsic-size: auto`). La maquetación es
  la misma y la captura cuesta ~3 veces menos (CPU ×4: de 1,2–2,3 s a ~0,5 s). Con la misma carga, 0 de 12 abortaron, y
  la e2e pasó 8 de 8 veces con 4 workers junto a `artesania`.
- **Primer pintado sin maquetación forzada (T7).** En el teléfono, el motor leía las cajas de todos los bloques en
  `DOMContentLoaded` para dar por vistos los que ya se ven. Eso forzaba la maquetación entera de la portada antes del
  primer pintado (518 ms a CPU ×4). Ahora lo decide la primera entrega del `IntersectionObserver`, que llega tras pintar.
  LCP del perfil lento: de 1.584–1.600 ms (T6) a 1.368 ms.
- La maquetación diferida se suelta por secciones: primero una por cuadro tras `load` (de una tarea de ~335 ms a tareas
  de ≤ 140 ms) y, tras la revisión final, cada una al acercarse a 1,5 pantallas (`IntersectionObserver`): esas cuatro
  tareas largas justo después de cargar salen de la carga. TBT del teléfono lento: de ~420 a ~250 ms (misma medición).
- Vigías (`data-vigia`, `.vigia-producto`) en vez de animar `visibility`: lejos de la pantalla las piezas dejan de pintar
  o sueltan su animación.
- Índice vivo de las interiores con marcadores de desplazamiento (`scroll-target-group` + `:target-current`), no con
  una línea de tiempo por apartado.
- **CSS en una sola hoja que viaja con la portada.** El reinicio de Tailwind va recortado a los elementos que el sitio
  usa. Los valores por omisión de Tailwind van en línea (`@theme inline`) y el sol es una sola variable. Las transiciones
  de los botones van en una regla propia (`suave`). Así se compensaron los estilos de T7 y se bajó de 30,97 a 29,97 KB.
- `viewport-fit` sigue en `auto`. Con `cover`, cada sección a sangre necesitaría su relleno de área segura; hoy Safari
  ya deja el contenido dentro del área segura. Las reglas `env(safe-area-inset-*)` de la cabecera, el menú y el pie
  quedan listas por si se cambia.

## 6. Medición final contra la línea base (:3400, el sitio anterior)

Build de producción, mismas condiciones, mediana de 3 a 9 pasadas según la medida. LCP alternando servidores.

| Medida | Línea base | Horizonte (T7) | Meta del brief |
|---|---|---|---|
| Transferido, portada 1440 / 390 | 330,8 / 332,9 KB | 373,3 / 371,0 KB | < 400 KB ✓ |
| JS | 156,7 KB | 161,7 KB | ≤ 162 KB ✓ |
| CSS (gzip, las dos hojas) | 14,07 KB | 29,97 KB | ≤ 24 (tope 30) ✓ tope |
| Nodos | 992 | 1.389 | < 1.250 ✗ |
| Animaciones a la vez (1440 / 390) | 188 / 163 | 123 / 17 | < 160 ✓ |
| Animaciones infinitas (1440) | 49 | 9, pausadas fuera de vista | ≤ 10 ✓ |
| Capas que dibujan (máx., historia) | 151–211 | 75 | < 80 ✓ |
| Historia, fps (sin límite de CPU) | 38,2 | 53,7–54,5 | ≥ 55 ≈ (−1) |
| Historia, fps con CPU ×4 | 34,4 | 32,6 (25 % de cuadros > 20 ms frente a 59 %) | — |
| LCP 390 lento (CPU ×4, 4G lento) | 1.292–1.332 ms | 1.368 ms | ≤ 1.290 ≈ (+40 ms, dentro del ruido de ±50) |
| TBT 390 lento | 244 ms (129 en la revisión final) | ~460 ms; ~250 tras la revisión final (238 y 271 en dos series) | ≤ 236 ✗ (cerca) |
| CLS (carga y recorrido completo, 1440 y 390) | 0 | 0 | 0 ✓ |
| Reposo (recálculos de estilo/s) | 60 en todas partes | 0 lejos del héroe; 60 con los pulsos del héroe a la vista | 0 ✓ fuera del héroe |
| Alto de la portada en el teléfono | 12.595 px | 11.393 px | ~10.900 (decisión pendiente) |

Umbrales fijados en `e2e/presupuesto.spec.ts`: transferido 390 KB, nodos 1.400, animaciones 135 y CSS 30 KB.
Scripts y datos: `verificacion/T7/medicion/` de la carpeta de trabajo del rediseño.

## 7. Pendientes (decisiones de la persona dueña o trabajo futuro)

1. **Alto de la portada en el teléfono: 11.393 px** para una meta de ~10.900. Cerrar ~500 px exige quitar texto: es una
   decisión de contenido (T5 dejó las opciones medidas).
2. **Nodos: 1.389** para una meta de < 1.250. La vitrina guarda sus tres alertas en el DOM para funcionar sin JavaScript;
   bajar exige quitar contenido o renunciar a eso.
3. **TBT por encima de la base en el teléfono lento** (~250 frente a 129 ms en las mismas corridas, tras sacar de la carga
   la maquetación diferida). Lo que queda es la maquetación inicial, la evaluación del JS y la hidratación (la puerta,
   los vigías y la cinta), tareas de 60–100 ms. Ninguna tarea pasa de ~250 ms.
4. **Historia a ~54 fps** (meta 55). El tramo más caro es el 10–20 % (sale el héroe y se tiende la cinta: capas grandes y
   24 láminas 3D). Conviene medir en un dispositivo real antes de recortar.
5. **`data-foco`** (luz cálida bajo el cursor en las tarjetas clicables) no se aplicó: la isla ya escribe `--mx --my`,
   pero la regla (~60 B) no cabe bajo el tope de 30 KB de CSS. Requiere compensar con otro recorte o subir el tope.
6. **Chevrón de los desplegables:** ahora apunta abajo y da media vuelta. Antes era una flecha a la derecha que giraba 90°.
7. El texto que pasa bajo la barra de 60 px en el teléfono (porcelana al 98,5 %) conviene revisarlo en un dispositivo real.
