# Lista de verificación del lanzamiento privado

Lo que **solo la dueña** puede hacer antes de invitar a las primeras personas: cuentas, claves, dinero, dominio, abogado y fuentes.
El código está listo y apagado (alertas reales F2 a F6, [`alertas-reales.md`](alertas-reales.md)); los pasos técnicos de cada
casilla están en [`despliegue.md`](despliegue.md) (§17 resume el orden). Marca cada casilla cuando esté hecha.

## Cuentas y dinero

- [ ] **Google Cloud**: proyecto, cuenta de facturación con **presupuesto y alertas de US$ 40** (obligatorio aunque haya cuota gratuita),
      verificación en dos pasos en la cuenta de Google (`despliegue.md` §0 y §4).
- [ ] **Neon**: base de producción, rol dueño y usuario de la aplicación (`npm run db:rol-app`); conexión con `sslmode=verify-full` (§1).
- [ ] **Resend**: cuenta, dominio verificado (SPF y DKIM) y clave (§2). Decidir el **reparto de los 100 correos al día** (por omisión
      50 lista + 20 cuentas + 30 resumen; decisión 6 de `alertas-reales.md` §11).
- [ ] **Anthropic** (solo si se activan los borradores con IA): espacio de trabajo propio con **límite de gasto de US$ 5 al mes**, su
      clave y verificación en dos pasos (decisión 4). Correr `npm run borradores:probar` con esa clave (costo ≤ US$ 0,004).
- [ ] **Tope acumulado de toda la IA** (`IA_TOPE_TOTAL_USD`, sugerencia US$ 15) o decidir no fijarlo (decisión 2).
- [ ] **Mercado Pago** (solo si se activan los aportes): el link de pago propio (`despliegue.md` §15).

## Claves y secretos (se generan una vez y se guardan en el gestor de contraseñas y en Secret Manager)

- [ ] Panel: `npm run admin:credenciales` (frase, código TOTP en tu app y secretos de sesión) (§3).
- [ ] `CUENTAS_SECRETO` (`npm run cuentas:secreto`), con **copia fuera de línea**: hoy no se puede rotar (§12).
- [ ] `WAITLIST_SECRETO` (`npm run lista:secreto`) si se abre la lista de espera (§3).
- [ ] `TAREAS_SECRETO` y las cuentas de servicio `sa-tareas` y `sa-programador` (§13).
- [ ] Correo **de rol** para `INGESTA_CONTACTO` (p. ej. `ingesta@…`), que viaja en cada solicitud a las fuentes (decisión 5).

## Dominio

- [ ] Comprar `oteaustral.com` (~US$ 12 al año) y mapearlo a Cloud Run (§8); `NEXT_PUBLIC_SITE_URL` con esa URL https.
- [ ] Revisar que `security.txt` y `SECURITY_CONTACT` apunten a un canal que lees (vence el 2027-04-01).

## Abogado

- [ ] Revisión de la **política de privacidad** y las **condiciones de uso** (hoy borradores `2026-10-borrador-6`); al aprobarlas, subir
      `VERSION_TEXTOS` y `VERSION_CONSENTIMIENTO` a la vez y quitar el aviso de «texto provisional».
- [ ] Recorrer la **lista para el abogado** de `alertas-reales.md` §9: metadatos de las fuentes, envío transitorio a un proveedor de IA,
      Ley 21.521 (Fintec) y CMF (¿asesoría?), datos personales (Ley 19.628 y 21.719), **resumen por correo** (consentimiento y baja),
      acceso por invitación y condiciones de Anthropic.

## Fuentes

- [ ] **Verificar al menos un feed** (que responde, su dominio, sus condiciones completas «Verificadas el …») en
      `data/sources.seed.json`, o permitir los dominios en el entorno para verificarlos (decisión 1). Sin esto la ingesta no lee nada.
- [ ] Decidir qué fuentes reciben `lectura_ia: true`, después de leer sus condiciones y la opinión del abogado (decisión 3). Sin ninguna,
      los borradores con IA no llaman al modelo.

## Encender y probar (con todo lo anterior hecho)

- [ ] Migraciones `0007` a `0011` aplicadas, en orden (`despliegue.md` §17).
- [ ] `CUENTAS_MODO=invitacion` en el sitio y los primeros **códigos emitidos** en `/admin/invitaciones` (decisión 7).
- [ ] `otea-tareas` desplegado y los trabajos `otea-ingesta` y `otea-resumen` creados; una corrida a mano de cada uno, con éxito.
- [ ] Alertas de Cloud Monitoring creadas (ingesta sin corridas en 3 h; accesos fallidos al panel) con tu correo como canal.
- [ ] Prueba de punta a punta con **tu propia cuenta invitada**: entrar, elegir temas, publicar una alerta, verla en `/alertas`, recibir
      el resumen y darte de baja con un clic.
- [ ] Una semana de la [rutina diaria](rutina-diaria.md) para medir los tiempos reales y corregirlos en ese documento.
