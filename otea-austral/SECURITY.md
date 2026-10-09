# Seguridad · Otea Austral

Estado de los controles de seguridad y lo que queda pendiente. El programa sigue el **NIST
Cybersecurity Framework (CSF) 2.0** y se prepara para una auditoría **OWASP Top 10:2025** al cerrar
el tercio 3 (ver `docs/plan.md`).

## Reportar una vulnerabilidad

Usa el canal publicado en [`/.well-known/security.txt`](https://oteaustral.com/.well-known/security.txt)
o en la página `/seguridad`. Mientras no exista una dirección dedicada, es el formulario privado de
GitHub (_Security → Report a vulnerability_), que la persona responsable debe tener **activado**. No
publiques detalles en issues abiertos.

## Marco NIST CSF 2.0

- **Perfil** (fuente única, con estado y evidencia de cada control): `src/lib/security/nist-csf.ts`,
  publicado en `/seguridad`. Una prueba verifica que toda evidencia citada exista.
- **Gobernar e Identificar** (política, apetito de riesgo, roles, proveedores, datos, riesgos):
  [`docs/seguridad/programa.md`](docs/seguridad/programa.md).
- **Responder y Recuperar** (criterios, gravedad, contención, comunicación, recuperación):
  [`docs/seguridad/respuesta-incidentes.md`](docs/seguridad/respuesta-incidentes.md).
- Nivel de implementación: 1 (Parcial) estimado hoy; **objetivo** 2 (Informado por el riesgo).
- Autoevaluación: el NIST no certifica organizaciones. Nunca presentarlo como certificación.

## Controles implementados

| Área | Control | Dónde |
|---|---|---|
| Inyección / XSS | CSP estricta con nonce por solicitud, `strict-dynamic`, sin `unsafe-inline` para scripts ni estilos en producción | `src/proxy.ts`, `src/lib/security/csp.ts` |
| Inyección / XSS | React escapa todo el texto. `dangerouslySetInnerHTML` solo para los datos estructurados JSON-LD de la portada: contenido fijo, con `<` escapado y nonce | componentes, `src/app/page.tsx` |
| Enlaces | Solo `https` (se rechazan `http:`, `javascript:`, `data:`, `file:`, credenciales embebidas); doble validación: Zod al entrar y `safeHref` al renderizar | `src/lib/domain/url.ts` |
| Enlaces | `target="_blank"` siempre con `rel="noopener noreferrer"` | `AlertCard` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | CSP, `headers.ts` |
| Transporte | HSTS de 2 años con subdominios; `upgrade-insecure-requests` | `headers.ts`, CSP |
| Cabeceras | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP y CORP; sin `X-Powered-By` | `headers.ts`, `next.config.ts` |
| Integridad de datos | Esquemas Zod estrictos: campos desconocidos rechazados; la confianza no se puede escribir a mano | `src/lib/domain/schemas.ts` |
| Auditoría | Registro de solo agregar, filas congeladas, ids únicos; el actor es un alias interno (no admite correos) | `src/lib/domain/audit-log.ts` |
| Salidas | Sin peticiones salientes: `connect-src 'self'` y ningún `fetch` a terceros | CSP |
| Lista de espera | Server Action con protección CSRF de Next.js (`Origin` vs `Host`), validación Zod en el servidor, campo trampa, límite de 5 intentos por IP cada 10 min (IP cifrada con SHA-256, solo en memoria) y tope global; respuestas que no revelan si un correo ya estaba; doble opt-in con token aleatorio de 256 bits del que solo se guarda el hash; datos mínimos (correo, fecha, versión del consentimiento) | `src/lib/waitlist/`, `src/app/acciones/` |
| Configuración | `WAITLIST_MODE=cerrada` por defecto; el esquema de entorno rechaza la lista en memoria en producción | `src/lib/env.ts` |
| Pruebas | 42 pruebas de navegador en CI: sin errores de consola ni violaciones de CSP, cabeceras, teclado, movimiento reducido, lista de espera, enlaces seguros | `e2e/` |
| Detección | Reportes de violación de la CSP (`report-uri` y `report-to`) a `/api/csp-report`: tipo de contenido, tamaño (16 KB) y volumen (60/min por instancia) limitados; se registra solo directiva, origen y ruta | `src/lib/security/csp-report.ts` |
| Registros | Eventos de seguridad en JSON con saneamiento: sin correos, IP, tokens, parámetros de URL ni saltos de línea | `src/lib/security/log.ts` |
| Divulgación | `/.well-known/security.txt` (RFC 9116) con `Expires`; una prueba falla si vence | `src/lib/security/security-txt.ts` |
| Cadena de suministro | Verificación de firmas del registro npm (`npm audit signatures`) y SBOM CycloneDX como artefacto de cada CI | `.github/workflows/otea-austral.yml` |
| Dependencias | Versiones exactas (`save-exact`), `npm ci` en CI, `npm audit` de producción bloqueante, Dependabot semanal | `package.json`, `.github/` |
| CI | Permisos mínimos (`contents: read`), acciones fijadas por SHA, sin credenciales persistidas | `.github/workflows/otea-austral.yml` |
| Secretos | Ninguno en el repositorio; `.env*` ignorado salvo `.env.example` | `.gitignore` |

## Pendientes

### Tercio 2 (sitio público)

- [x] Lista de espera: validación en servidor, campo trampa, límite de solicitudes, CSRF de la
      Server Action, datos mínimos y doble opt-in (lógica lista; abre con base de datos y correo).
- [x] Pruebas e2e con Playwright que fallan ante errores de consola, incluidas violaciones de CSP.
- [ ] Revisar con asesoría legal los textos provisionales (privacidad, términos, aviso legal,
      metodología).
- [ ] Cookies (si algún día se usan): `HttpOnly`, `Secure`, `SameSite=Lax` o `Strict`.
- [ ] El límite por IP depende de que la plataforma de alojamiento fije `X-Forwarded-For`;
      confirmarlo al elegirla.

### Tercio 3 (persistencia y panel interno)

- [ ] **Panel `/admin` protegido.** Mientras no haya autenticación completa: secreto en variable de
      entorno, comparación en tiempo constante, límite de intentos, cookie de sesión firmada y
      CSRF en todas las acciones. **Nunca exponer el panel sin protección.**
- [ ] Base de datos con mínimos privilegios: el usuario de la aplicación solo con `INSERT`/`SELECT`
      sobre `alert_audit`, más un disparador que rechace `UPDATE` y `DELETE`.
- [ ] Consultas parametrizadas exclusivamente.
- [ ] Cambios de fuentes en alertas publicadas deben pasar por el mismo flujo de corrección.
- [ ] Registros (logs) sin datos personales; revisar qué registra la plataforma de despliegue.
- [ ] SSRF (si algún día se hace `fetch` de URLs): lista de dominios permitidos tomada del registro
      de fuentes, tiempo límite, tamaño máximo y sin redirecciones a otros dominios.

### Acciones de la persona responsable (no se resuelven con código)

- [ ] Activar **Private vulnerability reporting** en GitHub (Settings → Security), o definir
      `SECURITY_CONTACT` con un correo propio cuando exista el dominio.
- [ ] Verificación en dos pasos en GitHub, alojamiento, registrador del dominio y correo, con códigos
      de respaldo fuera de línea.
- [ ] Renovar `Expires` de `security.txt` antes del 2027-04-01.

### Decisiones y riesgos conocidos

- **CSP con nonce ⇒ renderizado dinámico.** Cada página se genera por solicitud
  (`cacheComponents: false`, `connection()` en el layout). Más costo de servidor que una página
  estática, pero dentro de los planes gratuitos para el tráfico esperado. Alternativa futura: SRI
  (experimental en Next.js) para volver a páginas estáticas.
- **HSTS sin `preload`** hasta comprar y fijar el dominio definitivo.
- **`npm audit` de desarrollo:** `eslint-config-next` arrastra `fast-glob → micromatch → braces`
  con un aviso alto (DoS por patrones anidados) sin corrección publicada. Solo afecta al lint local
  y a la CI, no al código que se despliega. La CI lo muestra sin bloquear; revisar cuando
  Dependabot proponga la actualización.
- **Trusted Types** no está activado: requiere comprobar compatibilidad con Next.js.
- **Vercel Hobby** no permite uso comercial. Si Otea Austral cobra o es un negocio, preferir
  Cloudflare (Workers/Pages, plan gratuito) o confirmar condiciones antes de desplegar.

## Preparación para OWASP Top 10:2025

| Categoría | Estado |
|---|---|
| A01 Control de acceso roto | Pendiente: panel `/admin` (tercio 3). Hoy no hay rutas privadas. |
| A02 Configuración de seguridad incorrecta | Cabeceras y CSP aplicadas y probadas. |
| A03 Fallas en la cadena de suministro de software | Versiones fijas, lockfile, `npm ci`, auditoría y Dependabot; acciones de CI fijadas por SHA. |
| A04 Fallas criptográficas | Solo HTTPS (HSTS). Sin secretos ni cifrado propio todavía. |
| A05 Inyección | Escapado de React, CSP estricta, validación Zod. Sin SQL todavía. |
| A06 Diseño inseguro | Reglas de verificación como funciones puras con pruebas; auditoría inmutable. |
| A07 Fallas de autenticación | Pendiente (tercio 3). |
| A08 Fallas de integridad de software o datos | Esquemas estrictos; confianza calculada, no editable. |
| A09 Fallas de registro y alertas | Registro de eventos de seguridad sin datos personales y reportes de CSP; falta revisión periódica y alertas de la plataforma. |
| A10 Mal manejo de condiciones excepcionales | Página 404 propia; revisar errores 500 y mensajes en el tercio 2. |
