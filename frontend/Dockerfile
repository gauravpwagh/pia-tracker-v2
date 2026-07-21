# syntax=docker/dockerfile:1.7

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /workspace

# Install deps (cached layer when only sources change)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy sources and build
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY public public
COPY src src

# TEMPORARY WAF workaround (see docs/deployment.md § 4a): both default off; the VM release pipeline
# (infra/deploy/pc/build_waf_od.ps1) passes --build-arg to turn them on. Remove once the
# network team's WAF allows PATCH/PUT/DELETE/OPTIONS through to the VM directly.
ARG VITE_WAF_METHOD_OVERRIDE=false
ENV VITE_WAF_METHOD_OVERRIDE=$VITE_WAF_METHOD_OVERRIDE
ARG VITE_WAF_PROXY_UPLOAD=false
ENV VITE_WAF_PROXY_UPLOAD=$VITE_WAF_PROXY_UPLOAD

RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache curl

# Static SPA assets
COPY --from=build /workspace/dist /usr/share/nginx/html

# Frontend nginx config — serves the SPA with SPA fallback to index.html
COPY infra/nginx/spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost/ >/dev/null || exit 1
