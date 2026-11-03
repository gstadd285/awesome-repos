# Rutina diaria de la dueña

Qué mirar en `/admin` cada mañana, cuánto toma y qué hacer si algo falla. Los tiempos son **estimados**: se miden la primera
semana del lanzamiento privado y se corrigen aquí. Si un día no hay tiempo, no pasa nada: los borradores esperan y **nada se
publica solo**.

## Cada mañana (15–45 min)

| Paso | Dónde | Qué miras | Tiempo |
|---|---|---|---|
| 1 | `/admin` → **Avisos de operación** | Si dice «Sin avisos de operación», sigue al paso 2. Si no, resuelve cada aviso con la tabla de abajo | 1–2 min |
| 2 | `/admin` → **Ingesta**, **Gasto de la IA**, **Resumen diario** | Última corrida «Correcta» (de la última hora); gasto del mes bajo el 80 % del tope; resúmenes de hoy enviados, ninguno «sin salir» | 1 min |
| 3 | `/admin/eventos` | Por cada borrador: abre sus fuentes, comprueba hechos y cifras contra el documento, corrige con tus palabras y **acepta**; descarta lo irrelevante con un motivo | 3–5 min por borrador; segundos por descarte |
| 4 | `/admin/alertas/[id]` | Lo aceptado: enviar a revisión → aprobar → **publicar** (una alerta de impacto alto exige dos organismos distintos y tu aprobación después de la última edición) | 1 min por alerta |
| 5 | `/alertas` con tu cuenta de prueba | Que lo publicado se vea bien y sin errores de redacción. Si algo está mal: corrígelo en el panel (queda la corrección pública) o retráctalo | 2 min |

El resumen diario sale a las **07:41** (hora de Chile) con lo publicado desde el anterior: lo que publiques después llega al día siguiente.

## Una vez por semana (10 min)

- **Consola de Anthropic**: el gasto del espacio de trabajo «Otea · borradores» coincide con el del tablero y no se acerca a US$ 5.
- **Correo de alertas de Google Cloud** (Monitoring): ninguna alerta de «sin corridas» ni de accesos fallidos al panel sin explicar.
- **`/admin/invitaciones`**: invitaciones por vencer o que nadie usó (revócalas si ya no corresponden).
- **Resend**: correos rebotados o marcados como spam (en su panel). Un rebote repetido es una cuenta con un correo que ya no existe.

## Si algo falla

| Aviso o síntoma | Qué significa | Qué hacer |
|---|---|---|
| «La ingesta no corre hace más de 3 horas» | El trabajo de Cloud Scheduler no llama a `otea-tareas`, o el servicio falla al arrancar | Cloud Scheduler → `otea-ingesta`: ¿pausado o con errores? Cloud Run → `otea-tareas` → Registros. Ejecutarlo a mano: `gcloud scheduler jobs run otea-ingesta --location $REGION` (`despliegue.md` §13) |
| «La última corrida de la ingesta falló» | La base no respondió o se cortó el plazo | Mira los registros (`jsonPayload.tipo="tarea"`). Si se repite en la siguiente hora, revisa Neon (estado y cuota) |
| «N feeds en pausa o con fallos» | Un sitio falló 3 veces seguidas o su `robots.txt` lo prohíbe | Nada que hacer de inmediato: la pausa vence sola a las 24 h. Si el código es `robots_prohibido`, **no lo fuerces** (el sitio pidió que no lo leamos) |
| «N feeds sin ítems nuevos en 14 días» | La dirección del feed pudo cambiar | Abre la página de la fuente; si el feed cambió, se corrige en `data/sources.seed.json` (commit e imagen nueva) |
| «El gasto pasó el 80 % del tope del mes» | Muchos borradores este mes | Sigue igual: al llegar al tope ya no se llama al modelo y la cola sigue a mano. Para cortar ya: `BORRADORES_MODO=apagado` (§14) |
| «N resúmenes no salieron hoy» | Resend rechazó o no respondió | Panel de Resend (clave vigente, dominio verificado, cuota). No se reintentan el mismo día: mañana esas cuentas reciben todo lo pendiente |
| «El resumen diario no corrió en el último día» | El trabajo `otea-resumen` no llamó | Cloud Scheduler → `otea-resumen`; ejecutarlo a mano: `gcloud scheduler jobs run otea-resumen --location $REGION` (`despliegue.md` §16) |
| `/admin` responde 404 | Faltan las variables del panel o la base | Cloud Run → `otea-austral` → la última revisión; `/api/salud` dice si la configuración es inválida (§7) |
| Algo raro o un posible incidente de seguridad | — | `docs/seguridad/respuesta-incidentes.md`. Para apagar todo lo nuevo de una vez: `despliegue.md` §17, «Apagar de inmediato» |
