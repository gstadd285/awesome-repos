# Asistente de preguntas · Otea Austral

El apartado **«Resuelve tus dudas»** de la portada (`#preguntas`) responde preguntas de las personas que visitan el sitio:
cómo funciona Otea, cómo se calcula la confianza, de dónde salen las fuentes, qué pasa con sus datos. Este documento
explica cómo está hecho, qué cuesta activar la inteligencia artificial, qué decisiones faltan y qué límites tiene.

> **En una línea:** hoy responde **gratis y sin IA** con las preguntas frecuentes del sitio. La IA (Claude, de Anthropic)
> está construida, probada contra un servidor que la imita y **apagada**: se enciende solo cuando la persona
> responsable decide el modelo, el tope de gasto y crea la clave. Es el único servicio de pago posible del proyecto
> (regla 1 de `CLAUDE.md`), así que no se activa sin su decisión.

## 1. Dos modos

| | `base` (por omisión) | `ia` (opcional) |
|---|---|---|
| Quién redacta | Las preguntas frecuentes escritas por el equipo (`conocimiento.ts`) | Un modelo de Anthropic, **usando solo** esas mismas preguntas frecuentes como contexto |
| Costo | Ninguno | Pago por uso (ver §5), con tope diario |
| Qué necesita | Nada | Clave, modelo, precios y tope (`env.ts` rechaza la configuración si falta algo) |
| Qué ve la persona | «Pregunta frecuente: …» y la respuesta tal cual | «Respuesta con IA», que llega frase por frase |
| Si falla | — | Recibe la respuesta de la base, con un aviso de por qué |
| Datos que salen del sitio | Ninguno | El texto de la pregunta (sin IP) y el contexto, hacia `api.anthropic.com` |

Un atajo de la interfaz o una pregunta idéntica a una de la base se responde **siempre** con la base, aunque la IA esté
activa: no hay motivo para pagar por una respuesta que ya está escrita.

## 2. Cómo responde (el recorrido de una pregunta)

```
navegador ──POST /api/asistente──▶ puertas ──▶ políticas ──▶ búsqueda ──▶ ¿base o IA? ──▶ respuesta (NDJSON)
                                   (HTTP)      (sin modelo)   (léxica)                      │
                                                                                IA: reserva de gasto ─▶ modelo ─▶
                                                                                revisión frase por frase ─▶ persona
                                                                                (si algo falla: la base)
```

1. **Puertas** (`manejador.ts`): `application/json`, mismo origen (`Sec-Fetch-Site` y `Origin`), 12 preguntas por minuto y
   150 por día por persona (huella SHA-256 de la IP, solo en memoria), cuerpo de hasta 8 KB, esquema estricto, pregunta
   de hasta 500 caracteres. Sin cookies, sin sesión.
2. **Políticas** (`politicas.ts`): saludo y cortesía; **datos personales** (correo, teléfono, RUT, números largos) → se pide
   reescribir y la pregunta no va a ningún proveedor; **intentos de cambiarle las instrucciones** → negativa fija;
   **pedir consejo de inversión o un pronóstico** → la respuesta fija de la base. Nada de esto llega al modelo.
3. **Búsqueda** (`recuperar.ts`): léxica y en español (sin tildes, sin palabras vacías, raíces cortas, peso por rareza).
   Si nada de la base se parece a la pregunta (puntaje < 0,4), se dice «no encontré eso» y **tampoco** se llama al modelo.
4. **Base o IA** (`servicio.ts`): sin IA, o si la pregunta es una de la base o un atajo, responde la base. Con IA:
   cupo por persona → reserva del peor caso en el tope diario → llamada → ajuste al uso real.
5. **El modelo** (`prompt.ts`, `proveedor-anthropic.ts`): ve solo el contexto recuperado (hasta 3 entradas), las dos
   preguntas anteriores de la persona y la pregunta actual, delimitados. No tiene herramientas, ni secretos, ni acceso a
   nada. Se le pide responder solo con el contexto, en unas 100 palabras y sin enlaces. Usa el SDK oficial
   (`@anthropic-ai/sdk`), sin `thinking` ni parámetros de muestreo y con `effort: "low"`.
6. **La revisión de la salida** (`salida.ts`): el texto se retiene hasta completar cada frase y solo sale si la frase pasa:
   sin lenguaje de recomendación ni promesas de rentabilidad (las mismas reglas que el sitio aplica a las alertas), sin
   enlaces ni HTML, sin cifras de dos o más dígitos que no estén en el contexto o en la pregunta, sin pistas de que
   repite sus instrucciones. Una frase rechazada corta la respuesta y se muestra la de la base. Largo máximo: 1.200 caracteres.
7. **Si algo falla** (proveedor caído, 429, clave rechazada, tiempo de 20 s, rechazo del modelo, salida no válida,
   tope agotado): la persona recibe la respuesta de la base, con una línea que explica por qué. Nunca un error técnico.
8. **Si la persona se va o pulsa «Detener»**, la conexión se cierra y la llamada al proveedor se cancela: no se sigue gastando.

El navegador lee la respuesta como NDJSON (`cliente.ts`): un evento por línea (`inicio`, `texto`, `fuentes`, `sugerencias`,
`error`, `fin`). Solo acepta enlaces del propio sitio (`/…`), aunque el servidor enviara otra cosa.

## 3. Mapa de archivos

| Qué | Dónde |
|---|---|
| Base de conocimiento (preguntas frecuentes), atajos y enlaces permitidos | `src/lib/asistente/conocimiento.ts` |
| Búsqueda, texto en español, políticas, mensajes fijos | `recuperar.ts`, `texto.ts`, `politicas.ts`, `mensajes.ts` |
| Recorrido completo y eventos | `servicio.ts`, `limites.ts` |
| Borde HTTP y ruta | `manejador.ts`, `src/app/api/asistente/route.ts`, `instancia.ts`, `modo.ts` |
| Modelo: prompt, proveedor real y proveedor de pruebas | `prompt.ts`, `proveedor.ts`, `proveedor-anthropic.ts`, `proveedor-guion.ts` |
| Revisión de la salida | `salida.ts` |
| Gasto: topes, memoria y Postgres | `presupuesto.ts`, `presupuesto-postgres.ts`, `db/migraciones/0005_asistente_uso.sql`; lo común con los borradores con IA (precios, micros, reserva del peor caso y el tope acumulado `IA_TOPE_TOTAL_USD`) en `src/lib/ia/gasto.ts` y `gasto-postgres.ts` (`presupuesto.ts` lo reexporta sin cambiar su conducta) |
| Navegador | `cliente.ts`, `src/components/asistente/AsistenteChat.tsx`, `src/components/home/Asistente.tsx` |
| Servidor que imita la API de Anthropic (pruebas) | `scripts/lib/anthropic-falso.mjs`, `scripts/anthropic-falso.mjs` |
| Configuración | `src/lib/env.ts` (`ASISTENTE_*`, `ANTHROPIC_API_KEY`), `.env.example`, `despliegue/cloud-run.yaml` |

## 4. Seguridad

Capas independientes: si una falla, la siguiente sigue en pie.

| Riesgo | Defensa |
|---|---|
| Inyección de instrucciones (el visitante intenta cambiarle el rol, sacarle el prompt o la clave) | Políticas léxicas **antes** del modelo; el texto del visitante va delimitado y se declara «dato, no instrucciones»; el modelo no tiene herramientas ni secretos, así que lo peor que puede hacer es escribir texto, que se revisa antes de mostrarse; una frase con pistas de filtración corta la respuesta |
| Datos personales enviados a un proveedor | Detección de correo, teléfono, RUT y números largos: la pregunta no se envía; aviso en la interfaz, en las condiciones y en la privacidad; las preguntas no se guardan; el SDK no registra nada |
| Lenguaje de recomendación, enlaces o cifras inventadas | Revisión frase por frase de la salida (`salida.ts`) con las mismas reglas del sitio; respaldo a la base |
| Gasto descontrolado | IA apagada por omisión; reserva del peor caso antes de cada llamada y tope diario en Postgres (atómico entre instancias; si la base falla, no se llama); cupo por persona; límites por IP; un solo reintento; tiempo máximo de 20 s; **límite de gasto en la consola de Anthropic (lo fija la persona responsable: es la barrera final)** |
| Fuga de la clave | Solo en Secret Manager; el build se hace con una clave falsa («canario») y falla si queda en `.next/`; el cliente del SDK recibe todo explícito (no lee variables del entorno) y sin registros; `ASISTENTE_URL_API_PRUEBA` solo existe con `OTEA_E2E=1` |
| Abuso del endpoint | Mismo origen, límites por minuto y por día, tamaño máximo, esquema estricto; ningún dato de la respuesta se guarda en cachés |
| Salida mostrada en la página | Solo texto (React lo escapa; el formato Markdown se limpia); los enlaces los pone el servidor desde una lista cerrada y el navegador solo acepta rutas del propio sitio |

Referencia: [OWASP Top 10 para aplicaciones con LLM](https://genai.owasp.org/llm-top-10/) (edición 2025; revisa los nombres exactos
si los citas fuera de aquí).

| OWASP LLM | Cómo se cubre |
|---|---|
| LLM01 Inyección de instrucciones | Políticas antes del modelo, contexto delimitado, sin herramientas ni secretos, salida revisada |
| LLM02 Divulgación de información sensible | El modelo solo ve texto público; las preguntas con datos personales no se envían; nada se guarda |
| LLM05 Manejo inadecuado de la salida | Texto plano, revisado frase por frase, enlaces solo desde una lista cerrada, React escapa |
| LLM06 Agencia excesiva | No tiene herramientas ni acciones: solo devuelve texto |
| LLM07 Filtración del prompt del sistema | El prompt no contiene secretos (es público en el repositorio); aun así se corta la respuesta si parece repetirlo |
| LLM09 Desinformación | Responde solo con la base; etiqueta «Respuesta con IA» y aviso de que puede equivocarse; ofrece las páginas de la fuente |
| LLM10 Consumo sin límites | Topes de gasto, de llamadas, por persona y por IP; tiempo y tokens máximos; cancelación al cerrar la conexión |

## 5. Costos reales

> **Tope acumulado de toda la IA (desde F5, opcional).** `IA_TOPE_TOTAL_USD` (≤ 40, sin valor por omisión: decisión de la dueña,
> `alertas-reales.md` §11) limita lo gastado por el asistente **y** por los borradores desde el primer día, sumado en la base
> (`asistente_uso` + `borradores_uso`). Si se fija, va en los dos servicios: cada reserva del asistente corre entonces en una
> transacción con un candado (`pg_advisory_xact_lock`) y no pasa si la suma más el peor caso supera el tope; sin la base, no hay IA.
> Sin la variable, la reserva del asistente es la de siempre (una sentencia).

La IA se cobra por uso: dólares por millón de tokens (MTok), de entrada y de salida. **Precios según la documentación
de la API consultada el 11 de octubre de 2026; confírmalos en la página de precios de Anthropic antes de fijarlos**: el
valor que cuenta es el que pongas en `ASISTENTE_PRECIO_ENTRADA` y `ASISTENTE_PRECIO_SALIDA`.

Lo que gasta una respuesta (medido sobre el prompt real; ver supuestos abajo):

| Modelo (`ASISTENTE_MODELO`) | Entrada / salida por MTok | Una respuesta típica | 1.000 respuestas | Peor caso de una llamada (lo que se reserva) |
|---|---|---|---|---|
| `claude-haiku-5-5` | US$ 0,10 / US$ 0,50 | ≈ US$ 0,0004 | ≈ US$ 0,40 | ≈ US$ 0,0008 |
| `claude-sonnet-5-5` | US$ 2 / US$ 10 | ≈ US$ 0,008 | ≈ US$ 8 | ≈ US$ 0,015 |
| `claude-opus-5-5` | US$ 4 / US$ 20 | ≈ US$ 0,016 | ≈ US$ 16 | ≈ US$ 0,030 |

_Supuestos:_ entrada ≈ 1.500 tokens (las instrucciones, hasta tres preguntas frecuentes de contexto y la pregunta: 1.100 a
1.500 con el estimador conservador de la aplicación); salida ≈ 500 tokens (la respuesta de unas 100 palabras más el
razonamiento de esfuerzo bajo); el peor caso reserva la entrada estimada por lo alto y 1.200 tokens de salida. Haiku usa un
tokenizador que cuenta algo más de tokens por el mismo texto (la aplicación estima por lo alto). Son estimaciones, no
mediciones con la API real: la medición real la hace `npm run asistente:probar` (ver §7).

Qué significa para el presupuesto del proyecto (unos US$ 40 en total, regla 1):

- Con **Haiku**, incluso 10.000 respuestas al mes cuestan unos US$ 4: cabe de sobra.
- Con **Sonnet** o **Opus**, 1.000 respuestas ya cuestan 8 o 16 dólares: es el 20 % o el 40 % del presupuesto total del
  proyecto por mil respuestas. Para una base de 30 preguntas frecuentes, no se justifica.
- **Recomendación:** `claude-haiku-5-5`, tope diario de **US$ 0,30** (como máximo ≈ US$ 9 al mes aunque alguien
  intentara agotarlo) y los cupos por omisión (300 respuestas por día, 30 por persona). Es una recomendación: el tope lo
  decide la persona responsable.
- El tope diario y el límite de la consola de Anthropic son dos barreras distintas: el primero lo cuenta la aplicación; el
  segundo, Anthropic. Fija **los dos**.

## 6. Privacidad

- La pregunta se usa solo para responder y **no se guarda**: ni en la base, ni en los registros de la aplicación (que solo
  anotan la categoría: `ia`, `sin_respuesta`, `negativa` o `degradada`). El proveedor de alojamiento registra la solicitud
  (IP y agente de usuario, 30 días) pero no su cuerpo.
- Con IA activa, el texto de la pregunta y el contexto viajan a Anthropic (**sin la IP** de la persona). Cuánto tiempo los
  conserva Anthropic lo fijan sus condiciones y su configuración de la cuenta: **confírmalo antes de activar la IA** y
  anótalo en la política de privacidad (`src/app/privacidad/page.tsx` ya avisa que se confirmarán su región y sus
  condiciones).
- Los textos legales (condiciones de uso, privacidad, aviso legal) son provisionales y están pendientes de revisión
  legal; el cambio por la IA se agregó en el mismo estado.

## 7. Cómo activar la IA (checklist para la persona responsable)

Nada de esto se hace sin su decisión. Los comandos están en `docs/despliegue.md`, sección 11.

- [ ] **Modelo:** recomendado `claude-haiku-5-5` (§5).
- [ ] **Tope de gasto diario** (recomendado US$ 0,30) y, si quiere, de llamadas por día y por persona.
- [ ] **Clave de API** creada en la consola de Anthropic, guardada en Secret Manager (`otea-anthropic-api-key`).
- [ ] **Límite de gasto mensual en la consola de Anthropic** (la barrera final).
- [ ] **Verificación en dos pasos** en esa cuenta (`docs/guia-dos-pasos.md`).
- [ ] **Condiciones de Anthropic** leídas (retención de datos, regiones) y reflejadas en la política de privacidad.
- [ ] **Revisión legal** de las condiciones de uso y de la política de privacidad.
- [ ] **Migración `0005`** aplicada (`npm run db:migrar`).
- [ ] **Prueba con la API real**: `npm run asistente:probar` (gasta centavos; imprime respuesta, uso y costo de verdad).
- [ ] **Despliegue** de una revisión sin tráfico, con el bloque del asistente descomentado; prueba manual; tráfico.
- [ ] **Vigilancia** los primeros días (eventos `asistente` en Cloud Logging; gasto en la consola de Anthropic).

**Apagarla:** `ASISTENTE_MODO=base` (el asistente sigue respondiendo, gratis, con las preguntas frecuentes).

## 8. Pruebas: qué se probó y qué no

| Qué | Dónde | Contra qué |
|---|---|---|
| Búsqueda: 86 preguntas con la respuesta esperada y 23 fuera de tema | `recuperar.test.ts` | Datos reales de la base |
| Políticas, salida, prompt, presupuesto, servicio, manejador, cliente | `*.test.ts` de `src/lib/asistente/` | Proveedor de guion (sin red) |
| El SDK oficial de Anthropic, de punta a punta | `proveedor-anthropic.test.ts`, `integracion.test.ts` | **Servidor que imita la API** (flujo de eventos SSE, errores 401/429/500, cortes, rechazos, cancelación) |
| Gasto en Postgres, incluidas 60 reservas simultáneas | `presupuesto-postgres.test.ts` | Postgres real (3 pools: exactamente las que caben) |
| Interfaz | `AsistenteChat.test.tsx`, `Asistente.test.tsx` | jsdom: teclado, lectores de pantalla (roles y `aria-busy`), errores, reintento, «Detener» |
| Recorrido en el navegador, modo base | `e2e/asistente.spec.ts` | Build de producción: portada, teclado, sin JavaScript, móvil, contrato de la API y límites |
| Recorrido en el navegador, modo IA | `e2e/asistente-ia.spec.ts` | Segunda instancia + servidor que imita la API: qué recibe el «proveedor» y **qué no** (datos personales, manipulación, consejos), caídas, rechazo, texto prohibido y enlaces que no llegan al navegador, cancelación al pulsar «Detener» |
| Reglas de arquitectura y secretos | `arquitectura.test.ts`, `canarios.test.ts`, escáner de secretos | Código y build |
| **La API real de Anthropic** | `real.test.ts` (`npm run asistente:probar`) | **No se ha corrido**: gasta dinero y necesita la clave de la persona responsable |

**Lo que NO está probado:** que la clave y el modelo que elija la persona responsable funcionen con la API real (lo comprueba
`npm run asistente:probar`); la calidad de las respuestas del modelo real (el servidor falso repite el contexto, un modelo
real parafrasea); el comportamiento de los filtros de la salida con respuestas reales (pueden cortar más de la cuenta:
sería visible como avisos de «salida»); los lectores de pantalla reales (se probaron roles y atributos, no NVDA ni VoiceOver).

## 9. Límites conocidos

- **La búsqueda es léxica**, no semántica: encuentra por palabras. Una pregunta con una sola palabra en común puede recibir
  una respuesta que no corresponde (por ejemplo, «¿qué película me recomiendas?» encuentra la pregunta frecuente sobre
  recomendaciones de inversión, y la respuesta lo deja claro con su etiqueta «Pregunta frecuente: …»). Una pregunta bien
  formulada pero con otras palabras puede no encontrar nada. Las políticas también son léxicas: no detectan todo.
- **Sabe lo que dice la base y nada más** (30 preguntas). La IA no amplía lo que sabe: solo redacta mejor y puede combinar
  hasta tres entradas. Lo que no está en la base, no lo responde.
- **Solo español.**
- **No guarda preguntas**, por privacidad: no hay forma de saber qué preguntan las personas ni qué no se responde, salvo
  contar categorías en los registros. Si se quiere mejorar la base con datos reales, hay que decidir una forma de medirlo
  que respete la política de privacidad.
- **Los límites por persona en memoria valen por instancia** (como los demás límites por IP del sitio); lo que no puede
  depender de la memoria —el tope de gasto— está en la base.
- **El tope diario cuenta en hora de Chile** y usa los precios que se configuran: si Anthropic cambia sus precios y nadie
  actualiza las variables, el tope contará mal (por eso existe además el límite de la consola).
- La integración con la API real no se ha ejercitado (ver §8).

## 10. Revisión crítica: lo que se puede decir en contra

- **«Con 30 preguntas no hace falta un modelo.»** Tiene razón: el modo base ya responde casi todo, gratis y sin riesgo.
  La IA aporta paráfrasis, preguntas de seguimiento y combinar dos entradas; no aporta conocimiento. Por eso **la IA
  queda apagada** y se decide con datos reales de uso; no hay urgencia.
- **«Un modelo puede decir algo equivocado con aplomo.»** Cierto. Las defensas reducen el riesgo (solo el contexto,
  salida revisada, sin cifras ni enlaces nuevos, etiqueta de IA), pero no garantizan que parafrasee con fidelidad. Para
  un sitio cuyo valor es la confianza en lo que dice, es un riesgo de reputación real y es otra razón para esperar.
- **«Es un servicio de pago dentro de un proyecto de 40 dólares.»** Por eso se activa solo con una decisión explícita, con
  tope diario, límite en la consola y la opción más barata como recomendación.
- **«Se envían preguntas de personas a un tercero.»** Solo con la IA activa, sin la IP y avisándolo en la interfaz y en los
  textos legales; las preguntas con datos personales nunca se envían. Aun así, requiere la revisión legal pendiente.
- **«La búsqueda léxica falla con palabras raras.»** Sí (ver §9); es el precio de no depender de un servicio de embeddings
  (otro costo y otro proveedor). Se puede mejorar agregando etiquetas a la base cuando se vean casos reales.
- **«Dos instancias, dos cupos.»** Cierto para los límites por persona; el gasto, no.

## 11. Decisiones pendientes

1. **¿Se activa la IA ahora, o se espera a ver el uso del modo base?** (Recomendado: esperar.)
2. Si se activa: modelo, tope diario y cupos (§5), y crear la clave con límite mensual en la consola.
3. Revisión legal de privacidad y condiciones de uso, incluida la parte de Anthropic.
4. Si más adelante se quiere medir qué preguntan las personas: cómo, sin comprometer la privacidad.
