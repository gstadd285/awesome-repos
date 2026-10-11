# Rediseño · claridad y texto en movimiento

Encargo de la persona responsable: que el texto aparezca «como en un video» al bajar (letras que entran, con
motion design), que la página sea **más intuitiva** y de **diseño más limpio**, con trabajo de primer nivel; con
un plan y una revisión crítica antes de seguir.

Este documento es el plan, la revisión crítica y, al final, el resultado. Los cambios van en commits separados
para poder revertir cualquiera sin tocar el resto.

## Principios

1. **Claridad primero; el movimiento sirve a la lectura.** Si un efecto no ayuda a entender o a guiar la vista, no entra.
2. **Un solo gesto expresivo: el texto.** Se quita ruido decorativo para que la tipografía en movimiento sea lo que se recuerda.
3. **Degradación elegante.** Sin JavaScript, sin soporte de animaciones ligadas al scroll o con «reducir movimiento»,
   todo el contenido se ve completo y quieto.
4. **Reglas del proyecto intactas.** Solo CSS para el movimiento, sin atributos `style` (CSP), contraste AA, sin
   asesoría financiera, sin datos inventados, sin dependencias nuevas.
5. **Reversible.** Un commit por decisión de diseño.

## Diagnóstico de la portada actual

Medido sobre las capturas del sitio en 1440 px y 390 px:

- El titular es el eslogan («Del horizonte al mercado.»): no dice qué es el producto. La explicación vive en un
  párrafo gris pequeño al otro lado, y la acción principal queda debajo de la cinta decorativa.
- Hay **dos numeraciones** (`001 — 004` en la historia y `01 — 05` en las secciones) que no son secuencias reales.
- Navegación de siete elementos, rótulos de 11 px en mayúsculas con letra espaciada y un botón entre corchetes.
- El mismo producto se muestra tres veces (tablero de la historia, resumen matutino y tarjetas), y «Temas» y
  «Tus temas» enumeran los mismos seis temas en dos bloques.
- En el resumen matutino cada ítem repite las tres etiquetas Gana / Condicionado / Pierde, que parecen una
  leyenda y no información.
- La lista de espera queda a unos 9.000 px del inicio en escritorio.

## Sistema de movimiento

Un componente de servidor (`TextoEnMovimiento`) parte el texto; el CSS lo anima. No hay JavaScript de animación.

| Efecto | Dónde | Disparo | Unidad | Para qué |
|---|---|---|---|---|
| Entrada | H1 de la portada y de cada página | Al cargar (menos de 1,5 s) | Letras, subiendo desde una máscara | Primera impresión; marca el tono |
| Subida | Titulares de sección | Scroll (`view()`), reversible | Palabras, subiendo desde una máscara | Guiar la vista al entrar en una sección |
| Lectura | Textos de entrada (lede) | Scroll (`view()`), reversible | Palabras, de tenue a pleno | Ritmo de lectura controlado por la persona |
| Historia | Pasos 2 a 4 de la historia fija (escritorio) | Línea de tiempo `--historia` | Palabras | El texto se escribe al ritmo de la animación 3D |
| Bloque | Tarjetas y figuras | Scroll (`view()`) | El bloque (ya existía) | Aparición discreta |

Reglas de construcción:

- Todo el CSS vive en `globals.css`, dentro de `@media (prefers-reduced-motion: no-preference)`; lo ligado al
  scroll, además, dentro de `@supports (animation-timeline: view())`. `motion.test.ts` lo vigila.
- La CSP prohíbe `style` en el HTML: el índice de cada letra o palabra va en una clase `kx-i-N` (N de 0 a 79,
  definidas en el CSS). Por encima de 79 unidades el índice se satura (no se rompe nada, solo pierde escalonado).
- Accesibilidad: cada texto se emite una vez para lectores de pantalla (`sr-only`) y una vez decorativo
  (`aria-hidden`). El nombre accesible del titular no cambia.
- **Letras solo en los H1.** Partir en letras pierde el kerning entre pares (medido: +0,74 % de ancho en
  «Del horizonte al mercado.»); en el resto se anima por palabra y la tipografía queda intacta.
- Las animaciones usan `transform` y `opacity` (se componen sin repintar el diseño). Se elimina el desenfoque
  (`filter: blur`) de las entradas existentes: es caro y ensucia el texto.
- El efecto de scroll termina antes de que el bloque llegue a la mitad de la pantalla (rangos en `vh`), para que
  nada quede a medio aparecer en la posición normal de lectura.
- No hay movimiento en alertas, tablas, formularios ni textos legales.
- Con impresión, `forced-colors` o foco de teclado el contenido se ve completo.

## Cambios de claridad

| Cambio | Motivo |
|---|---|
| Héroe: titular → texto grande → un botón principal y un enlace «Ver una alerta de ejemplo» | La acción queda junto al titular y el producto se entiende en pocos segundos |
| Cabecera con cuatro enlaces y botón «Recibir alertas»; «Seguridad» pasa al pie y al menú | Menos opciones; el botón se lee como botón |
| Página actual marcada en la cabecera (`aria-current`) | Orientación |
| Se quita la numeración de las secciones de la portada y de las páginas | Una numeración que no es secuencia es ruido; la de la historia sí es una secuencia y se queda |
| «Temas» y «Tus temas» se unen en un bloque interactivo | Lista una sola vez los seis temas y deja elegir ahí mismo |
| «Así se ve una alerta» sube justo después de la historia | Responde enseguida «qué recibiría» |
| Resumen matutino: lista los sectores afectados con su signo en lugar de tres etiquetas iguales | Pasa de leyenda a información |
| Botones y rótulos de 11 px a tamaño legible (botones 14 px; `micro` 12 px) | Legibilidad y objetivos táctiles de 44 px |
| Escala de texto de entrada (`text-lede`, 18 a 22 px) | Los textos que explican el producto se leen primero |
| Páginas interiores con enlace de regreso y titular con entrada | Orientación y coherencia con la portada |

## Lo que no cambia

Logo y paleta, tipografías, historia 3D (solo se le añade texto animado), `AlertCard`, formulario y reglas de la
lista de espera, panel interno, cabeceras de seguridad y CSP, tokens de contraste, textos legales y sus avisos
de «pendiente de revisión legal», y el contenido: todo sigue siendo de ejemplo y marcado como tal.

## Verificación prevista

- Vitest (unidad e integración), ESLint, `tsc`, `npm run build` y Playwright en escritorio y móvil, con y sin
  movimiento reducido.
- Pruebas nuevas: estructura y accesibilidad del componente de texto, guardas de CSS (clases `kx-*` definidas,
  animaciones solo donde corresponde), que un titular de scroll queda completo al llegar a la zona de lectura y
  que con movimiento reducido todo es visible sin animaciones en curso.
- Capturas y fotogramas de la entrada y del barrido de scroll en 1440 px y 390 px, antes y después.
- Carga: LCP y CLS medidos en Chromium sin límite de red, antes y después.
- Accesibilidad: árbol de encabezados, nombres accesibles, orden de tabulación y, si se puede instalar,
  `axe-core`.

## Revisión crítica: lo que se puede decir en contra

| Objeción | Peso | Qué hace el plan | Lo que queda abierto |
|---|---|---|---|
| Las letras que aparecen frenan la lectura y pueden sentirse «de agencia» en un producto que vive de la confianza | Alto | Solo titulares y textos de entrada; nunca alertas, tablas ni legales; menos de 1,5 s al cargar; el resto lo controla el scroll | Hay que verlo en uso real; si cansa, se baja la intensidad o se limita al H1 |
| Con el scroll como reloj, un párrafo puede quedar a medio iluminar si la persona se detiene | Medio | Rangos que terminan antes de la mitad de la pantalla; prueba automática en la zona de lectura | En párrafos muy altos o pantallas bajas puede quedar tenue un momento |
| Soporte: `animation-timeline` funciona en Chrome y Edge y en Safari 26 o posterior; en Firefox no está confirmado | Medio | Degradación: texto completo y quieto | Solo se puede probar Chromium aquí; Safari y Firefox quedan sin probar. Un respaldo con JavaScript daría el efecto en Firefox pero rompe la regla «solo CSS» |
| Accesibilidad: vestibular, lectores de pantalla, forzar colores, impresión | Medio | `prefers-reduced-motion`, copia `sr-only` más versión decorativa, sin cambios en foco ni formularios | Falta probar con un lector de pantalla real |
| Rendimiento: más nodos (cientos de `span`) y más animaciones | Bajo a medio | Tope de 80 unidades por texto, solo `transform` y `opacity`, medición de LCP y CLS | No hay medición en teléfonos reales |
| SEO y peso: el texto se emite dos veces | Bajo | Solo en titulares y textos de entrada; la página inicial sigue muy por debajo de 1 MB | — |
| «Más limpio» puede diluir la identidad TIDY que se pidió (mayúsculas, corchetes, numeración técnica) | Medio | Se conservan logo, paleta, tipografías, 3D y mayúsculas en titulares; cada cambio va en un commit aparte | Las decisiones de abajo son de gusto y las confirma la persona responsable |
| «Intuitivo» es criterio de diseño, no resultado de pruebas con personas | Medio | Reglas conocidas: propuesta de valor en el primer vistazo, una acción principal, menos opciones, botones de 44 px | Conviene una prueba de 5 segundos con 5 personas del público objetivo |
| Costo de oportunidad: pulir no desbloquea el lanzamiento | Alto | Se dice aquí | Dominio, cuentas, revisión legal y contenido real siguen pendientes (ver `plan.md`) |
| Textos nuevos podrían parecer promesas o recomendaciones | Medio | Se reutilizan los textos existentes con condicionales («podrían») | Revisión legal pendiente, igual que antes |
| Riesgo técnico sobre la historia 3D, que es delicada | Medio | No se toca su mecánica; solo se añade texto encima, con las pruebas de la historia como red | — |

## Decisiones que necesito de ti

1. **Mayúsculas.** Navegación y botones pasan a minúsculas con inicial (más legibles); los titulares siguen en mayúsculas.
2. **Numeración.** Se quita de las secciones y de las páginas; se queda en la historia y en los apartados legales.
3. **Temas.** Se unen «Temas» y «Tus temas» en un solo bloque.
4. **Marca de agua del pie.** El «OTEA AUSTRAL» gigante se queda por ahora; se puede quitar para más limpieza.
5. **Firefox.** ¿Se acepta que no vea el efecto, o se quiere un respaldo con JavaScript?
6. **Prueba con personas.** ¿Se organiza la prueba de 5 segundos antes de abrir la lista?

## Resultado

(Se completa al terminar: métricas, capturas y lo que quedó pendiente.)
