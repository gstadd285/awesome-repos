# syntax=docker/dockerfile:1
#
# Imagen de Otea Austral para Google Cloud Run.
#
# - Una sola imagen sirve a cualquier entorno: la configuración (URL del sitio,
#   base de datos, claves) llega como variables de entorno al ejecutar, nunca al
#   construir. Ningún secreto entra a las capas.
# - Etapas: dependencias → compilación → ejecución. La imagen final solo lleva la
#   salida `standalone` de Next.js, sin npm, sin código fuente y sin dependencias
#   de desarrollo.
# - Corre sin privilegios (UID 10001) y escucha en $PORT (Cloud Run fija 8080).
# - Base fijada por digest (versión de Node de .nvmrc, Alpine 3.23). Dependabot
#   propone las actualizaciones (ecosistema docker).

FROM node:22.22-alpine3.23@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── Dependencias (versiones exactas del lockfile; sin scripts de instalación) ──
FROM base AS dependencias
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# ── Compilación ────────────────────────────────────────────────────────────────
FROM base AS compilacion
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build \
    # Sin `next/image` (ver next.config.ts) `sharp` no se usa: sus 46 MB de binarios nativos
    # entran por el trazado del servidor de Next.js y no se pueden excluir por ruta.
    && rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img

# ── Ejecución ──────────────────────────────────────────────────────────────────
FROM base AS ejecucion
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 10001 otea && adduser -S -u 10001 -G otea -H -s /sbin/nologin otea

# `npm run build` deja en `.next/standalone` el servidor, `public/` y `.next/static/` (ver
# scripts/preparar-standalone.mjs).
COPY --from=compilacion --chown=10001:10001 /app/.next/standalone ./

USER 10001:10001
EXPOSE 8080
CMD ["node", "server.js"]
