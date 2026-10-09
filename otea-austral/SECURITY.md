# Seguridad · Otea Austral

Estado de los controles de seguridad y lo que queda pendiente. Base para la auditoría
**OWASP Top 10:2025**, prevista al cerrar el tercio 3 (ver `docs/plan.md`).

## Reportar una vulnerabilidad

Mientras no exista una dirección dedicada, abre un aviso privado de seguridad en GitHub
(_Security → Report a vulnerability_). No publiques detalles en issues abiertos.

## Controles implementados (tercio 1)

| Área | Control | Dónde |
|---|---|---|
| Inyección / XSS | CSP estricta con nonce por solicitud, `strict-dynamic`, sin `unsafe-inline` para scripts ni estilos en producción | `src/proxy.ts`, `src/lib/security/csp.ts` |
| Inyección / XSS | React escapa todo el texto; no se usa `dangerouslySetInnerHTML` | componentes |
| Enlaces | Solo `https` (se rechazan `http:`, `javascript:`, `data:`, `file:`, credenciales embebidas); doble validación: Zod al entrar y `safeHref` al renderizar | `src/lib/domain/url.ts` |
| Enlaces | `target="_blank"` siempre con `rel="noopener noreferrer"` | `AlertCard` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | CSP, `headers.ts` |
| Transporte | HSTS de 2 años con subdominios; `upgrade-insecure-requests` | `headers.ts`, CSP |
| Cabeceras | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP y CORP; sin `X-Powered-By` | `headers.ts`, `next.config.ts` |
| Integridad de datos | Esquemas Zod estrictos: campos desconocidos rechazados; la confianza no se puede escribir a mano | `src/lib/domain/schemas.ts` |
| Auditoría | Registro de solo agregar, filas congeladas, ids únicos; el actor es un alias interno (no admite correos) | `src/lib/domain/audit-log.ts` |
| Salidas | Sin peticiones salientes: `connect-src 'self'` y ningún `fetch` a terceros | CSP |
| Dependencias | Versiones exactas (`save-exact`), `npm ci` en CI, `npm audit` de producción bloqueante, Dependabot semanal | `package.json`, `.github/` |
| CI | Permisos mínimos (`contents: read`), acciones fijadas por SHA, sin credenciales persistidas | `.github/workflows/otea-austral.yml` |
| Secretos | Ninguno en el repositorio; `.env*` ignorado salvo `.env.example` | `.gitignore` |

## Pendientes

### Tercio 2 (portada completa, lista de espera, páginas públicas)

- [ ] Lista de espera: validación en servidor, honeypot, límite de solicitudes, protección CSRF de
      la Server Action (verificar `Origin`), almacenamiento mínimo y doble opt-in.
- [ ] Cookies (si se usan): `HttpOnly`, `Secure`, `SameSite=Lax` o `Strict`.
- [ ] Pruebas e2e con Playwright que fallen ante cualquier violación de CSP en consola.
- [ ] Revisar textos legales provisionales ("pendiente de revisión legal").

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
| A09 Fallas de registro y alertas | Pendiente: política de logs sin datos personales (tercio 3). |
| A10 Mal manejo de condiciones excepcionales | Página 404 propia; revisar errores 500 y mensajes en el tercio 2. |
